import { hostname, loadavg, availableParallelism, freemem } from 'node:os';
import { lstat, readFile, mkdir, writeFile, statfs, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { canonical, digest, publishRecord, readStore, readBindings, recordPayload, validateReferences, timestamp } from './records.mjs';
import { authorityStatus, definitionHeads, effectKey, restoredState } from './work.mjs';
import { cloudConfig, cloudDefaults, cloudEnvelope, cloudJobInput, cloudPriorities } from './cloud-schema.mjs';

const insist = (condition, message) => { if (!condition) throw new Error(message); };
const unfinished = job => !['finished', 'dead'].includes(job.status);
export const emptyCloudState = (epochHash = null) => ({ lifecycle: 'active', reason: 'configured', epochHash, jobs: [], escalations: [] });
export function cloudState(records, responsibilityId) {
  const allRoots = records.filter(record => record.type === 'cloud-request');
  if (allRoots.length > 1) return { status: 'conflict', roots: allRoots.map(record => record.hash) };
  if (allRoots.length === 1 && allRoots[0].responsibilityId !== responsibilityId) return { status: 'wrong-controller', roots: allRoots.map(record => record.hash) };
  const roots = allRoots;
  if (roots.length !== 1) return { status: roots.length ? 'conflict' : 'unconfigured', roots: roots.map(record => record.hash) };
  const root = roots[0]; const steps = records.filter(record => record.type === 'cloud-step' && record.rootHash === root.hash);
  const parents = new Set(steps.map(record => record.parentHash));
  const heads = [root, ...steps].filter(record => !parents.has(record.hash));
  if (heads.length !== 1) return { status: 'conflict', roots: [root.hash], heads: heads.map(record => record.hash) };
  const head = heads[0];
  return { status: 'ready', root, head, state: head.type === 'cloud-request' ? emptyCloudState() : head.state };
}
function escalate(state, code, scope, at, newEscalations, provenance = {}) {
  const id = digest({ code, scope });
  if (!state.escalations.some(entry => entry.id === id)) {
    const entry = { id, code, scope, firstAt: at, delivery: 'pending', ...provenance };
    if (state.escalations.length < 1023) { state.escalations.push(entry); newEscalations.push(entry); }
    else if (!state.escalations.some(value => value.code === 'escalation-backpressure')) { const overflow = { id: digest({ code: 'escalation-backpressure', scope: 'controller' }), code: 'escalation-backpressure', scope: 'controller', firstAt: at, delivery: 'pending' }; state.escalations.push(overflow); newEscalations.push(overflow); }
  }
}
export function capacityDecision(sample, config, at) {
  if (!sample || !Number.isFinite(Date.parse(sample.observedAt))) return { eligible: false, code: 'monitor-failed' };
  const age = Date.parse(at) - Date.parse(sample.observedAt);
  if (age < 0 || age > config.maxSampleAgeMs) return { eligible: false, code: 'monitor-stale' };
  if (sample.synthetic === true) return { eligible: sample.state === 'available', code: sample.state === 'available' ? null : sample.state === 'pressure' ? 'capacity-pressure' : `capacity-${sample.state}` };
  if (sample.origin !== 'observed-process' || !Number.isFinite(sample.loadPerCpu) || !Number.isFinite(sample.freeMemoryBytes) || !Number.isFinite(sample.freeDiskBytes)) return { eligible: false, code: 'monitor-failed' };
  const eligible = sample.loadPerCpu <= config.maxLoadPerCpu && sample.freeMemoryBytes >= config.minFreeMemoryBytes && sample.freeDiskBytes >= config.minFreeDiskBytes;
  return { eligible, code: eligible ? null : 'capacity-pressure' };
}
export function cloudTransition(original, input, config, at, rootEffectKey) {
  const state = structuredClone(original); const newEscalations = []; let outcome = 'unchanged';
  if (input.operation === 'suspend') { state.lifecycle = 'suspended'; state.reason = input.reason; return { state, outcome: 'suspended', newEscalations }; }
  if (input.operation === 'resume') { state.lifecycle = 'active'; state.reason = input.reason; return { state, outcome: 'resumed', newEscalations }; }
  if (input.operation === 'health') { escalate(state, input.issue.code, digest({ rootEffectKey, scope: input.issue.scope }), at, newEscalations, { sourceRef: input.issue.sourceRef, reportedScope: input.issue.scope }); return { state, outcome: 'reported-health-retained', newEscalations }; }
  if (input.operation === 'recover') { for (const job of state.jobs) if (job.status === 'running') job.status = 'queued'; return { state, outcome: 'checkpoint-recovered', newEscalations }; }
  if (state.lifecycle !== 'active') return { state, outcome: 'suspended', newEscalations };
  if (input.operation === 'submit') {
    const jobInput = cloudJobInput(input.job, config); const key = digest({ effectKey: rootEffectKey, jobId: jobInput.id }); const inputDigest = digest(jobInput);
    const existing = state.jobs.find(job => job.key === key);
    if (existing) return { state, outcome: existing.inputDigest === inputDigest ? 'coalesced' : 'identity-conflict', key, newEscalations };
    const pending = state.jobs.filter(unfinished);
    const reserved = jobInput.priority === 'heavy' ? config.reservedInteractive + config.reservedMorning : jobInput.priority === 'morning' ? config.reservedInteractive : 0;
    const bytes = pending.reduce((sum, job) => sum + Buffer.byteLength(job.input.payload), 0) + Buffer.byteLength(jobInput.payload);
    if (pending.length >= config.maxPending - reserved || bytes > config.maxPendingBytes || state.jobs.length >= config.maxJobs) return { state, outcome: 'backpressure', key, newEscalations };
    state.jobs.push({ key, input: jobInput, inputDigest, order: state.jobs.length, status: 'queued', completedUnits: 0, accumulator: digest(''), failures: 0, nextEligibleAt: at, output: null });
    return { state, outcome: 'accepted', key, newEscalations };
  }
  if (input.operation === 'tick') {
    const decision = capacityDecision(input.sample, config, at);
    if (!decision.eligible) {
      if (decision.code !== 'capacity-pressure') escalate(state, decision.code, rootEffectKey, at, newEscalations);
      return { state, outcome: 'deferred', capacity: decision, newEscalations };
    }
    const eligible = state.jobs.filter(job => ['queued', 'running', 'retry-wait'].includes(job.status) && Date.parse(job.nextEligibleAt) <= Date.parse(at)).sort((a, b) => cloudPriorities.indexOf(a.input.priority) - cloudPriorities.indexOf(b.input.priority) || a.order - b.order);
    const job = eligible[0];
    if (!job) return { state, outcome: state.jobs.some(unfinished) ? 'backoff' : 'idle', capacity: decision, newEscalations };
    for (const other of state.jobs) if (other.status === 'running' && other.key !== job.key) other.status = 'queued';
    if (job.failures < job.input.transientFailures) {
      job.failures += 1;
      job.status = job.failures >= config.maxAttempts ? 'dead' : 'retry-wait';
      job.nextEligibleAt = new Date(Date.parse(at) + Math.min(config.maxBackoffMs, config.backoffMs * 2 ** (job.failures - 1))).toISOString();
      escalate(state, job.status === 'dead' ? 'work-dead' : 'transient-failure', job.key, at, newEscalations);
      outcome = job.status === 'dead' ? 'dead' : 'retry-scheduled';
    } else {
      job.accumulator = digest(`${job.accumulator}\n${job.input.payload}\n${job.completedUnits}`);
      job.completedUnits += 1;
      job.status = job.completedUnits === job.input.units ? 'finished' : 'running';
      if (job.status === 'finished') job.output = job.accumulator;
      outcome = job.status === 'finished' ? 'finished' : 'checkpointed';
    }
    return { state, outcome, key: job.key, capacity: decision, newEscalations };
  }
  return { state, outcome, newEscalations };
}
async function measure(home) {
  const observedAt = new Date().toISOString();
  try {
    const disk = await statfs(home); const cpus = availableParallelism();
    return { origin: 'observed-process', observedAt, scope: 'Current Node process visible OS load, memory and home filesystem. No provider quota, browser inventory, cgroup or freeze/OOM evidence.', cpus, loadPerCpu: loadavg()[0] / cpus, freeMemoryBytes: freemem(), freeDiskBytes: Number(disk.bavail) * Number(disk.bsize), providerQuota: 'unknown', providerState: 'unknown' };
  } catch (error) { return { origin: 'unavailable', observedAt, error: error.code ?? error.message, scope: 'Current process measurement failed; provider state remains unknown.' }; }
}
const epochOf = records => records.filter(record => record.type === 'epoch').sort((a, b) => a.restoredAt.localeCompare(b.restoredAt) || a.hash.localeCompare(b.hash)).at(-1) ?? null;
function scope(records, id, at, bindings) {
  const heads = definitionHeads(records.filter(record => record.type === 'definition' && record.id === id));
  insist(heads.length === 1, 'Cloud work requires one current responsibility definition');
  const definition = heads[0]; const authority = authorityStatus(definition, at);
  insist(definition.lifecycle.status === 'active' && authority.eligible && definition.authorityRef.cloud === true, 'Cloud work requires active exact scoped unexpired cloud authority');
  insist(['dot-cloud', 'codex-cloud'].includes(definition.target.executor) && typeof definition.cloudReason === 'string' && definition.cloudReason.trim(), 'Cloud work requires explicit cloud executor and rationale');
  insist(definition.target.executor !== 'codex-cloud' || Object.hasOwn(bindings.projects, definition.target.projectId) && bindings.projects[definition.target.projectId].cloudEnvironmentId === definition.target.hostId, 'Codex Cloud requires a prepared environment identity');
  const epoch = epochOf(records); const restore = restoredState(epoch, records.filter(record => record.type === 'observation' && record.responsibilityId === id), definition, at);
  return { definition, epoch, restore };
}
async function currentScope(home, records, id) {
  const bindings = await readBindings(home); const checkedAt = new Date().toISOString();
  return { ...scope(records, id, checkedAt, bindings), checkedAt };
}
async function ownerAt(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return { status: 'not-claimed' }; throw error; }
  try {
    insist((await lstat(path)).isDirectory() && !(await lstat(path)).isSymbolicLink(), 'Cloud turn claim is not an ordinary directory');
    const file = join(path, 'owner.json'); insist((await lstat(file)).isFile() && !(await lstat(file)).isSymbolicLink(), 'Cloud turn owner is not an ordinary file');
    const owner = JSON.parse(await readFile(file, 'utf8'));
    insist(owner.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(owner.token) && Number.isSafeInteger(owner.pid) && owner.pid > 0 && typeof owner.host === 'string' && owner.host && typeof owner.at === 'string', 'Invalid cloud turn owner'); timestamp(owner.at);
    return owner;
  } catch (error) { return { status: 'unknown', error: error.code ?? error.message }; }
}
function ownerStatus(owner) {
  if (owner.status === 'unknown' || owner.host !== hostname()) return 'unknown';
  try { process.kill(owner.pid, 0); return 'alive'; } catch (error) { return error.code === 'ESRCH' ? 'absent' : 'unknown'; }
}
const limits = ['Only Emmy-owned cooperative work participates. No provider-wide enforcement or quota proof.', 'A running job is a logical checkpointed workload, not an OS process-state claim. Sleeping is not suspension.', 'Only the built-in pure sha256-chain workload executes. No network, browser, subprocess, native job or process cleanup.', 'One committed terminal effect is retained. Pure uncommitted computation may repeat after a crash. No arbitrary external exactly-once guarantee.', 'Escalations are durable pending delivery. Output is not a delivered Dot notification.', 'Fresh-process recovery is not whole-provider or power-loss durability.'];
function view(projected, extra = {}) {
  const state = projected.state; const jobs = state?.jobs ?? [];
  return { status: projected.status !== 'ready' ? projected.status : state.lifecycle === 'suspended' ? 'suspended' : jobs.some(job => ['unknown', 'dead'].includes(job.status)) || state.escalations.length ? 'needs-attention' : 'ready', responsibilityId: projected.root?.responsibilityId, rootHash: projected.root?.hash, headHash: projected.head?.hash, state, counts: { pending: jobs.filter(unfinished).length, active: jobs.filter(job => job.status === 'running').length, finished: jobs.filter(job => job.status === 'finished').length, dead: jobs.filter(job => job.status === 'dead').length }, pendingEscalations: state?.escalations ?? [], newEscalations: [], delivery: 'pending-parent-owned-dot', limits, ...extra };
}
export async function cloud(home, { file }) {
  const info = await lstat(file); insist(info.isFile() && !info.isSymbolicLink() && info.size <= 262144, 'Cloud input must be an ordinary file of at most 256 KiB');
  const input = cloudEnvelope(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file))));
  let { records } = await readStore(home); let projected = cloudState(records, input.responsibilityId);
  if (input.operation === 'status') return cloudStatus(home, records, input.responsibilityId);
  const at = new Date().toISOString(); let scoped = await currentScope(home, records, input.responsibilityId);
  if (scoped.restore.suspended) return view(projected, { status: 'suspended', outcome: 'restore-suspended', restore: scoped.restore });
  if (projected.status === 'ready' && scoped.epoch && projected.state.epochHash !== scoped.epoch.hash && input.operation !== 'resume') return view(projected, { status: 'suspended', outcome: 'restored-controller-needs-resume' });
  if (input.operation === 'configure' && projected.status === 'ready') {
    insist(canonical(cloudConfig(input.config)) === canonical(projected.root.config) && effectKey(scoped.definition) === projected.root.effectKey, 'Cloud configuration or stable effect identity conflict');
    return view(projected, { outcome: 'coalesced' });
  }
  insist(projected.status === 'ready' || ['configure', 'recover'].includes(input.operation) && projected.status === 'unconfigured', 'Cloud controller is unconfigured or conflicted');
  if (projected.status === 'ready') insist(effectKey(scoped.definition) === projected.root.effectKey, 'Cloud stable responsibility effect changed');
  if (input.operation === 'submit') {
    const duplicate = cloudTransition(projected.state, input, projected.root.config, at, projected.root.effectKey);
    if (['coalesced', 'identity-conflict'].includes(duplicate.outcome)) return view(projected, duplicate);
  }
  const claimKey = projected.head?.hash ?? 'configure';
  const claimPath = join(home, 'cloud-turns', claimKey); await mkdir(join(home, 'cloud-turns'), { recursive: true });
  const owner = { schemaVersion: 1, responsibilityId: input.responsibilityId, host: hostname(), pid: process.pid, token: randomBytes(32).toString('hex'), at, ...(input.operation === 'configure' ? { config: cloudConfig(input.config), definitionHash: scoped.definition.hash, effectKey: effectKey(scoped.definition) } : {}) };
  let recovered = null;
  try { await mkdir(claimPath); await writeFile(join(claimPath, 'owner.json'), canonical(owner), { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const prior = await ownerAt(claimPath); const status = ownerStatus(prior);
    if (input.operation !== 'recover' || status !== 'absent' || input.expectedOwnerToken !== prior.token) return view(projected, { status: status === 'alive' ? 'busy' : 'unknown', outcome: 'turn-unresolved', turn: { status, owner: prior }, pendingEscalation: { id: digest({ claimKey, code: 'turn-unresolved' }), code: 'turn-unresolved', delivery: 'pending', storage: 'immutable-owned-turn-claim' } });
    if (projected.status === 'unconfigured') insist(prior.responsibilityId === input.responsibilityId && prior.config && prior.definitionHash && prior.effectKey === effectKey(scoped.definition), 'Abandoned configure lacks matching retained configuration');
    recovered = prior;
  }
  ({ records } = await readStore(home));
  const current = cloudState(records, input.responsibilityId);
  insist(current.head?.hash === projected.head?.hash && current.status === projected.status, 'Cloud head changed during turn acquisition');
  scoped = await currentScope(home, records, input.responsibilityId);
  insist(!scoped.restore.suspended, 'Cloud restore became suspended during acquisition');
  if (projected.status === 'ready') insist(effectKey(scoped.definition) === projected.root.effectKey, 'Cloud stable responsibility effect changed after acquisition');
  if (input.operation === 'configure' || projected.status === 'unconfigured' && recovered) {
    const payload = { schemaVersion: 1, type: 'cloud-request', responsibilityId: input.responsibilityId, definitionHash: recovered?.definitionHash ?? scoped.definition.hash, at: recovered?.at ?? at, config: recovered?.config ?? cloudConfig(input.config), effectKey: recovered?.effectKey ?? effectKey(scoped.definition) };
    validateReferences([...records, recordPayload(payload)]);
    const result = await publishRecord(home, payload);
    return view({ status: 'ready', root: result.record, head: result.record, state: emptyCloudState() }, { outcome: 'configured', published: result.hash });
  }
  projected = current;
  let sample;
  if (input.operation === 'tick') sample = input.capacity ? { ...input.capacity, scope: 'Synthetic injected capacity. Not observed pressure.' } : await measure(home);
  ({ records } = await readStore(home));
  insist(cloudState(records, input.responsibilityId).head?.hash === projected.head.hash, 'Cloud head changed before cooperative execution');
  scoped = await currentScope(home, records, input.responsibilityId);
  insist(!scoped.restore.suspended && effectKey(scoped.definition) === projected.root.effectKey, 'Cloud scope changed before cooperative execution');
  insist(!scoped.epoch || projected.state.epochHash === scoped.epoch.hash || input.operation === 'resume', 'Cloud controller epoch changed before execution');
  const evaluatedAt = recovered?.at ?? scoped.checkedAt;
  const transition = cloudTransition(projected.state, { ...input, sample }, projected.root.config, evaluatedAt, projected.root.effectKey);
  if (input.operation === 'resume') transition.state.epochHash = scoped.epoch?.hash ?? null;
  if (recovered) escalate(transition.state, 'recovered-abandoned-turn', projected.root.hash, recovered.at, transition.newEscalations);
  const payload = { schemaVersion: 1, type: 'cloud-step', responsibilityId: input.responsibilityId, definitionHash: scoped.definition.hash, rootHash: projected.root.hash, parentHash: projected.head.hash, seq: (projected.head.seq ?? 0) + 1, at: evaluatedAt, operation: recovered ? 'recover-abandoned-turn' : input.operation, state: transition.state, ...(recovered ? { recoveredOwner: recovered } : {}), ...(sample ? { sample } : {}) };
  validateReferences([...records, recordPayload(payload)]);
  const result = await publishRecord(home, payload);
  return view({ ...projected, head: result.record, state: transition.state }, { ...transition, published: result.hash, ...(sample ? { sample } : {}) });
}
export function cloudSummary(records, responsibilityId = null) {
  const ids = responsibilityId ? (records.some(record => record.type === 'cloud-request' && record.responsibilityId === responsibilityId) ? [responsibilityId] : []) : [...new Set(records.filter(record => record.type === 'cloud-request').map(record => record.responsibilityId))].sort();
  return ids.map(id => view(cloudState(records, id)));
}

export async function cloudStatus(home, records, id) {
  const projected = cloudState(records, id); const claimKey = projected.head?.hash ?? 'configure';
  if (!['ready', 'unconfigured'].includes(projected.status)) return view(projected);
  const owner = await ownerAt(join(home, 'cloud-turns', claimKey));
  let statusView = view(projected);
  if (projected.status === 'ready') {
    try { const scoped = await currentScope(home, records, id); insist(effectKey(scoped.definition) === projected.root.effectKey, 'Cloud stable responsibility effect changed'); }
    catch (error) { statusView = { ...statusView, status: 'needs-attention', scope: { eligible: false, reason: error.message } }; }
  }
  if (projected.status === 'ready') {
    const epoch = epochOf(records);
    const heads = definitionHeads(records.filter(record => record.type === 'definition' && record.id === id));
    const restore = heads.length === 1 ? restoredState(epoch, records.filter(record => record.type === 'observation' && record.responsibilityId === id), heads[0], new Date().toISOString()) : { suspended: true, needed: ['definition-conflict'] };
    if (restore.suspended || epoch && projected.state.epochHash !== epoch.hash) statusView = { ...statusView, status: 'suspended', restore, outcome: 'restored-controller-needs-resume' };
  }
  if (owner.status === 'not-claimed') return { ...statusView, turn: { status: 'available' } };
  const state = ownerStatus(owner); const status = state === 'alive' ? 'busy' : 'unknown';
  const escalation = { id: digest({ claimKey, code: 'turn-unresolved' }), code: 'turn-unresolved', scope: id, firstAt: owner.at ?? null, delivery: 'pending', storage: 'immutable-owned-turn-claim' };
  return { ...statusView, status, turn: { status: state === 'absent' ? 'abandoned' : state === 'alive' ? 'busy' : 'unknown', owner }, pendingEscalations: [...(projected.state?.escalations ?? []), ...(state === 'alive' ? [] : [escalation])], outcome: 'turn-unresolved' };
}
export async function cloudHealth(home, records) {
  const ids = new Set(records.filter(record => record.type === 'cloud-request').map(record => record.responsibilityId));
  try { if ((await readdir(join(home, 'cloud-turns'))).includes('configure')) { const owner = await ownerAt(join(home, 'cloud-turns/configure')); if (typeof owner.responsibilityId === 'string') ids.add(owner.responsibilityId); else if (!ids.size) return [{ status: 'unknown', pendingEscalations: [{ id: digest({ code: 'incomplete-configure-claim' }), code: 'incomplete-configure-claim', delivery: 'pending', storage: 'immutable-owned-turn-claim' }], newEscalations: [] }]; } } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return Promise.all([...ids].sort().map(id => cloudStatus(home, records, id)));
}
