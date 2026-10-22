import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
}

export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const text = (value, name) => requireValue(typeof value === 'string' && value.trim().length > 0, `${name} must be nonempty text`);
const object = (value, name) => requireValue(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
const hash = (value, name) => requireValue(/^[a-f0-9]{64}$/.test(value ?? ''), `${name} must be a SHA-256 digest`);
const array = (value, name) => requireValue(Array.isArray(value), `${name} must be an array`);
const texts = (value, name) => { array(value, name); value.forEach(item => text(item, name)); };
const hashes = (value, name) => { array(value, name); value.forEach(item => hash(item, name)); requireValue(new Set(value).size === value.length, `${name} contains duplicates`); };
const id = (value, name) => requireValue(/^[a-z][a-z0-9-]*$/.test(value ?? ''), `Invalid ${name}`);
const choice = (value, values, name) => requireValue(values.includes(value), `Unknown ${name}`);

export function timestamp(value, name = 'timestamp') {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)), `${name} must be an ISO UTC timestamp`);
  requireValue(new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'), `${name} is not a real UTC date`);
  return value;
}

export async function readBindings(home) {
  let value;
  try { value = await readJson(join(home, 'bindings.json')); }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, hosts: {}, projects: {} }; throw error; }
  object(value, 'bindings');
  requireValue(value.schemaVersion === 1, 'Unsupported bindings schemaVersion');
  object(value.hosts, 'hosts'); object(value.projects, 'projects');
  if (value.localHostId !== undefined) text(value.localHostId, 'localHostId');
  for (const [hostId, host] of Object.entries(value.hosts)) {
    text(hostId, 'host ID'); text(host.label, 'host label');
    if (host.machine !== undefined) text(host.machine, 'host machine');
  }
  for (const [projectId, project] of Object.entries(value.projects)) {
    id(projectId, 'project ID'); text(project.label, 'project label');
    if (project.path !== undefined) requireValue(isAbsolute(project.path), 'Project path must be absolute');
    for (const name of ['hostId', 'nativeProjectId', 'cloudEnvironmentId', 'repository']) if (project[name] !== undefined) text(project[name], name);
  }
  return value;
}

function subject(value) {
  object(value, 'subject');
  for (const name of ['projectId', 'repository', 'executor', 'hostId', 'revision', 'dirtyDigest']) text(value[name], `subject.${name}`);
  choice(value.executor, ['local-codex', 'local-work', 'dot-cloud', 'codex-cloud'], 'executor');
  if (value.executor.startsWith('local-')) {
    requireValue(isAbsolute(value.path ?? ''), 'Local subject.path must be absolute');
    text(value.nativeProjectId, 'subject.nativeProjectId');
    requireValue(/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(value.revision), 'Local revision must be a full commit SHA');
    hash(value.dirtyDigest, 'subject.dirtyDigest');
  }
  if (value.nativeId !== undefined) text(value.nativeId, 'subject.nativeId');
}

function authority(value, name = 'authorityRef') {
  object(value, name);
  for (const field of ['reference', 'action', 'resource', 'destination']) text(value[field], `${name}.${field}`);
  if (value.expiresAt !== undefined) timestamp(value.expiresAt, `${name}.expiresAt`);
}

function criterion(value) {
  object(value, 'criterion'); id(value.id, 'criterion ID'); text(value.description, 'criterion.description');
  choice(value.evidence, ['local-digest', 'local-check', 'reported-check'], 'criterion evidence');
  if (value.independentReview !== undefined) requireValue(typeof value.independentReview === 'boolean', 'independentReview must be boolean');
  if (value.evidence === 'local-digest') {
    requireValue(isAbsolute(value.path ?? ''), 'criterion.path must be absolute'); hash(value.sha256, 'criterion.sha256');
  }
  if (value.evidence === 'local-check') {
    object(value.check, 'criterion.check');
    requireValue(typeof value.check.script === 'string' && !isAbsolute(value.check.script) && !value.check.script.split(/[\\/]/).includes('..') && value.check.script.endsWith('.mjs'), 'check.script must be a repository-relative .mjs file');
    hash(value.check.sha256, 'check.sha256'); texts(value.check.argv, 'check.argv');
    requireValue(value.check.argv.length <= 64 && value.check.argv.every(item => item.length <= 4096), 'check.argv exceeds bounds');
    requireValue(Number.isInteger(value.check.expectedExit) && value.check.expectedExit >= 0 && value.check.expectedExit <= 255, 'check.expectedExit must be an exit code');
    requireValue(Number.isInteger(value.check.timeoutMs) && value.check.timeoutMs >= 1 && value.check.timeoutMs <= 60000, 'check.timeoutMs must be 1..60000');
    authority(value.check.authorityRef, 'check.authorityRef');
  }
}

