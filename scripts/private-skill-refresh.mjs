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

export async function refreshPrivateSkills(config, capture, attempt, now = new Date()) {
  await mkdir(attempt, { mode: 0o700 });
  const startedAt = now.toISOString();
  await writeFile(join(attempt, 'request.json'), json({ config, capture, startedAt }), { flag: 'wx', mode: 0o600 });
  try {
    need(config.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(config.revision) && /^[a-f0-9]{64}$/.test(config.snapshot), 'Pinned source configuration required');
    need(config.consumer?.fileId === config.cloud.fileId && config.consumer?.sha256 === config.cloud.sha256 && config.consumer?.revision === config.revision && config.consumer?.snapshot === config.snapshot, 'Accepted consumer binding required');
    const age = now.getTime() - Date.parse(capture.observedAt);
    need(Number.isFinite(age) && age >= 0 && age <= 900000, 'Fresh cloud observation required');
    privateMetadata(capture.parent, config.cloud.parentId, config.cloud.owner);
    privateMetadata(capture.file, config.cloud.fileId, config.cloud.owner, config.cloud.parentId);
    need(capture.file.mime_type === 'application/json' && Number(capture.file.size) === config.cloud.bytes, 'Complete raw capsule metadata required');
    const release = await readFoundation(config.capsulePath, config.cloud.sha256);
    need(release.revision === config.revision && release.distribution === 'runtime', 'Reviewed complete runtime required');
    const localBytes = await readFile(config.capsulePath);
    const remoteBytes = await readFile(capture.rawPath);
    need(localBytes.length === config.cloud.bytes && remoteBytes.length === config.cloud.bytes && digest(remoteBytes) === config.cloud.sha256, 'Complete cloud raw hash differs');
    need(localBytes.equals(remoteBytes), 'Cloud raw bytes differ');
    const runtime = join(attempt, 'runtime');
    await materializeFoundation(release, runtime, 'runtime');
    const before = await checkInventory(runtime);
    need(before.snapshot === config.snapshot, 'Reviewed snapshot differs');
    const original = await readFile(join(runtime, 'registry/skills.json'));
    const refreshed = await refreshInventory(runtime, config.bindings);
    need(refreshed.snapshot === config.snapshot && (await readFile(join(runtime, 'registry/skills.json'))).equals(original), 'Inventory changed; source review required');
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
    const result = { status: 'complete', operation: 'unchanged', startedAt, sourceObservedAt: before.observedAt, cloudObservedAt: capture.observedAt, revision: release.revision, snapshot: config.snapshot, cloud: config.cloud, consumer: config.consumer, reads, remoteWrite: false, registration: 'unverified' };
    await writeFile(join(attempt, 'result.json'), json(result), { flag: 'wx', mode: 0o600 });
    return result;
  } catch (error) {
    await writeFile(join(attempt, 'result.json'), json({ status: 'held', startedAt, error: error.message, remoteWrite: false, selectionChanged: false }), { flag: 'wx', mode: 0o600 });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [configPath, capturePath, attempt, ...extra] = process.argv.slice(2);
    need(configPath && capturePath && attempt && !extra.length, 'Use <private-config.json> <fresh-cloud-capture.json> <new-attempt-directory>');
    const result = await refreshPrivateSkills(JSON.parse(await readFile(configPath, 'utf8')), JSON.parse(await readFile(capturePath, 'utf8')), attempt);
    console.log(json(result).trim());
  } catch (error) { console.error(json({ status: 'held', error: error.message }).trim()); process.exitCode = 2; }
}
