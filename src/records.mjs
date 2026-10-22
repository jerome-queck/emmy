import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function timestamp(value, name = 'timestamp') {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)), `${name} must be an ISO UTC timestamp`);
  requireValue(new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'), `${name} is not a real UTC date`);
  return value;
}

function text(value, name) {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${name} must be nonempty text`);
}

function object(value, name) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
}

function texts(value, name) {
  requireValue(Array.isArray(value), `${name} must be an array`);
  for (const item of value) text(item, name);
}

export async function readBindings(root) {
  let bindings;
  try { bindings = await readJson(join(root, '.local/bindings.json')); }
  catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, hosts: {}, projects: {} };
    throw error;
  }
  object(bindings, 'bindings');
  requireValue(bindings.schemaVersion === 1, 'Unsupported bindings schemaVersion');
  object(bindings.hosts, 'hosts');
  object(bindings.projects, 'projects');
  for (const [id, host] of Object.entries(bindings.hosts)) {
    text(id, 'host ID');
    text(host.label, 'host label');
  }
  for (const [id, project] of Object.entries(bindings.projects)) {
    requireValue(/^[a-z][a-z0-9-]*$/.test(id), 'Invalid project ID');
    text(project.label, 'project label');
    if (project.path !== undefined) requireValue(isAbsolute(project.path), 'Project path must be absolute');
    if (project.hostId !== undefined) text(project.hostId, 'hostId');
    if (project.nativeProjectId !== undefined) text(project.nativeProjectId, 'nativeProjectId');
    if (project.cloudEnvironmentId !== undefined) text(project.cloudEnvironmentId, 'cloudEnvironmentId');
  }
  return bindings;
}

export function parseRequest(request) {
  object(request, 'request');
  for (const name of ['requestId', 'goal', 'projectId', 'revision']) text(request[name], name);
  requireValue(/^[a-z][a-z0-9-]*$/.test(request.projectId), 'Invalid projectId');
  requireValue(['code', 'academic', 'research', 'coordination'].includes(request.workClass), 'Unknown workClass');
  if (request.workClass === 'code') requireValue(/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(request.revision), 'Code revision must be a full lowercase commit SHA');
  requireValue(request.executor === undefined || ['local-codex', 'local-work', 'dot-cloud', 'codex-cloud'].includes(request.executor), 'Unknown executor');
  object(request.authority, 'authority');
  text(request.authority.reference, 'authority.reference');
  requireValue(request.authority.cloud === undefined || typeof request.authority.cloud === 'boolean', 'authority.cloud must be boolean');
  if (request.cloudReason !== undefined) text(request.cloudReason, 'cloudReason');
  texts(request.sources, 'sources');
  requireValue(Array.isArray(request.finish) && request.finish.length > 0, 'At least one finish criterion is required');
  const ids = new Set();
  for (const criterion of request.finish) {
    text(criterion.id, 'criterion.id');
    text(criterion.description, 'criterion.description');
    requireValue(!ids.has(criterion.id), 'Duplicate criterion ID');
    ids.add(criterion.id);
    requireValue(['local-digest', 'reported-check'].includes(criterion.evidence), 'Unknown criterion evidence kind');
  }
  return request;
}

function unwrap(value) {
  if (value?.structuredContent) return unwrap(value.structuredContent);
  if (Array.isArray(value?.content)) {
    const block = value.content.find(item => item.type === 'text' && item.text?.trim().startsWith('{'));
    if (block) return unwrap(JSON.parse(block.text));
  }
  return value;
}

export function parseSnapshot(input) {
  object(input, 'snapshot');
  const scope = input.scope;
  object(scope, 'scope');
  text(scope.product, 'scope.product');
  text(scope.hostId, 'scope.hostId');
  object(input.coverage, 'coverage');
  requireValue(typeof input.coverage.complete === 'boolean', 'coverage.complete must be boolean');
  texts(input.coverage.gaps, 'coverage.gaps');
  requireValue(!(input.coverage.complete && input.coverage.gaps.length), 'Complete coverage cannot have gaps');
  timestamp(input.observedAt, 'observedAt');
  text(input.observer, 'observer');
  requireValue(['online', 'offline', 'denied', 'unknown'].includes(input.availability), 'Unknown snapshot availability');
  let projects = input.projects;
  let chats = input.chats;
  if (input.format === 'native-codex') {
    const projectResult = unwrap(input.listProjects ?? input.projects);
    const threadResult = unwrap(input.listThreads ?? input.threads);
    projects = projectResult.projects;
    chats = [...(threadResult.pinnedThreads ?? []), ...(threadResult.threads ?? [])];
  }
  requireValue(Array.isArray(projects) && Array.isArray(chats), 'Snapshot projects and chats must be arrays');
  projects = projects.map(project => {
    const id = project.id ?? project.projectId;
    text(id, 'native project ID');
    const path = project.path ?? project.rootPath ?? project.cwd ?? null;
    requireValue(path === null || isAbsolute(path), 'Native project path must be absolute');
    const hostId = project.hostId ?? scope.hostId;
    text(hostId, 'native project hostId');
    return { ...project, id, path, hostId };
  });
  return {
    schemaVersion: 1,
    scope,
    observedAt: input.observedAt,
    observer: input.observer,
    availability: input.availability,
    coverage: input.coverage,
    projects,
    chats,
    capabilities: input.capabilities ?? [],
    basis: 'reported',
    limits: [...(input.limits ?? []), 'The importer does not authenticate native provider output or establish a global inventory.']
  };
}

export function parseReceipt(receipt) {
  object(receipt, 'receipt');
  for (const name of ['taskId', 'projectId', 'producer', 'resultRevision']) text(receipt[name], name);
  object(receipt.executor, 'executor');
  timestamp(receipt.observedAt, 'observedAt');
  texts(receipt.limits, 'limits');
  requireValue(Array.isArray(receipt.claims), 'claims must be an array');
  for (const claim of receipt.claims) {
    for (const name of ['criterionId', 'revision']) text(claim[name], name);
    requireValue(['pass', 'fail', 'unknown'].includes(claim.outcome), 'Unknown claim outcome');
    requireValue(['local-digest', 'reported-check'].includes(claim.kind), 'Unknown evidence kind');
    if (claim.kind === 'local-digest') {
      text(claim.evidenceId, 'evidenceId');
      requireValue(isAbsolute(claim.path ?? ''), 'Artifact path must be absolute');
      requireValue(/^[a-f0-9]{64}$/.test(claim.sha256 ?? ''), 'Artifact sha256 must be 64 lowercase hex digits');
    } else text(claim.evidenceRef, 'evidenceRef');
  }
  const evidenceIds = receipt.claims.filter(claim => claim.kind === 'local-digest').map(claim => claim.evidenceId);
  requireValue(new Set(evidenceIds).size === evidenceIds.length, 'Duplicate local evidenceId');
  return { ...receipt, basis: 'reported' };
}

export async function checkArtifacts(receipt) {
  const checks = [];
  for (const claim of receipt.claims.filter(value => value.kind === 'local-digest')) {
    try {
      const actualSha256 = digest(await readFile(claim.path));
      checks.push({ evidenceId: claim.evidenceId, status: actualSha256 === claim.sha256 ? 'match' : 'mismatch', actualSha256 });
    } catch (error) {
      checks.push({ evidenceId: claim.evidenceId, status: 'unreadable', error: error.code ?? error.message });
    }
  }
  return checks;
}

const recordKinds = ['snapshots', 'tasks', 'receipts', 'assessments', 'probes'];

export async function publishRecord(root, kind, payload, extraFiles = {}) {
  requireValue(recordKinds.includes(kind), 'Unknown record kind');
  const id = digest(payload);
  const record = { ...payload, id };
  const files = { 'record.json': `${canonical(record)}\n`, ...extraFiles };
  for (const name of Object.keys(files)) requireValue(/^[a-z][a-z0-9.-]*$/.test(name), 'Invalid record filename');
  const base = join(root, '.local', kind);
  const destination = join(base, id);
  await mkdir(base, { recursive: true });
  const pending = join(base, `.pending-${randomUUID()}`);
  await mkdir(pending);
  try {
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(pending, name), bytes, { flag: 'wx' });
    try { await rename(pending, destination); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
    }
    const existingNames = await readdir(destination);
    requireValue(canonical(existingNames.sort()) === canonical(Object.keys(files).sort()), 'Immutable record contains unexpected or missing files');
    for (const [name, bytes] of Object.entries(files)) requireValue(await readFile(join(destination, name), 'utf8') === bytes, 'Immutable record is corrupt');
    return { id, path: destination, record };
  } finally {
    await rm(pending, { recursive: true, force: true });
  }
}

export async function readRecord(root, kind, id) {
  requireValue(recordKinds.includes(kind) && /^[a-f0-9]{64}$/.test(id), 'Invalid record reference');
  const record = await readJson(join(root, '.local', kind, id, 'record.json'));
  const { id: storedId, ...payload } = record;
  requireValue(storedId === id && digest(payload) === id, 'Immutable record digest mismatch');
  return record;
}