export function parseDefinition(input) {
  object(input, 'definition');
  id(input.id, 'responsibility ID'); hashes(input.parents, 'parents');
  for (const name of ['goal', 'context', 'action', 'resource', 'destination']) text(input[name], name);
  subject(input.target); authority(input.authorityRef);
  array(input.criteria, 'criteria'); requireValue(input.criteria.length > 0, 'At least one criterion is required'); input.criteria.forEach(criterion);
  requireValue(new Set(input.criteria.map(item => item.id)).size === input.criteria.length, 'Duplicate criterion ID');
  object(input.freshness, 'freshness');
  requireValue(Number.isInteger(input.freshness.maxAgeMs) && input.freshness.maxAgeMs >= 0 && input.freshness.maxAgeMs <= 86400000, 'freshness.maxAgeMs must tighten the inclusive 24 hour maximum');
  array(input.freshness.sources, 'freshness.sources');
  for (const source of input.freshness.sources) { text(source.reference, 'source.reference'); timestamp(source.observedAt, 'source.observedAt'); }
  timestamp(input.reviewAt, 'reviewAt');
  object(input.feature, 'feature'); id(input.feature.id, 'feature.id'); text(input.feature.method, 'feature.method'); text(input.feature.intendedEffect, 'feature.intendedEffect'); timestamp(input.feature.reviewAt, 'feature.reviewAt');
  object(input.lifecycle, 'lifecycle'); choice(input.lifecycle.status, ['active', 'retired', 'merged'], 'lifecycle');
  if (input.lifecycle.status === 'merged') id(input.lifecycle.replacementId, 'replacementId');
  if (input.lifecycle.transferFindingIds !== undefined) { hashes(input.lifecycle.transferFindingIds, 'transferFindingIds'); id(input.lifecycle.replacementId, 'replacementId'); }
  if (input.trigger !== undefined) {
    const trigger = input.trigger;
    for (const name of ['nativeId', 'timezone', 'destination']) text(trigger[name], `trigger.${name}`);
    hash(trigger.promptDigest, 'trigger.promptDigest'); object(trigger.nextWindow, 'trigger.nextWindow');
    timestamp(trigger.nextWindow.start, 'window.start'); timestamp(trigger.nextWindow.due, 'window.due');
    requireValue(Date.parse(trigger.nextWindow.due) >= Date.parse(trigger.nextWindow.start), 'Window due precedes start');
    requireValue(Number.isInteger(trigger.nextWindow.graceMs) && trigger.nextWindow.graceMs >= 0, 'window.graceMs must be nonnegative');
  }
  return { ...input, type: 'definition', schemaVersion: 1 };
}

