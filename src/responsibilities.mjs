import { cloudSummary, cloudHealth } from './cloud.mjs';
import { fleetSummary, fleetPendingTurns } from './fleet.mjs';
import { execFile, spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { canonical, canonicalRepository, digest, parseDefinition, publishRecord, readBindings, readStore, retainImport, validateReferences, recordPayload } from './records.mjs';
import { authorityStatus, criterionHash, currentNativeEffects, currentObservations, definitionHeads, effectKey, observationStatus, repairStatus, restoredState, retirementStatus, reviewAsOf, routeTarget, sameSubject, subjectKey, triggerStatus } from './work.mjs';

const exec = promisify(execFile);
export const ruleVersion = 'responsibility-v1';
const ordered = values => [...values].sort((left, right) => left.hash.localeCompare(right.hash));
const latestEpoch = records => records.filter(record => record.type === 'epoch').sort((left, right) => left.restoredAt.localeCompare(right.restoredAt) || left.hash.localeCompare(right.hash)).at(-1) ?? null;
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const git = async (path, args) => (await exec('git', ['-C', path, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 15000 })).stdout;

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

export function terminateOwnedProcessGroup(pid, kill = process.kill) {
  if (pid === undefined) return { status: 'not-started' };
  try { kill(-pid, 'SIGKILL'); return { status: 'signalled' }; }
  catch (error) {
    if (error.code === 'ESRCH') return { status: 'absent' };
    if (error.code === 'EPERM') return { status: 'unverified', error: error.code };
    throw error;
  }
}

async function runLocalCheck(criterion, definition, { asOf, epoch, observations }) {
  const check = criterion.check;
  let currentSubject;
  try { currentSubject = { ...definition.target, ...await inspectRepository(definition.target.path) }; }
  catch (error) { return { outcome: 'unknown', reason: 'current-subject-unavailable', subjectError: error.code ?? error.message }; }
  if (!sameSubject(currentSubject, definition.target)) return { outcome: 'unknown', reason: 'current-subject-mismatch', inspectedSubject: currentSubject };
  const path = await realpath(join(definition.target.path, check.script));
  const inside = relative(currentSubject.path, path);
  fail(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Verifier escapes the configured repository');
  const source = await readFile(path);
  if (digest(source) !== check.sha256) return { outcome: 'fail', reason: 'verifier-bytes-mismatch' };
  const verifierId = digest({ script: check.script, sha256: check.sha256, argv: check.argv });
  if (process.platform === 'win32') return { outcome: 'unknown', reason: 'local-check-process-groups-unsupported' };
  const startedAt = new Date().toISOString();
  const executionAsOf = reviewAsOf(asOf, startedAt);
  const suspended = restoredState(epoch, observations, definition, executionAsOf).suspended;
  const scoped = check.authorityRef.action === 'run-local-check' && check.authorityRef.resource === definition.resource && check.authorityRef.destination === definition.destination && (!check.authorityRef.expiresAt || Date.parse(check.authorityRef.expiresAt) >= Date.parse(executionAsOf));
  if (suspended || !scoped) return { outcome: 'unknown', reason: suspended ? 'restore-suspended' : 'check-authority-needed' };
  const execution = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path, ...check.argv], { cwd: currentSubject.path, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, EMMY_VERIFY_BOUNDARY: '', EMMY_VERIFY_BOUNDARY_FILE: '' } });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let reason = null; let cancelled = false; let settled = false;
    const cleanupAttempts = [];
    const stopWaiting = () => { clearTimeout(timer); process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel); };
    const release = () => { child.stdout.destroy(); child.stderr.destroy(); child.unref(); };
    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true; stopWaiting();
      const errors = [...new Set(cleanupAttempts.flatMap(attempt => attempt.error ? [attempt.error] : []))];
      const cleanup = { status: errors.length ? 'unverified' : cleanupAttempts.some(attempt => ['signalled', 'absent'].includes(attempt.status)) ? 'terminated' : 'not-started', processGroup: child.pid ?? null, errors, attempts: cleanupAttempts };
      if (cancelled) reject(new Error(cleanup.status === 'unverified' ? `Local check cancelled; owned process-group cleanup unverified for ${child.pid}: ${errors.join(', ')}` : 'Local check cancelled after owned process-group cleanup'));
      else resolve({ stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), exitCode, signal, reason: errors.length ? 'process-group-cleanup-failed' : reason, terminationReason: reason, cleanup });
    };
    const terminate = () => {
      if (settled || cleanupAttempts.length > 0) return;
      let attempt;
      try { attempt = terminateOwnedProcessGroup(child.pid); }
      catch (error) { settled = true; stopWaiting(); release(); reject(new Error(`Owned process-group cleanup unverified for ${child.pid}: ${error.code ?? error.message}`, { cause: error })); return; }
      cleanupAttempts.push(attempt);
      if (attempt.status === 'unverified') { release(); finish(child.exitCode, child.signalCode); }
    };
    const timer = setTimeout(() => { reason = 'timeout'; terminate(); }, check.timeoutMs);
    const cancel = () => { cancelled = true; reason = 'cancelled'; terminate(); };
    process.once('SIGTERM', cancel); process.once('SIGINT', cancel);
    const collect = (kind, bytes) => {
      if (settled) return;
      const remaining = Math.max(0, 1024 * 1024 - stdout.length - stderr.length);
      if (kind === 'stdout') stdout = Buffer.concat([stdout, bytes.subarray(0, remaining)]);
      else stderr = Buffer.concat([stderr, bytes.subarray(0, remaining)]);
      if (bytes.length > remaining) { reason = 'output-limit'; terminate(); }
    };
    child.stdout.on('data', bytes => collect('stdout', bytes)); child.stderr.on('data', bytes => collect('stderr', bytes));
    child.once('exit', terminate);
    child.once('error', error => { reason = error.code ?? 'execution-error'; });
    child.once('close', (exitCode, signal) => { terminate(); finish(exitCode, signal); });
  });
  const { stdout, stderr, exitCode, signal } = execution;
  let reason = execution.reason;
  let after = null; let subjectError = null;
  try { after = await inspectRepository(currentSubject.path); }
  catch (error) { reason = 'verifier-result-subject-unavailable'; subjectError = error.code ?? error.message; }
  if (after && (after.path !== currentSubject.path || after.repository !== currentSubject.repository || after.revision !== currentSubject.revision || after.dirtyDigest !== currentSubject.dirtyDigest)) reason = 'verifier-changed-source';
  return { outcome: !reason && exitCode === check.expectedExit ? 'pass' : 'fail', verifierId, sourceBase64: source.toString('base64'), startedAt, completedAt: new Date().toISOString(), resultingSubject: after, subjectError, script: check.script, sha256: check.sha256, argv: check.argv, expectedExit: check.expectedExit, exitCode, signal, reason, stdout, stderr, terminationReason: execution.terminationReason, cleanup: execution.cleanup, timeoutMs: check.timeoutMs, outputLimitBytes: 1024 * 1024, node: process.version, childTree: execution.cleanup.status === 'unverified' ? 'owned POSIX process-group cleanup unverified; detached descendants excluded' : execution.cleanup.status === 'not-started' ? 'local verifier process did not start' : 'owned POSIX process group terminated; detached descendants excluded' };
}

