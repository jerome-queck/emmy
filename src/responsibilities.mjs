import { execFile, spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { canonical, digest, parseDefinition, publishRecord, readBindings, readStore, retainImport, validateReferences, recordPayload } from './records.mjs';
import { authorityStatus, criterionHash, definitionHeads, effectKey, observationStatus, repairStatus, restoredState, routeTarget, sameSubject, subjectKey } from './work.mjs';

const exec = promisify(execFile);
export const ruleVersion = 'responsibility-v1';
const ordered = values => [...values].sort((left, right) => left.hash.localeCompare(right.hash));
const latestEpoch = records => records.filter(record => record.type === 'epoch').sort((left, right) => left.restoredAt.localeCompare(right.restoredAt) || left.hash.localeCompare(right.hash)).at(-1) ?? null;
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const git = async (path, args) => (await exec('git', ['-C', path, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 15000 })).stdout;
const canonicalRepository = value => value.trim().replace(/^git@([^:]+):/, 'https://$1/').replace(/^ssh:\/\/git@/, 'https://').replace(/\.git\/?$/, '').replace(/\/$/, '').toLowerCase();

export async function inspectRepository(path) {
  const actualPath = await realpath(path);
  const top = (await git(actualPath, ['rev-parse', '--show-toplevel'])).trim();
  fail(await realpath(top) === actualPath, 'Configured path is not the repository root');
  const revision = (await git(path, ['rev-parse', 'HEAD'])).trim();
  const repository = canonicalRepository(await git(path, ['remote', 'get-url', 'origin']));
  const status = await git(path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const diff = await git(path, ['diff', '--binary', 'HEAD']);
  const untracked = (await git(path, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean).sort();
  const untrackedBytes = [];
  for (const name of untracked) untrackedBytes.push({ path: name, sha256: digest(await readFile(join(path, name))) });
  return { path: actualPath, repository, revision, dirtyDigest: digest({ status, diff, untracked: untrackedBytes }) };
}

async function runLocalCheck(criterion, definition, currentSubject, asOf, suspended) {
  const check = criterion.check;
  const scoped = check.authorityRef.action === 'run-local-check' && check.authorityRef.resource === definition.resource && check.authorityRef.destination === definition.destination && (!check.authorityRef.expiresAt || Date.parse(check.authorityRef.expiresAt) >= Date.parse(asOf));
  if (suspended || !scoped || !sameSubject(currentSubject, definition.target)) return { outcome: 'unknown', reason: suspended ? 'restore-suspended' : !scoped ? 'check-authority-needed' : 'current-subject-mismatch' };
  const path = await realpath(join(definition.target.path, check.script));
  const inside = relative(currentSubject.path, path);
  fail(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Verifier escapes the configured repository');
  const source = await readFile(path);
  if (digest(source) !== check.sha256) return { outcome: 'fail', reason: 'verifier-bytes-mismatch' };
  const verifierId = digest({ script: check.script, sha256: check.sha256, argv: check.argv });
  if (process.platform === 'win32') return { outcome: 'unknown', reason: 'local-check-process-groups-unsupported' };
  const execution = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path, ...check.argv], { cwd: currentSubject.path, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, EMMY_VERIFY_BOUNDARY: '', EMMY_VERIFY_BOUNDARY_FILE: '' } });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let reason = null; let cancelled = false;
    const terminate = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
    const timer = setTimeout(() => { reason = 'timeout'; terminate(); }, check.timeoutMs);
    const cancel = () => { cancelled = true; reason = 'cancelled'; terminate(); };
    process.once('SIGTERM', cancel); process.once('SIGINT', cancel);
    const collect = (kind, bytes) => {
      const remaining = Math.max(0, 1024 * 1024 - stdout.length - stderr.length);
      if (kind === 'stdout') stdout = Buffer.concat([stdout, bytes.subarray(0, remaining)]);
      else stderr = Buffer.concat([stderr, bytes.subarray(0, remaining)]);
      if (bytes.length > remaining) { reason = 'output-limit'; terminate(); }
    };
    child.stdout.on('data', bytes => collect('stdout', bytes)); child.stderr.on('data', bytes => collect('stderr', bytes));
    child.once('exit', terminate);
    child.once('error', error => { reason = error.code ?? 'execution-error'; });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer); process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel); terminate();
      if (cancelled) reject(new Error('Local check cancelled after owned process-group cleanup'));
      else resolve({ stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), exitCode, signal, reason, processGroup: child.pid });
    });
  });
  const { stdout, stderr, exitCode, signal } = execution;
  let reason = execution.reason;
  const after = await inspectRepository(currentSubject.path);
  if (after.revision !== currentSubject.revision || after.dirtyDigest !== currentSubject.dirtyDigest) reason = 'verifier-changed-source';
  return { outcome: !reason && exitCode === check.expectedExit ? 'pass' : 'fail', verifierId, script: check.script, sha256: check.sha256, argv: check.argv, expectedExit: check.expectedExit, exitCode, signal, reason, stdout, stderr, timeoutMs: check.timeoutMs, outputLimitBytes: 1024 * 1024, node: process.version, childTree: 'owned POSIX process group terminated; detached descendants excluded' };
}

