#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkInventory, refreshInventory } from './skill-inventory.mjs';
import { readFoundation, materializeFoundation } from '../src/foundation-release.mjs';
import { digest, canonical } from '../src/content.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
function privateMetadata(value, id, owner, parent) {
  need(value?.id === id && (parent ? value.shared === false : value.mime_type === 'application/vnd.google-apps.folder' && [false, null].includes(value.shared)), 'Private exact identity required');
  need(Array.isArray(value.permissions) && value.permissions.length === 1 && value.permissions[0].type === 'user' && value.permissions[0].role === 'owner' && value.permissions[0].emailAddress === owner, 'Owner-only permission readback required');
  if (parent) need(canonical(value.parent_ids) === canonical([parent]), 'Exact private parent required');
}

async function inventory(release, bindings, snapshot, runtime) {
  await materializeFoundation(release, runtime, 'runtime');
  const before = await checkInventory(runtime);
  need(before.snapshot === snapshot, 'Reviewed snapshot differs');
  const original = await readFile(join(runtime, 'registry/skills.json'));
  const refreshed = await refreshInventory(runtime, bindings);
  need(refreshed.snapshot === snapshot && (await readFile(join(runtime, 'registry/skills.json'))).equals(original), 'Inventory changed; source review required');
  const reads = [];
  const index = JSON.parse(original);
  for (const file of index.files) {
    const bytes = await readFile(join(runtime, 'vendor/skills', index.snapshot, file.path));
    need(digest(bytes) === file.sha256 && bytes.length === file.bytes, 'Selected guidance differs');
    reads.push({ path: file.path, bytes: bytes.length, sha256: file.sha256 });
  }
  for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    const bytes = await readFile(join(runtime, path));
    reads.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  }
  return { before, reads };
}

function cloudRead(cloud, capture, now) {
  const age = now.getTime() - Date.parse(capture.observedAt);
  need(Number.isFinite(age) && age >= 0 && age <= 900000, 'Fresh cloud observation required');
  privateMetadata(capture.parent, cloud.parentId, cloud.owner);
  privateMetadata(capture.file, cloud.fileId, cloud.owner, cloud.parentId);
  need(capture.file.mime_type === 'application/json' && Number(capture.file.size) === cloud.bytes, 'Complete raw capsule metadata required');
}

export async function refreshPrivateSkills(config, capture, attempt, now = new Date()) {
  await mkdir(attempt, { mode: 0o700 });
  const startedAt = now.toISOString();
  await writeFile(join(attempt, 'request.json'), json({ config, capture, startedAt }), { flag: 'wx', mode: 0o600 });
  try {
    need(config.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(config.revision) && /^[a-f0-9]{64}$/.test(config.snapshot), 'Pinned source configuration required');
    need(config.consumer?.fileId === config.cloud.fileId && config.consumer?.sha256 === config.cloud.sha256 && config.consumer?.revision === config.revision && config.consumer?.snapshot === config.snapshot, 'Accepted consumer binding required');
    cloudRead(config.cloud, capture, now);
    const release = await readFoundation(config.capsulePath, config.cloud.sha256);
    need(release.revision === config.revision && release.distribution === 'runtime', 'Reviewed complete runtime required');
    const localBytes = await readFile(config.capsulePath);
    const remoteBytes = await readFile(capture.rawPath);
    need(localBytes.length === config.cloud.bytes && remoteBytes.length === config.cloud.bytes && digest(remoteBytes) === config.cloud.sha256, 'Complete cloud raw hash differs');
    need(localBytes.equals(remoteBytes), 'Cloud raw bytes differ');
    const { before, reads } = await inventory(release, config.bindings, config.snapshot, join(attempt, 'runtime'));
    const result = { status: 'complete', operation: 'unchanged', startedAt, sourceObservedAt: before.observedAt, cloudObservedAt: capture.observedAt, revision: release.revision, snapshot: config.snapshot, cloud: config.cloud, consumer: config.consumer, reads, remoteWrite: false, registration: 'unverified' };
    await writeFile(join(attempt, 'result.json'), json(result), { flag: 'wx', mode: 0o600 });
    return result;
  } catch (error) {
    await writeFile(join(attempt, 'result.json'), json({ status: 'held', startedAt, error: error.message, remoteWrite: false, selectionChanged: false }), { flag: 'wx', mode: 0o600 });
    throw error;
  }
}

