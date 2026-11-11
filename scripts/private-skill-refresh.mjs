#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, rm, mkdtemp, lstat } from 'node:fs/promises';
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

async function exactCloud(cloud, capture, now) {
  cloudRead(cloud, capture, now);
  const bytes = await readFile(capture.rawPath);
  need(bytes.length === cloud.bytes && digest(bytes) === cloud.sha256, 'Complete selection raw hash differs');
  return bytes;
}

export async function checkPrivateSelection(config, captures, attempt, now = new Date()) {
  await mkdir(attempt, { mode: 0o700 });
  try { await lstat(join(config.home, 'writer.lock')); throw new Error('Pending selection writer requires exact rediscovery'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const selector = await exactCloud({ ...config.selector, parentId: config.parentId, owner: config.owner }, captures.selector, now);
  const history = await exactCloud({ ...config.history, parentId: config.parentId, owner: config.owner }, captures.history, now);
  need(selector.equals(history), 'Selected immutable history differs');
  const selection = JSON.parse(selector);
  need(selection.schemaVersion === 1 && selection.kind === 'emmy-private-skill-selection' && selection.generation === config.selector.generation && canonical(selection.selected) === canonical(config.accepted), 'Selected consumer binding differs');
  await exactCloud({ ...config.accepted, parentId: config.parentId, owner: config.owner }, captures.candidate, now);
  const release = await readFoundation(captures.candidate.rawPath, config.accepted.sha256);
  need(release.revision === config.accepted.revision, 'Selected source differs');
  const { before, reads } = await inventory(release, config.bindings, config.accepted.snapshot, join(attempt, 'runtime'));
  const result = { status: 'complete', operation: 'unchanged', binding: config, sourceObservedAt: before.observedAt, reads, remoteWrite: false, consumer: 'local materialization from exact cloud selector and capsule readbacks', registration: 'unverified' };
  await writeFile(join(attempt, 'selection-check.json'), json({ captures, result }), { flag: 'wx', mode: 0o600 });
  return result;
}

export async function preparePrivateSelection(config, captures, candidateAttempt, attempt, now = new Date()) {
  await mkdir(attempt, { mode: 0o700 });
  await mkdir(join(config.home, 'writer.lock'));
  await writeFile(join(config.home, 'writer.lock/owner.json'), json({ attempt: resolve(attempt) }), { flag: 'wx', mode: 0o600 });
  need(canonical(JSON.parse(await readFile(join(config.home, 'current.json')))) === canonical(config), 'Local accepted selection changed');
  const old = await exactCloud({ ...config.selector, parentId: config.parentId, owner: config.owner }, captures.selector, now);
  const history = await exactCloud({ ...config.history, parentId: config.parentId, owner: config.owner }, captures.history, now);
  need(old.equals(history), 'Immutable prior selection differs');
  const previous = JSON.parse(old);
  need(previous.schemaVersion === 1 && previous.kind === 'emmy-private-skill-selection' && previous.generation === config.selector.generation && canonical(previous.selected) === canonical(config.accepted), 'Prior consumer binding differs');
  const verified = JSON.parse(await readFile(join(candidateAttempt, 'candidate-verified.json')));
  const requestBytes = await readFile(join(candidateAttempt, 'upload-request.json'));
  const request = JSON.parse(requestBytes);
  need(verified.result.status === 'candidate-verified' && verified.result.requestSha256 === digest(requestBytes) && canonical(request.accepted) === canonical({ fileId: config.accepted.fileId, parentId: config.parentId, owner: config.owner, sha256: config.accepted.sha256, bytes: config.accepted.bytes }) && canonical(request.acceptedConsumer) === canonical({ fileId: config.accepted.fileId, sha256: config.accepted.sha256, revision: config.accepted.revision, snapshot: config.accepted.snapshot }), 'Candidate predecessor differs');
  const cloud = verified.result.cloud;
  need(cloud.parentId === config.parentId && cloud.owner === config.owner && cloud.fileId !== config.accepted.fileId && cloud.sha256 === request.candidate.sha256 && cloud.bytes === request.candidate.bytes && verified.result.revision === request.candidate.revision && verified.result.snapshot === request.candidate.snapshot, 'Candidate selection differs');
  const candidateBytes = await exactCloud(cloud, captures.candidate, now);
  const release = await readFoundation(captures.candidate.rawPath, cloud.sha256);
  need(release.revision === request.candidate.revision, 'Candidate source differs');
  await inventory(release, config.bindings, request.candidate.snapshot, join(attempt, 'runtime'));
  const selected = { fileId: cloud.fileId, sha256: digest(candidateBytes), bytes: candidateBytes.length, revision: release.revision, snapshot: request.candidate.snapshot };
  const selection = { schemaVersion: 1, kind: 'emmy-private-skill-selection', generation: previous.generation + 1, selected, previous: { selected: config.accepted, selectorSha256: config.selector.sha256, historyFileId: config.history.fileId }, approvalRef: request.candidate.approvalRef };
  const bytes = json(selection), path = join(attempt, 'selection.json');
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  const pending = { config, attempt: resolve(attempt), selection, sha256: digest(bytes), bytes: Buffer.byteLength(bytes), historyUpload: { file_uri: path, file_name: `emmy-skill-selection-${selection.generation}-${digest(bytes)}.json`, mime_type: 'application/json', parent_folder_id: config.parentId } };
  await writeFile(join(attempt, 'pending-selection.json'), json(pending), { flag: 'wx', mode: 0o600 });
  return pending;
}

async function selectionOwner(attempt) {
  const pending = JSON.parse(await readFile(join(attempt, 'pending-selection.json')));
  const owner = JSON.parse(await readFile(join(pending.config.home, 'writer.lock/owner.json')));
  need(owner.attempt === resolve(attempt) && pending.attempt === resolve(attempt), 'Selection writer ownership differs');
  return pending;
}

export async function preparePrivateSelectorUpdate(attempt, receipt, capture, now = new Date()) {
  const pending = await selectionOwner(attempt);
  need(typeof receipt.fileId === 'string' && receipt.fileId.length > 0 && ![pending.config.selector.fileId, pending.config.history.fileId, pending.config.accepted.fileId, pending.selection.selected.fileId].includes(receipt.fileId), 'New immutable history identity required');
  const history = { fileId: receipt.fileId, sha256: pending.sha256, bytes: pending.bytes };
  await exactCloud({ ...history, parentId: pending.config.parentId, owner: pending.config.owner }, capture, now);
  const update = { fileId: pending.config.selector.fileId, file_uri: pending.historyUpload.file_uri, mime_type: 'application/json' };
  await writeFile(join(attempt, 'selector-update.json'), json({ history, update, selectionChanged: false }), { flag: 'wx', mode: 0o600 });
  return update;
}

export async function completePrivateSelection(attempt, captures, now = new Date()) {
  const pending = JSON.parse(await readFile(join(attempt, 'pending-selection.json')));
  const { history } = JSON.parse(await readFile(join(attempt, 'selector-update.json')));
  const cloud = { fileId: pending.config.selector.fileId, parentId: pending.config.parentId, owner: pending.config.owner, sha256: pending.sha256, bytes: pending.bytes };
  const bytes = await exactCloud(cloud, captures.selector, now);
  need(canonical(JSON.parse(bytes)) === canonical(pending.selection), 'Selected consumer differs');
  await exactCloud({ ...history, parentId: cloud.parentId, owner: cloud.owner }, captures.history, now);
  const selected = pending.selection.selected;
  await exactCloud({ ...selected, parentId: cloud.parentId, owner: cloud.owner }, captures.candidate, now);
  let completed;
  try { completed = JSON.parse(await readFile(join(attempt, 'selection-result.json'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (completed) {
    need(canonical(completed.binding.accepted) === canonical(selected) && canonical(JSON.parse(await readFile(join(pending.config.home, 'current.json')))) === canonical(completed.binding), 'Completed binding differs');
    try { await selectionOwner(attempt); await rm(join(pending.config.home, 'writer.lock'), { recursive: true }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return completed;
  }
  await selectionOwner(attempt);
  const release = await readFoundation(captures.candidate.rawPath, selected.sha256);
  need(release.revision === selected.revision, 'Selected release differs');
  const runtime = join(await mkdtemp(join(attempt, 'consumer-')), 'runtime');
  const { before, reads } = await inventory(release, pending.config.bindings, selected.snapshot, runtime);
  const next = { ...pending.config, selector: { fileId: cloud.fileId, sha256: pending.sha256, bytes: pending.bytes, generation: pending.selection.generation }, history, accepted: selected };
  const current = JSON.parse(await readFile(join(pending.config.home, 'current.json')));
  need([canonical(pending.config), canonical(next)].includes(canonical(current)), 'Local predecessor changed');
  for (const path of [join(attempt, 'accepted-binding.json'), join(pending.config.home, 'current.next.json')]) {
    try { await writeFile(path, json(next), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; need((await readFile(path, 'utf8')) === json(next), 'Pending binding differs'); }
  }
  await rename(join(pending.config.home, 'current.next.json'), join(pending.config.home, 'current.json'));
  const result = { status: 'selected', binding: next, consumer: { runtime, sourceObservedAt: before.observedAt, reads, execution: 'local-materialized', cloudRead: 'exact supplied provider raw captures', registration: 'unverified' }, priorBinding: pending.config };
  await writeFile(join(attempt, 'selection-result.json'), json(result), { flag: 'wx', mode: 0o600 });
  await rm(join(pending.config.home, 'writer.lock'), { recursive: true });
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (args[0] === 'check-selection' && args.length === 4) {
      result = await checkPrivateSelection(JSON.parse(await readFile(args[1], 'utf8')), JSON.parse(await readFile(args[2], 'utf8')), args[3]);
    } else if (args[0] === 'prepare-selection' && args.length === 5) {
      result = await preparePrivateSelection(JSON.parse(await readFile(args[1], 'utf8')), JSON.parse(await readFile(args[2], 'utf8')), args[3], args[4]);
    } else if (args[0] === 'prepare-selector-update' && args.length === 4) {
      result = await preparePrivateSelectorUpdate(args[1], JSON.parse(await readFile(args[2], 'utf8')), JSON.parse(await readFile(args[3], 'utf8')));
    } else if (args[0] === 'complete-selection' && args.length === 3) {
      result = await completePrivateSelection(args[1], JSON.parse(await readFile(args[2], 'utf8')));
    } else if (args[0] === 'prepare-candidate' && args.length === 5) {
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