export async function inspectLocal(definition, { bindings, catalog, machine, asOf, epoch, suspended, criteria }) {
  if (!definition.target.executor.startsWith('local-')) return [];
  const route = routeTarget(definition, { bindings, catalog, machine });
  if (route.reasons.length) return [];
  let inspected;
  try { inspected = await inspectRepository(definition.target.path); }
  catch (error) {
    return [{ payload: { type: 'observation', schemaVersion: 1, responsibilityId: definition.id, category: 'target', subject: definition.target, observedAt: new Date().toISOString(), observer: 'local-repository-inspector', availability: 'unavailable', coverage: { complete: false, gaps: [error.code ?? error.message] }, claims: [], evidenceRefs: [], origin: 'observed-local', homeEpoch: epoch?.hash ?? null }, files: {} }];
  }
  const currentSubject = { ...definition.target, ...inspected };
  const common = { type: 'observation', schemaVersion: 1, responsibilityId: definition.id, subject: currentSubject, observedAt: new Date().toISOString(), availability: 'available', coverage: { complete: true, gaps: [] }, evidenceRefs: [], origin: 'observed-local', homeEpoch: epoch?.hash ?? null };
  const result = [{ payload: { ...common, category: 'target', observer: 'local-repository-inspector', claims: [] }, files: {} }];
  const claims = []; const files = {};
  for (const criterion of criteria) {
    if (criterion.evidence === 'reported-check') continue;
    const specHash = criterionHash(criterion);
    const name = `check-${specHash}.json`;
    let check;
    if (criterion.evidence === 'local-digest') {
      try { const bytes = await readFile(criterion.path); check = { outcome: digest(bytes) === criterion.sha256 ? 'pass' : 'fail', expectedSha256: criterion.sha256, actualSha256: digest(bytes), path: criterion.path }; }
      catch (error) { check = { outcome: 'unknown', path: criterion.path, reason: error.code ?? error.message }; }
    } else {
      check = await runLocalCheck(criterion, definition, currentSubject, asOf, suspended);
    }
    files[name] = `${canonical(check)}\n`;
    claims.push({ criterionId: criterion.id, kind: criterion.evidence, outcome: check.outcome, specHash, evidenceRef: name, reason: check.reason ?? null, verifierId: check.verifierId ?? null });
  }
  result.push({ payload: { ...common, observedAt: new Date().toISOString(), category: 'criteria', observer: 'local-criterion-inspector', claims }, files });
  return result;
}