export function parseObservation(input) {
  object(input, 'observation'); id(input.responsibilityId, 'responsibilityId'); subject(input.subject);
  timestamp(input.observedAt, 'observedAt'); text(input.observer, 'observer');
  choice(input.category, ['target', 'criteria', 'authority', 'tasks', 'schedule', 'effect', 'independent-review'], 'observation category');
  choice(input.availability, ['available', 'unavailable', 'denied', 'unknown'], 'availability');
  object(input.coverage, 'coverage'); requireValue(typeof input.coverage.complete === 'boolean', 'coverage.complete must be boolean'); texts(input.coverage.gaps, 'coverage.gaps');
  requireValue(!input.coverage.complete || input.coverage.gaps.length === 0, 'Complete coverage cannot have gaps');
  array(input.claims, 'claims');
  for (const claim of input.claims) {
    id(claim.criterionId, 'claim criterion'); choice(claim.kind, ['local-digest', 'local-check', 'reported-check'], 'claim kind'); choice(claim.outcome, ['pass', 'fail', 'unknown'], 'claim outcome');
    text(claim.evidenceRef, 'claim.evidenceRef');
  }
  array(input.evidenceRefs, 'evidenceRefs');
  for (const ref of input.evidenceRefs) { requireValue(isAbsolute(ref.path ?? ''), 'evidence path must be absolute'); hash(ref.sha256, 'evidence sha256'); }
  if (input.supersedes !== undefined) { hash(input.supersedes.hash, 'supersedes.hash'); text(input.supersedes.reason, 'supersedes.reason'); }
  if (input.homeEpoch !== undefined) hash(input.homeEpoch, 'homeEpoch');
  if (input.authority !== undefined) authority(input.authority, 'observation.authority');
  if (input.effects !== undefined) {
    array(input.effects, 'effects');
    for (const effect of input.effects) { hash(effect.key, 'effect.key'); choice(effect.status, ['pending', 'uncertain', 'completed', 'absent'], 'effect status'); }
  }
  if (input.schedule !== undefined) {
    text(input.schedule.nativeId, 'schedule.nativeId'); choice(input.schedule.status, ['enabled', 'disabled', 'missing'], 'schedule status');
    if (input.schedule.status === 'enabled') for (const field of ['promptDigest', 'timezone', 'destination']) text(input.schedule[field], `schedule.${field}`);
  }
  if (input.runs !== undefined) {
    array(input.runs, 'runs');
    for (const run of input.runs) { text(run.nativeId, 'run.nativeId'); timestamp(run.windowStart, 'run.windowStart'); texts(run.outcomeRefs, 'run.outcomeRefs'); texts(run.deliveryRefs, 'run.deliveryRefs'); }
  }
  return { ...input, type: 'observation', schemaVersion: 1, origin: 'reported' };
}

export function parseRepair(input) {
  object(input, 'repair'); id(input.responsibilityId, 'responsibilityId'); hash(input.findingId, 'findingId'); hashes(input.failureRefs, 'failureRefs');
  requireValue(input.failureRefs.length > 0, 'Repair requires retained failure references');
  text(input.author, 'repair.author'); text(input.changeRef, 'changeRef'); subject(input.expectedSubject); hashes(input.recheckRefs, 'recheckRefs');
  timestamp(input.observedAt, 'repair.observedAt');
  return { ...input, type: 'repair', schemaVersion: 1 };
}

function parseFeatureReview(input) {
  id(input.responsibilityId, 'responsibilityId'); id(input.featureId, 'featureId'); timestamp(input.observedAt, 'observedAt'); timestamp(input.reviewAt, 'reviewAt');
  choice(input.recommendation, ['retain', 'change', 'merge', 'retire'], 'feature recommendation');
  for (const name of ['usefulOutcomes', 'falseAlarms', 'motivatingFailures']) texts(input[name], name);
  requireValue(Number.isFinite(input.repairEffortMinutes) && input.repairEffortMinutes >= 0, 'repairEffortMinutes must be nonnegative');
  text(input.reason, 'feature review reason');
  return { ...input, type: 'feature-review', schemaVersion: 1, origin: 'reported' };
}

export function parseImport(input) {
  object(input, 'import'); requireValue(input.schemaVersion === 1, 'Unsupported import schemaVersion'); array(input.records, 'import.records');
  return input.records.map(value => {
    requireValue(!Object.hasOwn(value, 'hash') && !Object.hasOwn(value, 'fileDigests'), 'Imported record uses reserved metadata');
    if (value.type === 'observation') return parseObservation(value);
    if (value.type === 'repair') return parseRepair(value);
    if (value.type === 'feature-review') return parseFeatureReview(value);
    throw new Error(`Unsupported imported record type ${value.type}`);
  });
}

const recordTypes = ['definition', 'observation', 'repair', 'review', 'feature-review', 'probe', 'epoch'];
export const publicationBoundaries = ['record:created', 'record:files-written', 'record:published', 'archive:created', 'archive:files-written', 'archive:published', 'restore:created', 'restore:files-written', 'restore:published'];

export async function publicationBoundary(boundary) {
  if (process.env.EMMY_VERIFY_BOUNDARY !== boundary) return;
  requireValue(isAbsolute(process.env.EMMY_VERIFY_BOUNDARY_FILE ?? ''), 'Verification boundary requires an absolute marker path');
  await writeFile(process.env.EMMY_VERIFY_BOUNDARY_FILE, `${canonical({ boundary, pid: process.pid })}\n`);
  process.kill(process.pid, 'SIGSTOP');
}