export async function inspectLocal(definition, { bindings, catalog, machine, asOf, epoch, observations, criteria }) {
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
      try { const bytes = await readFile(criterion.path); const artifactEvidence = `artifact-${specHash}.bin`; files[artifactEvidence] = bytes; check = { outcome: digest(bytes) === criterion.sha256 ? 'pass' : 'fail', expectedSha256: criterion.sha256, actualSha256: digest(bytes), path: criterion.path, artifactEvidence }; }
      catch (error) { check = { outcome: 'unknown', path: criterion.path, reason: error.code ?? error.message }; }
    } else {
      check = await runLocalCheck(criterion, definition, { asOf, epoch, observations });
    }
    files[name] = `${canonical(check)}\n`;
    claims.push({ criterionId: criterion.id, revision: currentSubject.revision, kind: criterion.evidence, outcome: check.outcome, specHash, evidenceRef: name, reason: check.reason ?? null, verifierId: check.verifierId ?? null });
  }
  result.push({ payload: { ...common, observedAt: new Date().toISOString(), category: 'criteria', observer: 'local-criterion-inspector', claims }, files });
  return result;
}

export function reconcileState(definition, { definitions, observations, repairs, reviews, featureReviews = [], relatedDefinitions = [], relatedReviews = [], cloudRecords = [], fleetRecords = [], epoch = null, bindings, catalog, machine, asOf }) {
  definitions = ordered(definitions); observations = ordered(observations); repairs = ordered(repairs); reviews = ordered(reviews);
  const active = definition.lifecycle.status === 'active';
  const diagnostics = ordered(observations).map(observation => ({ ...observationStatus(observation, definition.target, asOf, definition.freshness.maxAgeMs), category: observation.category }));
  const effectiveObservations = currentObservations(definition, observations, asOf);
  const eligible = effectiveObservations.filter(observation => diagnostics.find(status => status.hash === observation.hash).eligible);
  for (const status of diagnostics) status.superseded = !effectiveObservations.some(observation => observation.hash === status.hash);
  const route = routeTarget(definition, { bindings, catalog, machine });
  const authority = authorityStatus(definition, asOf);
  const restore = restoredState(epoch, observations, definition, asOf);
  const heads = definitionHeads(definitions);
  const incomingTransfers = [];
  const otherIds = [...new Set(relatedDefinitions.map(item => item.id))].sort();
  for (const sourceId of otherIds) for (const head of definitionHeads(relatedDefinitions.filter(item => item.id === sourceId))) {
    if (head.lifecycle.replacementId !== definition.id) continue;
    const sourceReviews = relatedReviews.filter(review => review.responsibilityId === sourceId).sort((left, right) => right.asOf.localeCompare(left.asOf) || left.hash.localeCompare(right.hash));
    for (const findingId of head.lifecycle.transferFindingIds ?? []) {
      const sourceReview = sourceReviews.find(review => review.findings.some(finding => finding.id === findingId));
      const finding = sourceReview?.findings.find(item => item.id === findingId);
      if (finding) incomingTransfers.push({ fromResponsibilityId: sourceId, sourceDefinitionHash: head.hash, sourceReviewHash: sourceReview.hash, findingId, status: finding.status, failureRefs: finding.failureRefs });
    }
  }
  const prior = new Map();
  for (const review of [...reviews].sort((left, right) => left.asOf.localeCompare(right.asOf) || left.hash.localeCompare(right.hash))) for (const finding of review.findings) if (finding.durable) {
    const original = prior.get(finding.id);
    prior.set(finding.id, original ? { ...original, evidenceHistoryRefs: [...new Set([...(original.evidenceHistoryRefs ?? original.failureRefs), ...(finding.evidenceHistoryRefs ?? finding.failureRefs)])].sort() } : finding);
  }
  const findings = new Map(prior);
  const add = (code, criteria = [], failureRefs = [], detail = '', durable = false, subject = definition.target, occurrence = null) => {
    const signature = digest({ responsibilityId: definition.id, code, criteria: criteria.map(criterionHash), subject: subjectKey(subject), occurrence });
    const finding = { id: signature, code, signature, responsibilityId: definition.id, criteria, criterionIds: criteria.map(item => item.id), subject: subjectKey(subject), failureRefs: [...new Set(failureRefs)].sort(), detectedAsOf: asOf, detail, durable, occurrence, evidenceHistoryRefs: [...new Set(failureRefs)].sort() };
    if (!findings.has(signature)) findings.set(signature, finding);
    else findings.set(signature, { ...findings.get(signature), evidenceHistoryRefs: [...new Set([...(findings.get(signature).evidenceHistoryRefs ?? findings.get(signature).failureRefs), ...failureRefs])].sort() });
    return findings.get(signature);
  };
  if (heads.length !== 1) add('definition-conflict', [], heads.map(head => head.hash), 'Every concurrent head must be named by the resolving definition.');
  if (active) for (const reason of route.reasons) add(reason);
  if (active && !authority.eligible) add(authority.reason);
  if (active && Date.parse(definition.reviewAt) <= Date.parse(asOf)) add('responsibility-review-due');
  if (restore.suspended) add('restore-suspended', [], [epoch.hash], restore.needed.join(', '));
  const localTargets = observations.filter(observation => observation.category === 'target' && observation.origin === 'observed-local' && Date.parse(observation.observedAt) <= Date.parse(asOf));
  const latestTargetTime = Math.max(...localTargets.map(observation => Date.parse(observation.observedAt)));
  const currentLocalTargets = localTargets.filter(observation => Date.parse(observation.observedAt) === latestTargetTime);
  const targetObservations = definition.target.executor.startsWith('local-') ? currentLocalTargets.filter(observation => observationStatus(observation, definition.target, asOf, definition.freshness.maxAgeMs).eligible) : eligible.filter(observation => observation.category === 'target');
  if (active && definition.target.executor.startsWith('local-') && currentLocalTargets.some(observation => !observationStatus(observation, definition.target, asOf, definition.freshness.maxAgeMs).eligible)) add('current-local-target-mismatch');
  if (active && !targetObservations.length) {
    const refused = diagnostics.filter(status => status.category === 'target');
    const reasons = [...new Set(refused.flatMap(status => status.reasons))];
    for (const code of reasons.length ? reasons : ['target-observation-missing']) add(code);
  }
  for (const source of active ? definition.freshness.sources : []) {
    const age = Date.parse(asOf) - Date.parse(source.observedAt);
    if (age < 0 || age > definition.freshness.maxAgeMs) add(age < 0 ? 'source-future' : 'source-stale', [], [], source.reference);
  }
  if (active && !eligible.some(observation => observation.category === 'tasks')) add('native-discovery-needed');
  const trigger = triggerStatus(definition, observations, asOf);
  for (const issue of active ? trigger.findings : []) add(issue.code, [], issue.refs, 'Observe the exact native window; no catch-up is dispatched.', ['missed-run', 'run-no-evidence', 'delivery-unverified'].includes(issue.code), definition.target, issue.occurrence);
  const retirement = retirementStatus(definition, definitions, observations, asOf);
  if (retirement.pendingTriggers.length) add('retirement-disablement-needed', [], [], retirement.pendingTriggers.join(', '));
  if (active && Date.parse(definition.feature.reviewAt) <= Date.parse(asOf) && !featureReviews.some(review => review.featureId === definition.feature.id && Date.parse(review.observedAt) <= Date.parse(asOf) && Date.parse(review.reviewAt) > Date.parse(asOf))) add('feature-review-due');
  const criterionResults = [];
  for (const criterion of definition.lifecycle.status === 'active' ? definition.criteria : []) {
    const matching = eligible.filter(observation => observation.category === 'criteria').flatMap(observation => observation.claims.filter(claim => claim.criterionId === criterion.id && claim.kind === criterion.evidence && claim.revision === definition.target.revision && claim.specHash === criterionHash(criterion)).map(claim => ({ observation, claim })));
    const historicalFailures = observations.filter(observation => observation.category === 'criteria' && Date.parse(observation.observedAt) <= Date.parse(asOf) && sameSubject(observation.subject, definition.target)).flatMap(observation => observation.claims.filter(claim => claim.criterionId === criterion.id && claim.kind === criterion.evidence && claim.revision === definition.target.revision && claim.specHash === criterionHash(criterion) && claim.outcome === 'fail').map(claim => ({ observation, claim })));
    for (const { observation, claim } of historicalFailures) add('criterion-failed', [criterion], [observation.hash], claim.reason ?? 'Retained failing criterion.', true, observation.subject);
    const localChecks = observations.filter(observation => observation.category === 'criteria' && observation.origin === 'observed-local' && Date.parse(observation.observedAt) <= Date.parse(asOf) && observation.claims.some(claim => claim.criterionId === criterion.id && claim.specHash === criterionHash(criterion)));
    const latestCheckTime = Math.max(...localChecks.map(observation => Date.parse(observation.observedAt)));
    const current = criterion.evidence === 'reported-check' ? matching : matching.filter(({ observation }) => observation.origin === 'observed-local' && Date.parse(observation.observedAt) === latestCheckTime);
    const pass = current.some(({ claim }) => claim.outcome === 'pass') && !current.some(({ claim }) => claim.outcome !== 'pass') && (criterion.evidence === 'reported-check' || targetObservations.length > 0 && currentLocalTargets.every(observation => observationStatus(observation, definition.target, asOf, definition.freshness.maxAgeMs).eligible));
    if (!pass) add('criterion-evidence-needed', [criterion]);
    if (criterion.independentReview) add('external-review-needed', [criterion], matching.map(item => item.observation.hash), 'This local register cannot authenticate non-author review.', true);
    criterionResults.push({ criterionId: criterion.id, specHash: criterionHash(criterion), supported: pass && !criterion.independentReview, assurance: pass ? criterion.evidence === 'reported-check' ? 'reported' : 'observed-local' : 'unverified' });
  }
  const repairResults = [];
  const retainedFindings = [...findings.values()].map(finding => {
    const attempts = repairs.filter(repair => repair.findingId === finding.id).map(repair => repairStatus(repair, finding, observations, definition, asOf));
    repairResults.push(...attempts);
    const closed = finding.durable && finding.code !== 'external-review-needed' && attempts.some(attempt => attempt.valid);
    return { ...finding, transferredTo: (definition.lifecycle.transferFindingIds ?? []).includes(finding.id) ? definition.lifecycle.replacementId : null, status: closed ? 'resolved' : 'open', repairHashes: attempts.map(attempt => attempt.repairHash).sort(), failedRepairs: attempts.filter(attempt => attempt.outcome === 'failed').length };
  });
  const corrections = [];
  for (const finding of retainedFindings.filter(item => item.durable)) {
    const failureObservations = observations.filter(observation => (finding.evidenceHistoryRefs ?? finding.failureRefs).includes(observation.hash));
    const latestFailure = failureObservations.sort((left, right) => right.observedAt.localeCompare(left.observedAt) || left.hash.localeCompare(right.hash))[0];
    if (!latestFailure) continue;
    const earlier = [...reviews].sort((left, right) => right.asOf.localeCompare(left.asOf) || left.hash.localeCompare(right.hash)).find(review => review.criterionResults.some(result => finding.criterionIds.includes(result.criterionId) && result.supported));
    if (!earlier) continue;
    corrections.push({ kind: Date.parse(latestFailure.observedAt) <= Date.parse(earlier.asOf) ? 'correction' : 'regression', priorReviewHash: earlier.hash, findingId: finding.id, evidenceRefs: [latestFailure.hash] });
  }
  const open = retainedFindings.filter(finding => finding.status === 'open');
  for (const result of criterionResults) if (open.some(finding => finding.durable && finding.criterionIds.includes(result.criterionId))) result.supported = false;
  const key = effectKey(definition);
  const currentEffectObservations = currentNativeEffects(definition, observations, asOf);
  const nativeTasks = currentEffectObservations.flatMap(observation => observation.tasks ?? []);
  const uncorrelatedTaskIds = [...new Set(nativeTasks.filter(task => !task.effectKey).map(task => task.nativeId))].sort();
  const effects = [...currentEffectObservations.flatMap(observation => observation.effects ?? []), ...nativeTasks.filter(task => task.effectKey).map(task => ({ key: task.effectKey, status: ['pending', 'running'].includes(task.status) ? 'pending' : task.status === 'unknown' ? 'uncertain' : 'completed' }))].filter(effect => effect.key === key);
  const completed = effects.some(effect => effect.status === 'completed');
  const attentionNeeded = open.length > 0 || incomingTransfers.some(item => item.status === 'open') || trigger.findings.length > 0;
  const proposals = [];
  if (definition.lifecycle.status === 'active' && heads.length === 1 && !restore.suspended) {
    if (uncorrelatedTaskIds.length || effects.some(effect => ['pending', 'uncertain'].includes(effect.status))) proposals.push({ type: 'rediscover', effectKey: key, reason: uncorrelatedTaskIds.length ? 'Native tasks lack effect correlation. Rediscover their intended effects before another execution.' : 'Native effect is pending or uncertain. Read its actual state before another execution.', ...(uncorrelatedTaskIds.length ? { uncorrelatedTaskIds } : {}), execution: 'proposal-only' });
    else if (!completed || attentionNeeded) {
      const repeated = open.find(finding => finding.failedRepairs >= 2);
      const preferredType = trigger.findings.length ? 'rediscover' : repeated ? 'diagnose' : attentionNeeded ? 'observe-or-decide' : 'work';
      const type = authority.eligible ? preferredType : 'observe-or-decide';
      proposals.push({ type, effectKey: key, definitionHash: definition.hash, target: subjectKey(definition.target), reason: repeated ? repeated.id : open.map(finding => finding.code).join(', '), ...(completed ? { nativeRediscoveryRequired: true, nextStep: 'Read the actual native effect before continuing known work or deciding on another execution.' } : {}), execution: 'proposal-only' });
    }
  }
  return { schemaVersion: 1, type: 'review', responsibilityId: definition.id, definitionHash: definition.hash, ruleVersion, asOf, goal: definition.goal, context: definition.context, cloud: cloudSummary(cloudRecords, definition.id), fleet: fleetSummary([...definitions, ...observations, ...fleetRecords, ...(epoch ? [epoch] : [])], definition.id, asOf), target: definition.target, route, authority, restore, heads: heads.map(head => head.hash), observations: diagnostics, criterionResults, findings: retainedFindings.sort((left, right) => left.id.localeCompare(right.id)), repairs: repairResults.sort((left, right) => left.repairHash.localeCompare(right.repairHash)), corrections, proposals, incomingTransfers: incomingTransfers.sort((left, right) => left.findingId.localeCompare(right.findingId)), featureReviews: ordered(featureReviews).map(review => ({ ...review, assurance: 'reported' })), trigger, retirement, lifecycle: definition.lifecycle, reviewAt: definition.reviewAt, limits: ['Proposals are not native execution, permissions, delivery, or authenticated review.', 'Local evidence proves the inspected bytes or bounded command result, not native state.', 'No local process can detect total dormancy without an external wakeup.'] };
}