export function reconcileState(definition, { definitions, observations, repairs, reviews, featureReviews = [], epoch = null, bindings, catalog, machine, asOf }) {
  const diagnostics = ordered(observations).map(observation => ({ ...observationStatus(observation, definition.target, asOf, definition.freshness.maxAgeMs), category: observation.category }));
  const eligible = observations.filter(observation => diagnostics.find(status => status.hash === observation.hash).eligible);
  const route = routeTarget(definition, { bindings, catalog, machine });
  const authority = authorityStatus(definition, asOf);
  const restore = restoredState(epoch, observations, definition, asOf);
  const heads = definitionHeads(definitions);
  const prior = new Map();
  for (const review of [...reviews].sort((left, right) => left.asOf.localeCompare(right.asOf) || left.hash.localeCompare(right.hash))) for (const finding of review.findings) if (finding.durable && !prior.has(finding.id)) prior.set(finding.id, finding);
  const findings = new Map(prior);
  const add = (code, criteria = [], failureRefs = [], detail = '', durable = false, subject = definition.target) => {
    const signature = digest({ responsibilityId: definition.id, code, criteria: criteria.map(criterionHash), subject: subjectKey(subject) });
    const finding = { id: signature, code, signature, responsibilityId: definition.id, criteria, criterionIds: criteria.map(item => item.id), subject: subjectKey(subject), failureRefs: [...new Set(failureRefs)].sort(), detectedAsOf: asOf, detail, durable };
    if (!findings.has(signature)) findings.set(signature, finding);
    return findings.get(signature);
  };
  if (heads.length !== 1) add('definition-conflict', [], heads.map(head => head.hash), 'Every concurrent head must be named by the resolving definition.');
  for (const reason of route.reasons) add(reason);
  if (!authority.eligible) add(authority.reason);
  if (restore.suspended) add('restore-suspended', [], [epoch.hash], restore.needed.join(', '));
  const targetObservations = eligible.filter(observation => observation.category === 'target' && (!definition.target.executor.startsWith('local-') || observation.origin === 'observed-local'));
  if (!targetObservations.length) {
    const refused = diagnostics.filter(status => status.category === 'target');
    const reasons = [...new Set(refused.flatMap(status => status.reasons))];
    for (const code of reasons.length ? reasons : ['target-observation-missing']) add(code);
  }
  for (const source of definition.freshness.sources) {
    const age = Date.parse(asOf) - Date.parse(source.observedAt);
    if (age < 0 || age > definition.freshness.maxAgeMs) add(age < 0 ? 'source-future' : 'source-stale', [], [], source.reference);
  }
  const criterionResults = [];
  for (const criterion of definition.criteria) {
    const matching = eligible.filter(observation => observation.category === 'criteria').flatMap(observation => observation.claims.filter(claim => claim.criterionId === criterion.id && claim.kind === criterion.evidence && claim.specHash === criterionHash(criterion)).map(claim => ({ observation, claim })));
    for (const { observation, claim } of matching.filter(item => item.claim.outcome === 'fail')) add('criterion-failed', [criterion], [observation.hash], claim.reason ?? 'Retained failing criterion.', true, observation.subject);
    const pass = matching.some(({ observation, claim }) => claim.outcome === 'pass' && (criterion.evidence === 'reported-check' || observation.origin === 'observed-local'));
    if (!pass) add('criterion-evidence-needed', [criterion]);
    if (criterion.independentReview) add('external-review-needed', [criterion], matching.map(item => item.observation.hash), 'This local register cannot authenticate non-author review.', true);
    criterionResults.push({ criterionId: criterion.id, supported: pass && !criterion.independentReview, assurance: pass ? criterion.evidence === 'reported-check' ? 'reported' : 'observed-local' : 'unverified' });
  }
  const repairResults = [];
  const retainedFindings = [...findings.values()].map(finding => {
    const attempts = repairs.filter(repair => repair.findingId === finding.id).map(repair => repairStatus(repair, finding, observations, definition, asOf));
    repairResults.push(...attempts);
    const closed = finding.durable && finding.code !== 'external-review-needed' && attempts.some(attempt => attempt.valid);
    return { ...finding, status: closed ? 'resolved' : 'open', repairHashes: attempts.map(attempt => attempt.repairHash).sort(), failedRepairs: attempts.filter(attempt => !attempt.valid).length };
  });
  const corrections = [];
  for (const finding of retainedFindings.filter(item => item.durable)) {
    const earlier = [...reviews].sort((left, right) => left.asOf.localeCompare(right.asOf) || left.hash.localeCompare(right.hash)).find(review => review.criterionResults.some(result => finding.criterionIds.includes(result.criterionId) && result.supported) && !review.findings.some(item => item.id === finding.id));
    if (!earlier) continue;
    const failureTimes = observations.filter(observation => finding.failureRefs.includes(observation.hash)).map(observation => Date.parse(observation.observedAt));
    corrections.push({ kind: failureTimes.some(time => time <= Date.parse(earlier.asOf)) ? 'correction' : 'regression', priorReviewHash: earlier.hash, findingId: finding.id, evidenceRefs: finding.failureRefs });
  }
  const open = retainedFindings.filter(finding => finding.status === 'open');
  for (const result of criterionResults) if (open.some(finding => finding.durable && finding.criterionIds.includes(result.criterionId))) result.supported = false;
  const key = effectKey(definition);
  const effectObservations = eligible.filter(observation => observation.category === 'effect');
  const replaced = new Set(effectObservations.filter(observation => observation.supersedes).map(observation => observation.supersedes.hash));
  const effects = effectObservations.filter(observation => !replaced.has(observation.hash)).flatMap(observation => observation.effects ?? []).filter(effect => effect.key === key);
  const proposals = [];
  if (definition.lifecycle.status === 'active' && heads.length === 1 && !restore.suspended) {
    if (effects.some(effect => ['pending', 'uncertain'].includes(effect.status))) proposals.push({ type: 'rediscover', effectKey: key, reason: 'Native effect is pending or uncertain. Read its actual state before another execution.', execution: 'proposal-only' });
    else if (!effects.some(effect => effect.status === 'completed')) {
      const repeated = open.find(finding => finding.failedRepairs >= 2);
      const type = repeated ? 'diagnose' : open.length ? 'observe-or-decide' : 'work';
      if (authority.eligible || type === 'observe-or-decide') proposals.push({ type, effectKey: key, definitionHash: definition.hash, target: subjectKey(definition.target), reason: repeated ? repeated.id : open.map(finding => finding.code).join(', '), execution: 'proposal-only' });
    }
  }
  return { schemaVersion: 1, type: 'review', responsibilityId: definition.id, definitionHash: definition.hash, ruleVersion, asOf, goal: definition.goal, context: definition.context, target: definition.target, route, authority, restore, heads: heads.map(head => head.hash), observations: diagnostics, criterionResults, findings: retainedFindings.sort((left, right) => left.id.localeCompare(right.id)), repairs: repairResults.sort((left, right) => left.repairHash.localeCompare(right.repairHash)), corrections, proposals, featureReviews: ordered(featureReviews).map(review => ({ hash: review.hash, recommendation: review.recommendation, assurance: 'reported' })), lifecycle: definition.lifecycle, reviewAt: definition.reviewAt, limits: ['Proposals are not native execution, permissions, delivery, or authenticated review.', 'Local evidence proves the inspected bytes or bounded command result, not native state.', 'No local process can detect total dormancy without an external wakeup.'] };
}