export function recordPayload(payload, extraFiles = {}) {
  requireValue(recordTypes.includes(payload.type), 'Unknown record type');
  requireValue(!Object.hasOwn(payload, 'hash') && !Object.hasOwn(payload, 'fileDigests'), 'Payload uses reserved record metadata');
  const fileDigests = Object.fromEntries(Object.entries(extraFiles).map(([name, bytes]) => {
    requireValue(/^[a-z][a-z0-9.-]*$/.test(name) && name !== 'record.json', 'Invalid record filename');
    return [name, digest(bytes)];
  }));
  const body = Object.keys(fileDigests).length ? { ...payload, fileDigests } : payload;
  return { ...body, hash: digest(body) };
}

export async function publishRecord(home, payload, extraFiles = {}) {
  const record = recordPayload(payload, extraFiles);
  const base = join(home, 'records'); const destination = join(base, record.hash);
  const files = { 'record.json': `${canonical(record)}\n`, ...extraFiles };
  await mkdir(base, { recursive: true });
  const pending = join(base, `.pending-${randomUUID()}`);
  await mkdir(pending);
  try {
    await publicationBoundary('record:created');
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(pending, name), bytes, { flag: 'wx' });
    await publicationBoundary('record:files-written');
    try { await rename(pending, destination); }
    catch (error) { if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error; }
    await publicationBoundary('record:published');
    const stored = await readRecord(home, record.hash);
    requireValue(canonical(stored) === canonical(record), 'Immutable publication differs');
    return { hash: record.hash, path: destination, record: stored };
  } finally { await rm(pending, { recursive: true, force: true }); }
}

export async function readRecord(home, reference) {
  hash(reference, 'record reference');
  const directory = join(home, 'records', reference);
  requireValue((await lstat(directory)).isDirectory() && !(await lstat(directory)).isSymbolicLink(), 'Record is not an ordinary directory');
  const record = await readJson(join(directory, 'record.json'));
  const { hash: storedHash, ...body } = record;
  requireValue(storedHash === reference && digest(body) === reference && recordTypes.includes(record.type), 'Immutable record digest mismatch');
  const files = record.fileDigests ?? {};
  requireValue(canonical((await readdir(directory)).sort()) === canonical(['record.json', ...Object.keys(files)].sort()), 'Immutable record has unexpected or missing files');
  for (const [name, expected] of Object.entries(files)) {
    requireValue(/^[a-z][a-z0-9.-]*$/.test(name) && name !== 'record.json', 'Invalid record filename'); hash(expected, 'file digest');
    const path = join(directory, name); requireValue((await lstat(path)).isFile() && !(await lstat(path)).isSymbolicLink(), 'Record evidence is not an ordinary file');
    requireValue(digest(await readFile(path)) === expected, 'Immutable evidence digest mismatch');
  }
  return record;
}

export async function readStore(home) {
  let names;
  try { names = await readdir(join(home, 'records')); }
  catch (error) { if (error.code === 'ENOENT') return { records: [], pending: [] }; throw error; }
  const pending = names.filter(name => name.startsWith('.pending-')).sort();
  requireValue(names.every(name => pending.includes(name) || /^[a-f0-9]{64}$/.test(name)), 'Unknown private record entry');
  const records = [];
  for (const reference of names.filter(name => !pending.includes(name)).sort()) records.push(await readRecord(home, reference));
  validateReferences(records);
  return { records, pending };
}

export function references(record) {
  if (record.type === 'definition') return record.parents;
  if (record.type === 'observation') return record.supersedes ? [record.supersedes.hash] : [];
  if (record.type === 'repair') return [...record.failureRefs, ...record.recheckRefs];
  if (record.type === 'review') return [record.definitionHash, ...record.inputHashes];
  if (record.type === 'epoch') return record.priorHashes;
  return [];
}

