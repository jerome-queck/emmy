#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, rm, mkdtemp, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkInventory, refreshInventory } from './skill-inventory.mjs';
import { readFoundation, materializeFoundation, deriveSkillFoundation } from '../src/foundation-release.mjs';
import { resolveInstalledSources } from './installed-skill-source.mjs';
import { digest, canonical } from '../src/content.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const execute = promisify(execFile);
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
  if (release.format !== 'emmy-foundation-v3') {
    const refreshed = await refreshInventory(runtime, bindings);
    need(refreshed.snapshot === snapshot && (await readFile(join(runtime, 'registry/skills.json'))).equals(original), 'Inventory changed; source review required');
  }
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
  need(typeof candidate.approvalRef === 'string' && candidate.approvalRef.length > 0, 'Independent source approval reference required');
  need(config.consumer?.fileId === config.cloud.fileId && config.consumer?.sha256 === config.cloud.sha256 && config.consumer?.revision === config.revision && config.consumer?.snapshot === config.snapshot, 'Accepted consumer binding required');
  await exactCloud(config.cloud, capture, now);
  const accepted = await readFoundation(config.capsulePath, config.cloud.sha256);
  need(accepted.revision === config.revision, 'Accepted source differs');
  await materializeFoundation(accepted, join(attempt, 'accepted'), 'runtime');
  need((await checkInventory(join(attempt, 'accepted'))).snapshot === config.snapshot, 'Accepted snapshot differs');
  const release = await readFoundation(candidate.path, candidate.sha256);
  need(release.revision === candidate.revision && release.distribution === 'runtime', 'Approved candidate revision required');
  const bytes = await readFile(candidate.path);
  need(bytes.length === candidate.bytes, 'Candidate raw byte count differs');
  await inventory(release, candidate.bindings ?? config.bindings, candidate.snapshot, join(attempt, 'candidate-runtime'));
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