export async function adoptResponsibility(home, input) {
  const definition = parseDefinition(input);
  const { records } = await readStore(home);
  const prepared = recordPayload(definition);
  validateReferences([...records, prepared]);
  return publishRecord(home, definition);
}

export async function reconcile(home, { id, imports, asOf, catalog }) {
  if (imports) await retainImport(home, imports);
  let { records, pending } = await readStore(home);
  const bindings = await readBindings(home); const machine = hostname(); const epoch = latestEpoch(records);
  const ids = [...new Set(records.filter(record => record.type === 'definition').map(record => record.id))].sort();
  fail(!id || ids.includes(id), `Unknown responsibility ${id}`);
  const results = [];
  for (const responsibilityId of id ? [id] : ids) {
    const definitions = records.filter(record => record.type === 'definition' && record.id === responsibilityId);
    const heads = definitionHeads(definitions); const definition = heads[0];
    const relevant = records.filter(record => record.responsibilityId === responsibilityId);
    const observations = relevant.filter(record => record.type === 'observation');
    const reviews = relevant.filter(record => record.type === 'review');
    const repairs = relevant.filter(record => record.type === 'repair');
    const featureReviews = relevant.filter(record => record.type === 'feature-review');
    const previousCriteria = reviews.flatMap(review => review.findings.filter(finding => finding.durable).flatMap(finding => finding.criteria));
    const criteria = [...new Map([...definition.criteria, ...previousCriteria].map(criterion => [criterionHash(criterion), criterion])).values()];
    const liveStart = new Date(Math.max(Date.parse(asOf), Date.now())).toISOString();
    const suspended = restoredState(epoch, observations, definition, liveStart).suspended;
    const local = heads.length === 1 ? await inspectLocal(definition, { bindings, catalog, machine, asOf: liveStart, epoch, suspended, criteria }) : [];
    for (const item of local) { const published = await publishRecord(home, item.payload, item.files); if (!observations.some(record => record.hash === published.hash)) observations.push(published.record); if (!records.some(record => record.hash === published.hash)) records.push(published.record); }
    const effectiveAsOf = new Date(Math.max(Date.parse(asOf), ...local.map(item => Date.parse(item.payload.observedAt)))).toISOString();
    const state = { ...reconcileState(definition, { definitions, observations, repairs, reviews, featureReviews, epoch, bindings, catalog, machine, asOf: effectiveAsOf }), requestedAsOf: asOf };
    const inputHashes = [...new Set([...definitions, ...observations, ...repairs, ...featureReviews, ...(epoch ? [epoch] : [])].map(record => record.hash))].sort();
    const published = await publishRecord(home, { ...state, inputHashes });
    results.push(published);
  }
  return { asOf, responsibilities: results, pending, status: results.some(result => result.record.findings.some(finding => finding.status === 'open')) ? 'actionable' : 'current' };
}

export async function inspectHome(home) {
  const { records, pending } = await readStore(home);
  const epoch = latestEpoch(records);
  return { records: records.length, pending, responsibilities: new Set(records.filter(record => record.type === 'definition').map(record => record.id)).size, restoredEpoch: epoch?.hash ?? null, restoredNeedsFreshObservations: Boolean(epoch) };
}