export async function adoptResponsibility(home, input) {
  const definition = parseDefinition(input);
  const { records } = await readStore(home);
  if (definition.lifecycle.replacementId) fail(definition.lifecycle.replacementId !== definition.id && records.some(record => record.type === 'definition' && record.id === definition.lifecycle.replacementId), 'Replacement responsibility must already exist and differ from this one');
  for (const findingId of definition.lifecycle.transferFindingIds ?? []) fail(records.some(record => record.type === 'review' && record.responsibilityId === definition.id && record.findings.some(finding => finding.id === findingId)), 'Transferred finding is not retained by this responsibility');
  const prepared = recordPayload(definition);
  validateReferences([...records, prepared]);
  const published = await publishRecord(home, definition);
  return { ...published, criteria: definition.criteria.map(criterion => ({ id: criterion.id, evidence: criterion.evidence, specHash: criterionHash(criterion) })) };
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
    const heads = definitionHeads(definitions);
    const definition = heads[0];
    const relevant = records.filter(record => record.responsibilityId === responsibilityId);
    const observations = relevant.filter(record => record.type === 'observation');
    const reviews = relevant.filter(record => record.type === 'review');
    const repairs = relevant.filter(record => record.type === 'repair');
    const featureReviews = relevant.filter(record => record.type === 'feature-review');
    const previousCriteria = reviews.flatMap(review => review.findings.filter(finding => finding.durable).flatMap(finding => finding.criteria));
    const criteria = [...new Map([...definition.criteria, ...previousCriteria].map(criterion => [criterionHash(criterion), criterion])).values()];
    const liveStart = reviewAsOf(asOf, new Date().toISOString());
    const local = heads.length === 1 ? await inspectLocal(definition, { bindings, catalog, machine, asOf: liveStart, epoch, observations, criteria: definition.lifecycle.status === 'active' ? criteria : [] }) : [];
    for (const item of local) { const published = await publishRecord(home, item.payload, item.files); if (!observations.some(record => record.hash === published.hash)) observations.push(published.record); if (!records.some(record => record.hash === published.hash)) records.push(published.record); }
    const relatedDefinitions = records.filter(record => record.type === 'definition' && record.id !== responsibilityId);
    const relatedReviews = records.filter(record => record.type === 'review' && record.responsibilityId !== responsibilityId);
    const effectiveAsOf = reviewAsOf(asOf, new Date().toISOString(), local.map(item => item.payload.observedAt));
    const cloudRecords = records.filter(record => record.type.startsWith('cloud-'));
    const fleetRecords = records.filter(record => record.type.startsWith('fleet-'));
    const state = { ...reconcileState(definition, { definitions, observations, repairs, reviews, featureReviews, relatedDefinitions, relatedReviews, cloudRecords, fleetRecords, epoch, bindings, catalog, machine, asOf: effectiveAsOf }), requestedAsOf: asOf };
    const inputHashes = [...new Set([...definitions, ...observations, ...repairs, ...reviews, ...featureReviews, ...cloudRecords, ...fleetRecords, ...relatedDefinitions, ...relatedReviews, ...(epoch ? [epoch] : [])].map(record => record.hash))].sort();
    const ruleDigest = digest(await Promise.all(['records.mjs', 'work.mjs', 'responsibilities.mjs', 'cloud.mjs', 'cloud-schema.mjs', 'fleet.mjs', 'fleet-state.mjs', 'fleet-schema.mjs', 'bounded-json.mjs'].map(name => readFile(new URL(name, import.meta.url), 'utf8'))));
    const published = await publishRecord(home, { ...state, inputHashes, inputContext: { bindings, catalog, machine }, ruleDigest });
    results.push(published);
  }
  return { asOf, responsibilities: results, pending, status: results.some(result => result.record.findings.some(finding => finding.status === 'open') || result.record.incomingTransfers.some(item => item.status === 'open') || result.record.fleet.some(item => item.status !== 'ready')) ? 'actionable' : 'current' };
}