async function noSelectionWriter(config) {
  try { await lstat(join(config.home, 'writer.lock')); throw new Error('Pending selection writer requires exact rediscovery'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function acceptedRelease(config, captures, now) {
  const selector = await exactCloud({ ...config.selector, parentId: config.parentId, owner: config.owner }, captures.selector, now);
  const history = await exactCloud({ ...config.history, parentId: config.parentId, owner: config.owner }, captures.history, now);
  need(selector.equals(history), 'Selected immutable history differs');
  const selection = JSON.parse(selector);
  need(selection.schemaVersion === 1 && selection.kind === 'emmy-private-skill-selection' && selection.generation === config.selector.generation && canonical(selection.selected) === canonical(config.accepted), 'Selected consumer binding differs');
  await exactCloud({ ...config.accepted, parentId: config.parentId, owner: config.owner }, captures.candidate, now);
  const release = await readFoundation(captures.candidate.rawPath, config.accepted.sha256);
  need(release.revision === config.accepted.revision, 'Selected source differs');
  return release;
}

export async function checkPrivateSelection(config, captures, attempt, now = new Date()) {
  await mkdir(attempt, { mode: 0o700 });
  await noSelectionWriter(config);
  const release = await acceptedRelease(config, captures, now);
  const { before, reads } = await inventory(release, config.bindings, config.accepted.snapshot, join(attempt, 'runtime'));
  const result = { status: 'complete', operation: 'unchanged', binding: config, sourceObservedAt: before.observedAt, reads, remoteWrite: false, consumer: 'local materialization from exact cloud selector and capsule readbacks', registration: 'unverified' };
  await writeFile(join(attempt, 'selection-check.json'), json({ captures, result }), { flag: 'wx', mode: 0o600 });
  return result;
}

export async function preparePrivateRun(config, captures, staged, attempt, now = new Date()) {
  await noSelectionWriter(config);
  need(canonical(JSON.parse(await readFile(join(config.home, 'current.json')))) === canonical(config), 'Current accepted binding differs');
  if (staged === null) return checkPrivateSelection(config, captures, attempt, now);
  need(staged?.schemaVersion === 1 && staged.expectedBinding && staged.candidate?.bindings && typeof staged.candidate.approvalRef === 'string' && staged.candidate.approvalRef.length > 0, 'Explicit reviewed migration required');
  const candidate = staged.candidate;
  if (canonical(config) !== canonical(staged.expectedBinding)) {
    const prior = staged.expectedBinding;
    need(config.home === prior.home && config.parentId === prior.parentId && config.owner === prior.owner && canonical(config.bindings) === canonical(candidate.bindings) && config.accepted.revision === candidate.revision && config.accepted.sha256 === candidate.sha256 && config.accepted.bytes === candidate.bytes && config.accepted.snapshot === candidate.snapshot, 'Staged migration predecessor differs');
    return checkPrivateSelection(config, captures, attempt, now);
  }
  await acceptedRelease(config, captures, now);
  const accepted = config.accepted;
  const predecessor = { schemaVersion: 1, revision: accepted.revision, snapshot: accepted.snapshot, capsulePath: captures.candidate.rawPath, bindings: config.bindings, cloud: { fileId: accepted.fileId, parentId: config.parentId, owner: config.owner, sha256: accepted.sha256, bytes: accepted.bytes }, consumer: { fileId: accepted.fileId, sha256: accepted.sha256, revision: accepted.revision, snapshot: accepted.snapshot } };
  await mkdir(attempt, { mode: 0o700 });
  const candidateAttempt = join(attempt, 'candidate');
  await writeFile(join(attempt, 'run-plan.json'), json({ route: 'reviewed-candidate-first', stagedSha256: digest(staged), expectedBinding: config, candidateAttempt, remoteWrite: false, selectionChanged: false }), { flag: 'wx', mode: 0o600 });
  const prepared = await preparePrivateCandidate(predecessor, captures.candidate, candidate, candidateAttempt, now);
  return { ...prepared, route: 'reviewed-candidate-first', candidateAttempt, remoteWrite: false, selectionChanged: false };
}

export async function prepareInstalledPrivateRun(config, captures, runner, attempt, now = new Date()) {
  await noSelectionWriter(config);
  need(canonical(JSON.parse(await readFile(join(config.home, 'current.json')))) === canonical(config), 'Current accepted binding differs');
  const accepted = await acceptedRelease(config, captures, now);
  const base = await readFoundation(runner.path, runner.sha256);
  need(base.format === 'emmy-foundation-v2' && base.distribution === 'runtime' && base.revision === runner.revision && runner.approvalRef?.length > 0, 'Reviewed fixed runner required');
  need(digest(`${canonical(base)}\n`) === runner.sha256, 'Canonical fixed runner required');
  await mkdir(attempt, { mode: 0o700 });
  const runtime = join(attempt, 'collected-runtime');
  await materializeFoundation(base, runtime, 'runtime');
  await checkInventory(runtime);
  const policy = JSON.parse(await readFile(join(runtime, 'registry/skill-sources.json')));
  const collect = async name => {
    const { stdout } = await execute(runner.codexExecutable, ['plugin', 'list', '--json'], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    await writeFile(join(attempt, name), stdout, { flag: 'wx', mode: 0o600 });
    return resolveInstalledSources(policy, JSON.parse(stdout), runner.codexHome);
  };
  const before = await collect('installed-before.json');
  const refreshed = await refreshInventory(runtime, before.bindings);
  const after = await collect('installed-after.json');
  need(before.identity === after.identity, 'Installed source changed during collection');
  const rechecked = await refreshInventory(runtime, after.bindings);
  need(rechecked.snapshot === refreshed.snapshot, 'Installed bytes changed during collection');
  await materializeFoundation(accepted, join(attempt, 'accepted-runtime'), 'runtime');
  const previous = await checkInventory(join(attempt, 'accepted-runtime'));
  need(previous.snapshot === config.accepted.snapshot, 'Accepted immutable inventory differs');
  let indexBytes = await readFile(join(runtime, 'registry/skills.json'));
  const index = JSON.parse(indexBytes);
  const priorIndex = JSON.parse(await readFile(join(attempt, 'accepted-runtime/registry/skills.json')));
  if (previous.snapshot === index.snapshot) {
    index.observedAt = priorIndex.observedAt;
    indexBytes = Buffer.from(json(index));
  }
  const changes = index.files.filter(file => priorIndex.files.find(prior => prior.path === file.path)?.sha256 !== file.sha256).map(({ path, sha256 }) => ({ path, previousSha256: priorIndex.files.find(prior => prior.path === path)?.sha256 ?? null, sha256 }));
  const sourceChanges = index.sources.flatMap(source => {
    const prior = priorIndex.sources.find(item => item.id === source.id);
    const current = { version: source.version, revision: source.revision };
    const previous = prior ? { version: prior.version, revision: prior.revision } : null;
    return canonical(current) === canonical(previous) ? [] : [{ id: source.id, previous, current }];
  });
  await writeFile(join(attempt, 'collection.json'), json({ observedAt: now.toISOString(), installed: after.evidence, snapshot: index.snapshot, previousSnapshot: previous.snapshot, sources: index.sources.map(({ id, version, revision }) => ({ id, version, revision })), sourceChanges, changes, remoteWrite: false }), { flag: 'wx', mode: 0o600 });
  if (previous.snapshot === index.snapshot && accepted.derivation?.baseSha256 === runner.sha256) {
    const result = { status: 'complete', operation: 'unchanged', snapshot: index.snapshot, sourceObservedAt: previous.observedAt, remoteWrite: false, selectionChanged: false, registration: 'unverified' };
    await writeFile(join(attempt, 'result.json'), json(result), { flag: 'wx', mode: 0o600 });
    return result;
  }
  const skillFiles = await Promise.all(index.files.map(async file => {
    const path = `vendor/skills/${index.snapshot}/${file.path}`;
    return [path, await readFile(join(runtime, path))];
  }));
  const release = deriveSkillFoundation(base, indexBytes, skillFiles);
  const path = join(attempt, 'derived-runtime.json');
  const bytes = json(release);
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  const candidate = { path, sha256: digest(bytes), bytes: Buffer.byteLength(bytes), revision: base.revision, snapshot: index.snapshot, bindings: after.bindings, approvalRef: runner.approvalRef };
  const old = config.accepted;
  const predecessor = { schemaVersion: 1, revision: old.revision, snapshot: old.snapshot, capsulePath: captures.candidate.rawPath, bindings: config.bindings, cloud: { fileId: old.fileId, parentId: config.parentId, owner: config.owner, sha256: old.sha256, bytes: old.bytes }, consumer: { fileId: old.fileId, sha256: old.sha256, revision: old.revision, snapshot: old.snapshot } };
  const candidateAttempt = join(attempt, 'candidate');
  const result = await preparePrivateCandidate(predecessor, captures.candidate, candidate, candidateAttempt, now);
  return { ...result, candidateAttempt, sourceChanges, changes, route: 'installed-source', remoteWrite: false, selectionChanged: false };
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
  const bindings = request.candidate.bindings ?? config.bindings;
  await inventory(release, bindings, request.candidate.snapshot, join(attempt, 'runtime'));
  const selected = { fileId: cloud.fileId, sha256: digest(candidateBytes), bytes: candidateBytes.length, revision: release.revision, snapshot: request.candidate.snapshot };
  const selection = { schemaVersion: 1, kind: 'emmy-private-skill-selection', generation: previous.generation + 1, selected, previous: { selected: config.accepted, selectorSha256: config.selector.sha256, historyFileId: config.history.fileId }, approvalRef: request.candidate.approvalRef };
  const bytes = json(selection), path = join(attempt, 'selection.json');
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  const pending = { config, bindings, attempt: resolve(attempt), selection, sha256: digest(bytes), bytes: Buffer.byteLength(bytes), historyUpload: { file_uri: path, file_name: `emmy-skill-selection-${selection.generation}-${digest(bytes)}.json`, mime_type: 'application/json', parent_folder_id: config.parentId } };
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
  const { before, reads } = await inventory(release, pending.bindings, selected.snapshot, runtime);
  const next = { ...pending.config, bindings: pending.bindings, selector: { fileId: cloud.fileId, sha256: pending.sha256, bytes: pending.bytes, generation: pending.selection.generation }, history, accepted: selected };
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
    if (args[0] === 'prepare-installed' && args.length === 5) {
      result = await prepareInstalledPrivateRun(JSON.parse(await readFile(args[1], 'utf8')), JSON.parse(await readFile(args[2], 'utf8')), JSON.parse(await readFile(args[3], 'utf8')), args[4]);
    } else if (args[0] === 'prepare-run' && args.length === 5) {
      result = await preparePrivateRun(JSON.parse(await readFile(args[1], 'utf8')), JSON.parse(await readFile(args[2], 'utf8')), args[3] === '-' ? null : JSON.parse(await readFile(args[3], 'utf8')), args[4]);
    } else if (args[0] === 'check-selection' && args.length === 4) {
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