export function validateReferences(records) {
  const known = new Map(records.map(record => [record.hash, record]));
  for (const record of records) for (const ref of references(record)) requireValue(known.has(ref), `Missing referenced record ${ref}`);
  for (const record of records.filter(item => item.type === 'definition')) for (const ref of record.parents) requireValue(known.get(ref).type === 'definition' && known.get(ref).id === record.id, 'Definition parent belongs to another responsibility');
  for (const record of records.filter(item => item.type === 'observation' && item.supersedes)) {
    const prior = known.get(record.supersedes.hash);
    requireValue(prior.type === 'observation' && prior.responsibilityId === record.responsibilityId && prior.category === record.category, 'Supersession belongs to another observation scope');
    requireValue(Date.parse(record.observedAt) >= Date.parse(prior.observedAt), 'Supersession predates its predecessor');
  }
}

export async function retainImport(home, input) {
  const parsed = parseImport(input); const prepared = [];
  for (const payload of parsed) {
    const files = {};
    for (const [index, ref] of (payload.evidenceRefs ?? []).entries()) {
      const bytes = await readFile(ref.path); requireValue(digest(bytes) === ref.sha256, 'Imported evidence bytes differ from expected digest');
      files[`evidence-${index}.bin`] = bytes;
    }
    prepared.push({ payload, files, record: recordPayload(payload, files) });
  }
  const { records } = await readStore(home);
  validateReferences([...records, ...prepared.map(item => item.record)]);
  const published = [];
  for (const item of prepared) {
    published.push(await publishRecord(home, item.payload, item.files));
    await publicationBoundary(`import:record:${published.length}`);
  }
  return published;
}

export function within(root, path) {
  const value = relative(resolve(root), resolve(path));
  return value !== '' && value !== '..' && !value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(value);
}

const historicalKinds = ['snapshots', 'tasks', 'receipts', 'assessments', 'probes'];
const validArchivePath = path => path === 'bindings.json' || /^(records|snapshots|tasks|receipts|assessments|probes)\/[a-f0-9]{64}\/[a-z][a-z0-9.-]*$/.test(path);

async function ordinaryFile(path) {
  const status = await lstat(path);
  requireValue(status.isFile() && !status.isSymbolicLink(), 'Archive contains a nonordinary file');
  return readFile(path);
}