export async function preparePrivateCandidate(config, capture, candidate, attempt, now = new Date()) {
  await mkdir(attempt, { mode: 0o700 });
  await writeFile(join(attempt, 'candidate.json'), json(candidate), { flag: 'wx', mode: 0o600 });
  await refreshPrivateSkills(config, capture, join(attempt, 'accepted'), now);
  need(typeof candidate.approvalRef === 'string' && candidate.approvalRef.length > 0, 'Independent source approval reference required');
  const release = await readFoundation(candidate.path, candidate.sha256);
  need(release.revision === candidate.revision && release.distribution === 'runtime', 'Approved candidate revision required');
  const bytes = await readFile(candidate.path);
  need(bytes.length === candidate.bytes, 'Candidate raw byte count differs');
  await inventory(release, config.bindings, candidate.snapshot, join(attempt, 'candidate-runtime'));
  const unchanged = candidate.sha256 === config.cloud.sha256;
  const request = { status: unchanged ? 'unchanged' : 'awaiting-upload', accepted: config.cloud, acceptedConsumer: config.consumer, candidate, upload: unchanged ? null : { file_uri: candidate.path, file_name: `emmy-runtime-${candidate.revision}-${candidate.sha256}.json`, mime_type: 'application/json', parent_folder_id: config.cloud.parentId }, selectionChanged: false };
  await writeFile(join(attempt, 'upload-request.json'), json(request), { flag: 'wx', mode: 0o600 });
  return { ...request, requestSha256: digest(json(request)) };
}

export async function verifyPrivateCandidate(attempt, receipt, capture, now = new Date()) {
  const requestBytes = await readFile(join(attempt, 'upload-request.json'));
  const request = JSON.parse(requestBytes);
  need(request.status === 'awaiting-upload' && receipt.requestSha256 === digest(requestBytes) && typeof receipt.fileId === 'string' && receipt.fileId.length > 0 && receipt.fileId !== request.accepted.fileId, 'Exact new upload receipt required');
  const cloud = { ...request.accepted, fileId: receipt.fileId, sha256: request.candidate.sha256, bytes: request.candidate.bytes };
  cloudRead(cloud, capture, now);
  const bytes = await readFile(capture.rawPath);
  need(bytes.length === cloud.bytes && digest(bytes) === cloud.sha256, 'Complete candidate cloud raw hash differs');
  await readFoundation(capture.rawPath, cloud.sha256);
  const result = { status: 'candidate-verified', cloud, revision: request.candidate.revision, snapshot: request.candidate.snapshot, requestSha256: receipt.requestSha256, observedAt: capture.observedAt, accepted: request.accepted, acceptedConsumer: request.acceptedConsumer, selectionChanged: false, activation: 'held-consumer-acceptance' };
  await writeFile(join(attempt, 'candidate-verified.json'), json({ receipt, capture, result }), { flag: 'wx', mode: 0o600 });
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (args[0] === 'prepare-candidate' && args.length === 5) {
      const [, configPath, capturePath, candidatePath, attempt] = args;
      result = await preparePrivateCandidate(JSON.parse(await readFile(configPath, 'utf8')), JSON.parse(await readFile(capturePath, 'utf8')), JSON.parse(await readFile(candidatePath, 'utf8')), attempt);
    } else if (args[0] === 'verify-candidate' && args.length === 4) {
      result = await verifyPrivateCandidate(args[1], JSON.parse(await readFile(args[2], 'utf8')), JSON.parse(await readFile(args[3], 'utf8')));
    } else {
      const [configPath, capturePath, attempt, ...extra] = args;
      need(configPath && capturePath && attempt && !extra.length, 'Use <private-config.json> <fresh-cloud-capture.json> <new-attempt-directory>');
      result = await refreshPrivateSkills(JSON.parse(await readFile(configPath, 'utf8')), JSON.parse(await readFile(capturePath, 'utf8')), attempt);
    }
    console.log(json(result).trim());
  } catch (error) { console.error(json({ status: 'held', error: error.message }).trim()); process.exitCode = 2; }
}