export async function inspectHome(home) {
  const { records, pending } = await readStore(home);
  const epoch = latestEpoch(records);
  const ids = [...new Set(records.filter(record => record.type === 'definition').map(record => record.id))].sort();
  const suspension = epoch ? ids.map(id => {
    const heads = definitionHeads(records.filter(record => record.type === 'definition' && record.id === id));
    return { responsibilityId: id, ...(heads.length === 1 ? restoredState(epoch, records.filter(record => record.type === 'observation' && record.responsibilityId === id), heads[0], new Date().toISOString()) : { suspended: true, needed: ['definition-conflict'] }) };
  }) : [];
  const cloud = await cloudHealth(home, records);
  const fleet = fleetSummary(records); const fleetTurns = await fleetPendingTurns(home, records);
  return { cloud, cloudNeedsAttention: cloud.some(item => item.status !== 'ready'), fleet, fleetTurns, fleetNeedsAttention: fleetTurns.length > 0 || fleet.some(item => item.status !== 'ready'), records: records.length, pending, responsibilities: ids.length, restoredEpoch: epoch?.hash ?? null, restoredNeedsFreshObservations: suspension.some(item => item.suspended), suspension };
}

export function replayReview(review, records) {
  const byHash = new Map(records.map(record => [record.hash, record]));
  const selected = review.inputHashes.map(hash => { fail(byHash.has(hash), `Missing replay input ${hash}`); return byHash.get(hash); });
  const definition = byHash.get(review.definitionHash);
  fail(definition?.type === 'definition', 'Replay definition is absent');
  const context = { ...review.inputContext, asOf: review.asOf, definitions: selected.filter(record => record.type === 'definition' && record.id === review.responsibilityId), relatedDefinitions: selected.filter(record => record.type === 'definition' && record.id !== review.responsibilityId), observations: selected.filter(record => record.type === 'observation'), repairs: selected.filter(record => record.type === 'repair'), reviews: selected.filter(record => record.type === 'review' && record.responsibilityId === review.responsibilityId), relatedReviews: selected.filter(record => record.type === 'review' && record.responsibilityId !== review.responsibilityId), featureReviews: selected.filter(record => record.type === 'feature-review'), cloudRecords: selected.filter(record => record.type.startsWith('cloud-')), fleetRecords: selected.filter(record => record.type.startsWith('fleet-')), epoch: latestEpoch(selected) };
  return reconcileState(definition, context);
}