export async function historicalFiles(home) {
  const files = [];
  for (const kind of historicalKinds) {
    let names;
    try { names = await readdir(join(home, kind)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const reference of names.filter(name => !name.startsWith('.pending-')).sort()) {
      hash(reference, 'historical record reference');
      const directory = join(home, kind, reference);
      requireValue((await lstat(directory)).isDirectory() && !(await lstat(directory)).isSymbolicLink(), 'Historical record directory is invalid');
      const record = JSON.parse(await ordinaryFile(join(directory, 'record.json')));
      const { id: storedId, ...body } = record;
      requireValue(storedId === reference && digest(body) === reference, 'Historical record digest mismatch');
      const fileDigests = record.fileDigests ?? {};
      requireValue(canonical((await readdir(directory)).sort()) === canonical(['record.json', ...Object.keys(fileDigests)].sort()), 'Historical record has unexpected or missing files');
      for (const name of ['record.json', ...Object.keys(fileDigests)].sort()) {
        requireValue(/^[a-z][a-z0-9.-]*$/.test(name), 'Historical record filename is invalid');
        const bytes = await ordinaryFile(join(directory, name));
        if (name !== 'record.json') requireValue(digest(bytes) === fileDigests[name], 'Historical evidence digest mismatch');
        files.push({ path: `${kind}/${reference}/${name}`, bytes });
      }
    }
  }
  return files;
}

async function selectedFiles(home) {
  const { records } = await readStore(home);
  const files = [];
  for (const record of records) for (const name of ['record.json', ...Object.keys(record.fileDigests ?? {})].sort()) files.push({ path: `records/${record.hash}/${name}`, bytes: await ordinaryFile(join(home, 'records', record.hash, name)) });
  files.push(...await historicalFiles(home));
  try { files.push({ path: 'bindings.json', bytes: await ordinaryFile(join(home, 'bindings.json')) }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await readBindings(home);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function archiveManifest(path) {
  requireValue((await lstat(path)).isDirectory() && !(await lstat(path)).isSymbolicLink(), 'Archive root must be an ordinary directory');
  const manifest = JSON.parse(await ordinaryFile(join(path, 'manifest.json')));
  const { hash: storedHash, ...body } = manifest;
  requireValue(manifest.schemaVersion === 1 && digest(body) === storedHash, 'Archive manifest digest mismatch');
  array(manifest.files, 'archive files');
  const paths = manifest.files.map(file => file.path);
  requireValue(new Set(paths).size === paths.length && canonical(paths) === canonical([...paths].sort()), 'Archive file paths must be unique and sorted');
  for (const file of manifest.files) { requireValue(validArchivePath(file.path), 'Unsafe archive path'); hash(file.sha256, 'archive file digest'); }
  const actual = [];
  const walk = async (directory, prefix = '') => {
    for (const name of (await readdir(directory)).sort()) {
      const nested = prefix ? `${prefix}/${name}` : name;
      const status = await lstat(join(directory, name));
      requireValue(!status.isSymbolicLink(), 'Archive symlink refused');
      if (status.isDirectory()) await walk(join(directory, name), nested);
      else { requireValue(status.isFile(), 'Archive nonordinary entry refused'); actual.push(nested); }
    }
  };
  await walk(path);
  requireValue(canonical(actual.sort()) === canonical(['manifest.json', ...paths].sort()), 'Archive has unexpected or missing files');
  for (const file of manifest.files) requireValue(digest(await ordinaryFile(join(path, file.path))) === file.sha256, `Archive byte digest mismatch ${file.path}`);
  await readStore(path); await historicalFiles(path); await readBindings(path);
  return manifest;
}

async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function backupHome(home, destination) {
  requireValue(resolve(home) !== resolve(destination) && !within(home, destination) && !within(destination, home), 'Backup destination must be separate from the private home');
  const files = await selectedFiles(home);
  const selected = files.map(file => ({ path: file.path, sha256: digest(file.bytes) }));
  if (await exists(destination)) {
    const retained = await archiveManifest(destination);
    requireValue(canonical(retained.files) === canonical(selected), 'Backup destination already contains a different snapshot');
    return { path: destination, manifest: retained, replay: true };
  }
  const pending = `${destination}.pending-${randomUUID()}`;
  await mkdir(pending, { recursive: false });
  try {
    await publicationBoundary('archive:created');
    for (const file of files) { await mkdir(join(pending, file.path, '..'), { recursive: true }); await writeFile(join(pending, file.path), file.bytes, { flag: 'wx' }); }
    const body = { schemaVersion: 1, createdAt: new Date().toISOString(), files: selected, limits: ['This archive covers retained private records, referenced evidence bytes, and bindings. It does not establish external backup or hardware-loss recovery.'] };
    const manifest = { ...body, hash: digest(body) };
    await writeFile(join(pending, 'manifest.json'), `${canonical(manifest)}\n`, { flag: 'wx' });
    await archiveManifest(pending);
    await publicationBoundary('archive:files-written');
    await rename(pending, destination);
    await publicationBoundary('archive:published');
    return { path: destination, manifest, replay: false };
  } finally { await rm(pending, { recursive: true, force: true }); }
}

export async function restoreHome(source, destination) {
  requireValue(!await exists(destination), 'Restore destination already exists');
  requireValue(resolve(source) !== resolve(destination) && !within(source, destination), 'Restore destination must be separate from the archive');
  const manifest = await archiveManifest(source);
  const pending = `${destination}.pending-${randomUUID()}`;
  await mkdir(pending, { recursive: false });
  try {
    await publicationBoundary('restore:created');
    for (const file of manifest.files) { await mkdir(join(pending, file.path, '..'), { recursive: true }); await writeFile(join(pending, file.path), await ordinaryFile(join(source, file.path)), { flag: 'wx' }); }
    const { records } = await readStore(pending);
    const epoch = await publishRecord(pending, { type: 'epoch', schemaVersion: 1, restoredAt: new Date().toISOString(), archiveHash: manifest.hash, nonce: randomUUID(), priorHashes: records.map(record => record.hash).sort() });
    await publicationBoundary('restore:files-written');
    requireValue(!await exists(destination), 'Restore destination appeared during publication');
    await rename(pending, destination);
    await publicationBoundary('restore:published');
    return { path: destination, epoch: epoch.hash, suspended: true, needed: ['target', 'authority', 'tasks', 'schedule'], limits: ['Fresh observations for this home epoch are required before local-check execution or work proposals.', 'Stable effect keys and historical failures remain retained.'] };
  } finally { await rm(pending, { recursive: true, force: true }); }
}
