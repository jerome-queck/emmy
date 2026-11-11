import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, realpath, opendir, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { automationReporting, canonical, recordDigest } from './automation-reporting.mjs';
import { sanitizeRecords } from './automation-reporting-transport.mjs';
import { strictJson } from './bounded-json.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => canonical(a) === canonical(b);
const within = (path, root) => path === root || path.startsWith(root + sep);
const assumptions = ['One trusted cooperating writer; fallback and candidate file bytes immutable during apply; no hostile concurrent ancestor replacement.', 'Local byte repair only; no semantic outcomes, remote publication or delivery inferred.', 'Target namespace must already exist with verified canonical directory identity; upkeep never creates directories.'];

async function directoryIdentity(path) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path, 'Expected absolute canonical directory');
  let ancestor = path;
  while (true) {
    const info = await lstat(ancestor);
    need(info.isDirectory() && !info.isSymbolicLink(), 'Ordinary directory ancestry required');
    if (ancestor === parse(ancestor).root) break;
    ancestor = dirname(ancestor);
  }
  need(await realpath(path) === path, 'Canonical directory required');
  const info = await lstat(path);
  return { path, dev: info.dev, ino: info.ino };
}
async function boundedNames(path, limit) {
  const names = [];
  for await (const entry of await opendir(path)) {
    need(names.length < limit, 'Directory entry bound exceeded');
    names.push(entry.name);
  }
  return names.sort();
}
async function optionalDirectory(path) {
  try { return await directoryIdentity(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function bytesAt(path, limit = 32768) {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    const info = await handle.stat();
    need(info.isFile() && info.size <= limit, 'Bounded ordinary file required');
    const bytes = Buffer.alloc(limit + 1); let size = 0;
    while (size < bytes.length) {
      const next = await handle.read(bytes, size, bytes.length - size, null);
      if (!next.bytesRead) break;
      size += next.bytesRead;
    }
    need(size <= limit, 'Input exceeds bound');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}
async function expectations(sourceDirectory, namespace) {
  const records = []; let cursor = null; let total;
  do {
    const page = await automationReporting({ action: 'list', directory: sourceDirectory, namespace, cursor, limit: 200 });
    need(page.scan.complete, 'Fallback scan incomplete');
    need(total === undefined || total === page.scan.records, 'Fallback changed during scan');
    total = page.scan.records;
    for (const { id, ...record } of page.items) records.push(record);
    need(records.length <= 5000 && (page.nextCursor === null || cursor !== page.nextCursor), 'Fallback exceeds bound');
    cursor = page.nextCursor;
  } while (cursor !== null);
  need(new Set(records.map(recordDigest)).size === records.length, 'Fallback repeated a record');
  const projected = sanitizeRecords(records, { namespace });
  need(projected.conflictedCurrentRecords === 0, 'Fallback contains conflicts');
  const expected = new Map(projected.records.map(record => {
    const bytes = Buffer.from(canonical(record) + '\n');
    return [sha(bytes), { record, bytes, targetFilename: recordDigest(record) + '.json' }];
  }));
  return { expected, fingerprint: sha(canonical([...expected.keys()].sort())) };
}

export async function planUpkeep({ sourceDirectory, directory, namespace, fromNamespace = namespace }) {
  need(safeId(namespace) && safeId(fromNamespace), 'Explicit safe namespace required');
  const source = await directoryIdentity(sourceDirectory); const root = await directoryIdentity(directory);
  need(!within(source.path, root.path) && !within(root.path, source.path), 'Fallback and primary roots must be separate');
  const rootNames = await boundedNames(directory, 200);
  const { expected, fingerprint } = await expectations(sourceDirectory, namespace);
  const namespaces = [...new Set([namespace, fromNamespace])];
  const directories = []; const moves = []; const findings = []; const seen = new Set(); let count = 0;
  for (const selected of namespaces) {
    if (rootNames.some(name => name !== selected && name.toLowerCase() === selected.toLowerCase())) {
      directories.push({ namespace: selected, identity: null }); findings.push(`namespace-case-alias:${selected}`); continue;
    }
    const identity = await optionalDirectory(join(directory, selected));
    directories.push({ namespace: selected, identity });
    if (!identity) continue;
    if (!rootNames.includes(selected) || (selected !== namespace && selected.toLowerCase() === namespace.toLowerCase())) {
      findings.push(`namespace-case-alias:${selected}`); continue;
    }
    const names = await boundedNames(identity.path, 5000 - count); count += names.length;
    for (const filename of names) {
      if (filename.startsWith('.pending-')) { findings.push(`pending-retained:${selected}/${filename}`); continue; }
      let bytes;
      try { bytes = await bytesAt(join(identity.path, filename)); } catch { findings.push(`unknown-or-unsafe:${selected}/${filename}`); continue; }
      if (bytes === null) { findings.push(`vanished:${selected}/${filename}`); continue; }
      const byteSha256 = sha(bytes); const value = expected.get(byteSha256);
      if (!value || !bytes.equals(value.bytes)) { findings.push(`unknown-bytes:${selected}/${filename}`); continue; }
      seen.add(byteSha256);
      if (filename !== value.targetFilename && filename.toLowerCase() === value.targetFilename.toLowerCase()) {
        findings.push(`filename-case-alias:${selected}/${filename}`); continue;
      }
      if (selected !== namespace || filename !== value.targetFilename) moves.push({ sourceNamespace: selected, sourceFilename: filename, byteSha256, targetFilename: value.targetFilename });
    }
  }
  for (const [digest, value] of expected) if (!seen.has(digest)) findings.push(`missing:${namespace}/${value.targetFilename}`);
  const mappingAvailable = Boolean(directories.find(item => item.namespace === namespace)?.identity);
  if (!mappingAvailable) { findings.push('target-namespace-unavailable'); moves.length = 0; }
  for (const move of moves) {
    const target = await bytesAt(join(directory, namespace, move.targetFilename));
    if (target !== null && !target.equals(expected.get(move.byteSha256).bytes)) findings.push(`target-conflict:${move.targetFilename}`);
  }
  const plan = { schemaVersion: 1, source, root, namespace, fromNamespace, directories, mappingAvailable, fingerprint, moves, findings };
  need(Buffer.byteLength(canonical(plan)) <= 2097152, 'Plan exceeds bound');
  return { status: findings.length || moves.length ? 'needs-attention' : 'noop', writes: false, plan, assumptions };
}

export async function writeUpkeepPlan(to, plan) {
  need(typeof to === 'string' && isAbsolute(to) && resolve(to) === to && !within(to, plan.root.path) && !within(to, plan.source.path), 'Plan output must be absolute and outside both stores');
  await directoryIdentity(dirname(to));
  const handle = await open(to, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(canonical(plan) + '\n'); } finally { await handle.close(); }
}

export async function readUpkeepPlan(file) {
  need(isAbsolute(file) && resolve(file) === file, 'Absolute plan file required');
  await directoryIdentity(dirname(file));
  const bytes = await bytesAt(file, 2097152);
  need(bytes !== null, 'Plan file missing');
  return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function applyUpkeep(plan, { checkpoint = async () => {} } = {}) {
  need(plan?.schemaVersion === 1 && safeId(plan.namespace) && safeId(plan.fromNamespace), 'Invalid plan');
  need(Array.isArray(plan.moves) && plan.moves.length <= 5000 && Array.isArray(plan.directories) && Array.isArray(plan.findings), 'Invalid bounded plan');
  need(same(await directoryIdentity(plan.root.path), plan.root) && same(await directoryIdentity(plan.source.path), plan.source), 'Store identity changed');
  need(!within(plan.source.path, plan.root.path) && !within(plan.root.path, plan.source.path), 'Stores must be separate');
  const { expected, fingerprint } = await expectations(plan.source.path, plan.namespace);
  need(fingerprint === plan.fingerprint, 'Fallback projection changed; create a fresh plan');
  const rootNames = await boundedNames(plan.root.path, 200);
  const aliases = [];
  const namespaces = [...new Set([plan.namespace, plan.fromNamespace])];
  const plannedTarget = plan.directories.find(item => item.namespace === plan.namespace);
  need(plannedTarget?.identity, 'Target namespace mapping unavailable; no repairs applied');
  need(same(await optionalDirectory(join(plan.root.path, plan.namespace)), plannedTarget.identity), 'Target namespace missing or changed; no repairs applied');
  for (const selected of namespaces) if (rootNames.some(name => name !== selected && name.toLowerCase() === selected.toLowerCase())) aliases.push(`namespace-case-alias:${selected}`);
  if (aliases.length) return { schemaVersion: 1, status: 'needs-attention', writes: false, repaired: 0, findings: [...plan.findings, ...new Set(aliases)], assumptions };
  need(plan.directories.length === namespaces.length, 'Invalid planned directories');
  let entryCount = 0; const inventories = new Map();
  for (const selected of namespaces) {
    const saved = plan.directories.find(item => item.namespace === selected);
    need(saved, 'Missing directory identity');
    const current = await optionalDirectory(join(plan.root.path, selected));
    need(saved.identity === null ? current === null : same(current, saved.identity), 'Namespace directory identity changed');
    if (current) {
      if (!rootNames.includes(selected) || (selected !== plan.namespace && selected.toLowerCase() === plan.namespace.toLowerCase())) aliases.push(`namespace-case-alias:${selected}`);
      const names = await boundedNames(current.path, 5000 - entryCount);
      entryCount += names.length; inventories.set(selected, new Set(names));
    }
  }
  const work = []; const findings = [...plan.findings]; const sources = new Set();
  for (const move of plan.moves) {
    need(namespaces.includes(move.sourceNamespace) && typeof move.sourceFilename === 'string' && move.sourceFilename.length > 0 && !['.', '..'].includes(move.sourceFilename) && !move.sourceFilename.startsWith('.pending-') && !/[\/\\\u0000]/.test(move.sourceFilename), 'Invalid source filename');
    const value = expected.get(move.byteSha256);
    need(value && value.targetFilename === move.targetFilename, 'Move not authorized by fallback');
    const source = join(plan.root.path, move.sourceNamespace, move.sourceFilename); const target = join(plan.root.path, plan.namespace, move.targetFilename);
    need(source !== target && !sources.has(source), 'Invalid duplicate move'); sources.add(source);
    if (move.sourceFilename !== move.targetFilename && move.sourceFilename.toLowerCase() === move.targetFilename.toLowerCase()) aliases.push(`filename-case-alias:${move.sourceNamespace}/${move.sourceFilename}`);
    const bytes = await bytesAt(source); const targetBytes = await bytesAt(target);
    need(bytes === null || inventories.get(move.sourceNamespace)?.has(move.sourceFilename), 'Source filename is not an exact directory entry; no repairs applied');
    if (targetBytes !== null && !inventories.get(plan.namespace)?.has(move.targetFilename)) aliases.push(`target-case-alias:${move.targetFilename}`);
    need(targetBytes === null || targetBytes.equals(value.bytes), 'Target conflict; no repairs applied');
    need(bytes === null || (sha(bytes) === move.byteSha256 && bytes.equals(value.bytes)), 'Source changed; no repairs applied');
    if (bytes === null) {
      if (targetBytes === null) findings.push(`stale-missing:${move.sourceNamespace}/${move.sourceFilename}`);
      continue;
    }
    work.push({ source, target, bytes: value.bytes });
  }
  if (aliases.length) return { schemaVersion: 1, status: 'needs-attention', writes: false, repaired: 0, findings: [...findings, ...new Set(aliases)], assumptions };
  let repaired = 0;
  if (work.length) {
    for (const item of work) {
      need((await bytesAt(item.source))?.equals(item.bytes), 'Source changed during repair');
      try { await link(item.source, item.target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      need((await bytesAt(item.target))?.equals(item.bytes), 'Target readback differs; source retained');
      await checkpoint('linked', { source: item.source, target: item.target });
      need((await bytesAt(item.source))?.equals(item.bytes), 'Source changed before move completion');
      await unlink(item.source); repaired++;
      await checkpoint('moved', { source: item.source, target: item.target });
    }
  }
  return { schemaVersion: 1, status: findings.length ? 'needs-attention' : repaired ? 'repaired' : 'noop', writes: repaired > 0, repaired, findings, assumptions };
}
