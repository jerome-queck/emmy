import { captureProcessIncarnation, compareIncarnations } from '../src/process-incarnation.mjs';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, lstat, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { readStore, digest } from '../src/records.mjs';
import { replayReview } from '../src/responsibilities.mjs';

export async function driveCloud({ sourceRoot, root, home, run, scenario, report, children, evidenceDir }) {
  const directory = join(evidenceDir, 'cloud'); const privateHome = join(directory, 'private-home'); await mkdir(privateHome, { recursive: true });
  report.cloud = { provenance: 'synthetic fault fixtures and real bounded standard-library execution', controls: [], home: privateHome, independentProcesses: [], delivery: 'pending-parent-owned-dot', limits: ['No actual cloud provider acceptance, provider-wide enforcement, arbitrary external exactly-once, native access or delivered notification.'] };
  const retain = (name, value) => { report.cloud.controls.push({ name, ...value }); };
  const kernelWitness = await captureProcessIncarnation(); report.cloud.kernelWitness = kernelWitness; const kernelSupported = kernelWitness.status === 'observed';
  let preparedReceipt; const legacyHome = join(directory, 'legacy-analog-home');
  for (const phase of ['prepare', 'resume']) {
    const result = spawnSync(process.execPath, [join(sourceRoot, 'scripts/cloud-acceptance.mjs'), '--home', privateHome, '--phase', phase], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` } });
    await writeFile(join(directory, `${phase}-outer-output.json`), JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
    const summary = JSON.parse(result.stdout); const receipt = JSON.parse(await readFile(summary.report, 'utf8'));
    assert.equal(result.status, phase === 'resume' && !kernelSupported ? 1 : 0, result.stdout + result.stderr);
    assert.equal(summary.status, phase === 'prepare' ? 'prepared' : kernelSupported ? 'passed' : 'failed');
    if (phase === 'prepare') { preparedReceipt = receipt; await cp(privateHome, legacyHome, { recursive: true }); }
    if (phase === 'resume' && !kernelSupported) { assert.equal(receipt.calls.length, 0); assert.match(receipt.error.message, /incarnation is unknown/); }
    if (phase === 'resume' && kernelSupported) assert.equal(receipt.restart.comparison.status, 'different');
    report.cloud.independentProcesses.push(receipt.incarnation); retain(`acceptance-${phase}`, { report: summary.report, calls: receipt.calls.length, status: receipt.status, restartProof: phase === 'resume' ? kernelSupported ? 'observed-different' : 'unavailable-platform' : 'baseline' });
  }
  if (kernelSupported) assert.equal(compareIncarnations(...report.cloud.independentProcesses).status, 'different');
  const homeFor = id => id === 'cloud-acceptance' ? privateHome : join(directory, `${id}-home`);
  let sequence = 0;
  const fixture = async value => { const path = join(directory, `input-${sequence++}.json`); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); return path; };
  const invoke = async (id, operation, fields = {}, expected = null, env = {}) => {
    const file = await fixture({ schemaVersion: 1, responsibilityId: id, operation, ...fields });
    if (expected === null) {
      const result = spawnSync(process.execPath, [join(sourceRoot, 'scripts/agent.mjs'), 'cloud', '--file', file, '--home', homeFor(id)], { encoding: 'utf8', env: { ...process.env, ...env } });
      report.commands.push({ args: ['cloud', '--file', file], home: homeFor(id), code: result.status, stdout: result.stdout, stderr: result.stderr }); assert.ok([0, 3].includes(result.status), result.stdout); return JSON.parse(result.stdout).data;
    }
    return run(['cloud', '--file', file], expected, homeFor(id), env);
  };
  const now = () => new Date().toISOString(); const capacity = state => ({ synthetic: true, state, observedAt: now() });
  const job = (id, fields = {}) => ({ id, priority: 'interactive', payload: 'bounded', units: 2, ...fields });
  if (!kernelSupported) {
    await invoke('cloud-acceptance', 'tick', { capacity: capacity('available') }); await invoke('cloud-acceptance', 'tick', { capacity: capacity('available') }); await invoke('cloud-acceptance', 'tick', { capacity: capacity('available') });
    for (let n = 5; n <= 12; n++) { await invoke('cloud-acceptance', 'submit', { job: { id: `job-${n}`, priority: 'heavy', payload: `bounded standard-library payload ${n}`, units: 1, transientFailures: n === 6 ? 1 : 0 } }); let result = await invoke('cloud-acceptance', 'tick', { capacity: capacity('available') }); if (n === 6) result = await invoke('cloud-acceptance', 'tick', { capacity: capacity('available') }); assert.equal(result.outcome, 'finished'); }
    const completed = await invoke('cloud-acceptance', 'status'); assert.equal(completed.counts.finished, 12); retain('unsupported-platform-ordinary-work', { status: 'passed', restartProof: 'unavailable', scope: 'Direct isolated CLI fixture continuation; not acceptance resume.' });
  }
  const originalModernCheckpoint = await readFile(join(legacyHome, 'cloud-acceptance/cloud-acceptance/checkpoint.json')); await writeFile(join(directory, 'legacy-original-modern-checkpoint.json'), originalModernCheckpoint);
  const legacyCheckpoint = JSON.parse(originalModernCheckpoint); delete legacyCheckpoint.incarnation; delete legacyCheckpoint.responsibilityId;
  const legacyDirectory = join(legacyHome, 'cloud-acceptance/cloud-acceptance'); const checkpointPath = join(legacyDirectory, 'checkpoint.json'); await writeFile(checkpointPath, JSON.stringify(legacyCheckpoint));
  const preparePath = join(legacyDirectory, 'synthetic-original-prepare.json'); await writeFile(preparePath, JSON.stringify(preparedReceipt));
  const failedPath = join(legacyDirectory, 'synthetic-original-failed-resume.json'); const failedAt = new Date(Date.parse(legacyCheckpoint.preparedAt) + 1000).toISOString();
  await writeFile(failedPath, JSON.stringify({ schemaVersion: 1, phase: 'resume', status: 'failed', process: legacyCheckpoint.process, host: preparedReceipt.host, startedAt: failedAt, completedAt: failedAt, calls: [], provenance: 'Synthetic legacy PID-guard analogue; not an actual parent cloud receipt.', error: { message: 'Resume must use a genuinely fresh acceptance process' } }));
  const attestationPath = join(legacyDirectory, 'synthetic-parent-attestation.json'); const originals = {};
  for (const [name, path] of Object.entries({ checkpoint: checkpointPath, prepare: preparePath, failedResume: failedPath })) originals[name] = { path, sha256: digest(await readFile(path)) };
  const attestation = { schemaVersion: 1, kind: 'parent-reviewed-legacy-process-attestation', responsibilityId: 'cloud-acceptance', checkpoint: { ...originals.checkpoint, headHash: legacyCheckpoint.headHash, completedUnits: legacyCheckpoint.completedUnits, terminalEffects: legacyCheckpoint.terminalEffects }, prepare: { ...originals.prepare, toolCallRef: 'synthetic-prepare-call' }, failedResume: { ...originals.failedResume, toolCallRef: 'synthetic-distinct-resume-call' }, parentReview: { reference: 'Synthetic fixture review, not a real parent authority grant.', reviewedAt: failedAt, statement: 'Synthetic distinct attributable calls and original hashes were reviewed for this isolated fixture.' } };
  await writeFile(attestationPath, JSON.stringify(attestation));
  const legacyRun = async (phase, extra = []) => { const output = spawnSync(process.execPath, [join(sourceRoot, 'scripts/cloud-acceptance.mjs'), '--home', legacyHome, '--phase', phase, ...extra], { encoding: 'utf8', maxBuffer: 16777216 }); const summary = JSON.parse(output.stdout); const receipt = JSON.parse(await readFile(summary.report, 'utf8')); await writeFile(join(directory, `legacy-${phase}-${sequence++}.json`), JSON.stringify({ status: output.status, stdout: output.stdout, stderr: output.stderr, receipt }, null, 2)); return { output, summary, receipt }; };
  const legacyRefused = await legacyRun('resume'); assert.equal(legacyRefused.output.status, 1); assert.equal(legacyRefused.receipt.calls.length, 0); assert.match(legacyRefused.receipt.error.message, /migrate-legacy/);
  const partialDirectory = join(legacyDirectory, 'legacy-baselines'); await mkdir(partialDirectory, { recursive: true }); const partialPath = join(partialDirectory, `${'0'.repeat(64)}.json`); const partialBytes = Buffer.from('{"schemaVersion":1'); await writeFile(partialPath, partialBytes);
  const partialRefused = await legacyRun('resume', ['--baseline', partialPath]); assert.equal(partialRefused.output.status, 1); assert.equal(partialRefused.receipt.calls.length, 0); assert.match(partialRefused.receipt.error.message, /JSON|Expected|Unexpected|property|Unterminated/); assert.deepEqual(await readFile(partialPath), partialBytes); retain('partial-legacy-baseline-refusal', { status: 'passed', retained: partialPath });
  const journalBeforeMigration = digest((await readStore(legacyHome)).records);
  const migrated = await legacyRun('migrate-legacy', ['--attestation', attestationPath]); assert.equal(migrated.output.status, kernelSupported ? 0 : 1); assert.equal(migrated.receipt.calls.length, 0); assert.equal(digest((await readStore(legacyHome)).records), journalBeforeMigration);
  for (const value of Object.values(originals)) assert.equal(digest(await readFile(value.path)), value.sha256, 'Migration preserves every original receipt/checkpoint byte');
  if (kernelSupported) { assert.equal(migrated.summary.status, 'baseline-established'); const continued = await legacyRun('resume', ['--baseline', migrated.summary.baseline]); assert.equal(continued.output.status, 0); assert.equal(continued.receipt.restart.historicalPrepare, 'reported-parent-attestation'); assert.equal(continued.receipt.restart.resume, 'observed-different-incarnation'); assert.equal(continued.receipt.effects.length, 12); }
  else { assert.match(migrated.receipt.error.message, /Observed migration baseline unavailable/); }
  retain('legacy-attested-baseline-migration', { status: kernelSupported ? 'passed' : 'unavailable-platform', scope: 'Synthetic legacy analogue only. Original cloud checkpoint/report bytes were not available to this fixture.', journalUnchangedByMigration: true, originalBytesPreserved: true });
  const adopted = (await readStore(privateHome)).records.find(record => record.type === 'definition');
  const create = async (id, config = {}) => {
    await run(['responsibility', '--file', await fixture({ ...adopted, hash: undefined, id, resource: id, authorityRef: { ...adopted.authorityRef, resource: id } })], 0, homeFor(id));
    return invoke(id, 'configure', { config });
  };
  const competing = { ...adopted, hash: undefined, id: 'second-controller', resource: 'second-controller', authorityRef: { ...adopted.authorityRef, resource: 'second-controller' } };
  await run(['responsibility', '--file', await fixture(competing)], 0, privateHome);
  await run(['cloud', '--file', await fixture({ schemaVersion: 1, responsibilityId: competing.id, operation: 'configure' })], 2, privateHome);
  assert.equal((await readStore(privateHome)).records.filter(record => record.type === 'cloud-request').length, 1); retain('single-home-controller', { status: 'passed' });
  for (const mode of ['missing', 'malformed', 'legacy']) {
    const id = `owner-${mode}`; await create(id); const status = await invoke(id, 'status'); const claim = join(homeFor(id), 'cloud-turns', status.headHash); await mkdir(claim);
    const bytes = mode === 'malformed' ? '{"schemaVersion":1' : JSON.stringify({ schemaVersion: 1, responsibilityId: id, host: 'synthetic-legacy-owner', pid: 2, token: 'a'.repeat(64), at: now() });
    if (mode !== 'missing') await writeFile(join(claim, 'owner.json'), bytes);
    const uncertain = await invoke(id, 'status'); assert.equal(uncertain.status, 'unknown'); assert.equal(uncertain.turn.status, 'unknown'); const refused = await invoke(id, 'recover', { expectedOwnerToken: 'a'.repeat(64) }); assert.equal(refused.outcome, 'turn-unresolved');
    if (mode !== 'missing') assert.equal(await readFile(join(claim, 'owner.json'), 'utf8'), bytes);
    retain(`owner-${mode}-fail-closed`, { status: 'passed', provenance: 'isolated synthetic owner-file fixture' });
  }
  await create('fault-controller', { maxAttempts: 2, backoffMs: 1000, maxBackoffMs: 1000 });
  await invoke('fault-controller', 'submit', { job: job('exhaust', { transientFailures: 8 }) });
  const first = await invoke('fault-controller', 'tick', { capacity: capacity('available') }); assert.equal(first.outcome, 'retry-scheduled');
  const early = await invoke('fault-controller', 'tick', { capacity: capacity('available') }); assert.equal(early.outcome, 'backoff');
  const repeated = await invoke('fault-controller', 'submit', { job: job('exhaust', { transientFailures: 8 }) }); assert.equal(repeated.outcome, 'coalesced');
  const conflict = await invoke('fault-controller', 'submit', { job: job('exhaust', { payload: 'changed' }) }); assert.equal(conflict.outcome, 'identity-conflict');
  await invoke('fault-controller', 'submit', { job: job('oversize', { payload: 'a'.repeat(65537) }) }, 2);
  await invoke('fault-controller', 'suspend', { reason: 'Explicit fixture suspension; unrelated to OS sleeping.' });
  const stopped = await invoke('fault-controller', 'tick', { capacity: capacity('available') }); assert.equal(stopped.outcome, 'suspended');
  await invoke('fault-controller', 'resume', { reason: 'Explicit fixture resume.' });
  const signin = await invoke('fault-controller', 'health', { issue: { code: 'signin-blocked', scope: 'fixture-account', sourceRef: 'Synthetic blocked sign-in fixture.' } });
  const signinAgain = await invoke('fault-controller', 'health', { issue: { code: 'signin-blocked', scope: 'fixture-account', sourceRef: 'Synthetic repeated blocked sign-in fixture.' } }); assert.equal(signin.newEscalations.length, 1); assert.equal(signinAgain.newEscalations.length, 0); assert.equal(signin.pendingEscalations.at(-1).delivery, 'pending');
  const eligibleAt = Date.parse(first.state.jobs[0].nextEligibleAt);
  while (Date.now() < eligibleAt) await new Promise(resolve => setTimeout(resolve, Math.min(50, eligibleAt - Date.now())));
  const dead = await invoke('fault-controller', 'tick', { capacity: capacity('available') }); assert.equal(dead.outcome, 'dead'); assert.equal(dead.counts.dead, 1);
  const maxScope = 'x'.repeat(4096); const maxRef = 'r'.repeat(4096); const maximum = await invoke('fault-controller', 'health', { issue: { code: 'work-failed', scope: maxScope, sourceRef: maxRef } }); assert.equal(maximum.newEscalations[0].sourceRef, maxRef); assert.equal(maximum.newEscalations[0].reportedScope, maxScope); await readStore(homeFor('fault-controller'));
  retain('bounds-backoff-suspension-signin', { status: 'passed' });
  await create('actual-sampler', { maxLoadPerCpu: 100, minFreeMemoryBytes: 0, minFreeDiskBytes: 0 });
  await invoke('actual-sampler', 'submit', { job: job('tiny', { units: 1 }) });
  const measured = await invoke('actual-sampler', 'tick'); assert.equal(measured.sample.origin, 'observed-process'); assert.equal(measured.sample.synthetic, undefined); assert.equal(measured.outcome, 'finished'); assert.equal(measured.capacity.eligible, true); retain('actual-measured-tiny-workload', { sample: measured.sample, outcome: measured.outcome });
  const interrupt = async (id, operation, fields = {}) => {
    const file = await fixture({ schemaVersion: 1, responsibilityId: id, operation, ...fields }); const marker = join(directory, `marker-${sequence}.json`);
    const child = spawn(process.execPath, [join(sourceRoot, 'scripts/agent.mjs'), 'cloud', '--file', file, '--home', homeFor(id)], { env: { ...process.env, EMMY_VERIFY_BOUNDARY: 'record:files-written', EMMY_VERIFY_BOUNDARY_FILE: marker } }); children.add(child);
    let stdout = ''; let stderr = ''; child.stdout.on('data', bytes => stdout += bytes); child.stderr.on('data', bytes => stderr += bytes);
    const closed = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr })));
    try {
      const deadline = Date.now() + 10000; let frame;
      while (Date.now() < deadline) {
        try { const bytes = await readFile(marker, 'utf8'); if (bytes.endsWith('\n')) { frame = JSON.parse(bytes); break; } } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(frame?.pid, child.pid, 'Owned interrupted writer reached a complete publication marker');
      const busy = await invoke(id, 'status'); assert.equal(busy.turn.status, kernelSupported ? 'busy' : 'unknown'); assert.equal(busy.status, kernelSupported ? 'busy' : 'unknown');
      if (operation === 'tick') { const duplicate = await invoke(id, 'submit', { job: job('checkpoint', { units: 3 }) }); assert.equal(duplicate.outcome, 'coalesced'); }
      child.kill('SIGKILL'); const output = await closed; assert.equal(output.signal, 'SIGKILL'); children.delete(child); await writeFile(join(directory, `interruption-${sequence}.json`), JSON.stringify({ file, marker, frame, output, busy }, null, 2));
      const unknown = await invoke(id, 'status'); assert.equal(unknown.turn.status, kernelSupported ? 'abandoned' : 'unknown'); assert.equal(unknown.status, 'unknown'); assert.equal(unknown.pendingEscalations.at(-1).delivery, 'pending');
      const repeat = await invoke(id, 'status'); assert.equal(repeat.pendingEscalations.at(-1).id, unknown.pendingEscalations.at(-1).id);
      await run(['backup', '--to', join(directory, `must-refuse-${sequence}`)], 2, homeFor(id));
      const wrong = await invoke(id, 'recover', { expectedOwnerToken: '0'.repeat(64) }); assert.equal(wrong.outcome, 'turn-unresolved');
      if (!kernelSupported) { const refused = await invoke(id, 'recover', { expectedOwnerToken: unknown.turn.owner.token }); assert.equal(refused.outcome, 'turn-unresolved'); retain(`unsupported-owner-${operation}`, { status: 'verified-unavailable', evidence: unknown.turn.inspection }); return { unknown, supported: false }; }
      const recovered = await invoke(id, 'recover', { expectedOwnerToken: unknown.turn.owner.token }); assert.ok(['configured', 'checkpoint-recovered'].includes(recovered.outcome)); return { unknown, recovered, supported: true };
    } finally { if (children.has(child)) { child.kill('SIGKILL'); await closed; children.delete(child); } }
  };
  await create('interrupt-controller'); await invoke('interrupt-controller', 'submit', { job: job('checkpoint', { units: 3 }) });
  await invoke('interrupt-controller', 'tick', { capacity: capacity('available') });
  const cancelled = await interrupt('interrupt-controller', 'tick', { capacity: capacity('available') }); if (cancelled.supported) assert.equal(cancelled.recovered.state.jobs[0].completedUnits, 1);
  const journalId = cancelled.supported ? 'interrupt-controller' : 'journal-controller';
  if (!cancelled.supported) { await create(journalId); await invoke(journalId, 'submit', { job: job('checkpoint', { units: 3 }) }); await invoke(journalId, 'tick', { capacity: capacity('available') }); }
  await invoke(journalId, 'tick', { capacity: capacity('available') }); const final = await invoke(journalId, 'tick', { capacity: capacity('available') }); assert.equal(final.counts.finished, 1); assert.equal(final.state.jobs[0].completedUnits, 3);
  retain('abandoned-turn-checkpoint-recovery', { status: cancelled.supported ? 'passed' : 'unavailable-platform', checkpointUnits: 1, terminalEffects: 1 });
  const configureId = 'interrupted-configure'; await run(['responsibility', '--file', await fixture({ ...adopted, hash: undefined, id: configureId, resource: configureId, authorityRef: { ...adopted.authorityRef, resource: configureId } })], 0, homeFor(configureId));
  const boot = await interrupt(configureId, 'configure', { config: { maxPending: 3, reservedInteractive: 1, reservedMorning: 1 } }); if (boot.supported) assert.equal(boot.recovered.state.jobs.length, 0); retain('abandoned-configure-recovery', { status: boot.supported ? 'passed' : 'unavailable-platform' });
  const doctor = await run(['doctor'], 3, homeFor('fault-controller')); assert.ok(doctor.store.cloudNeedsAttention); assert.ok(doctor.store.cloud.some(item => item.pendingEscalations.length > 0));
  const faultDefinitions = (await readStore(homeFor('fault-controller'))).records.filter(record => record.type === 'definition'); const faultDefinition = faultDefinitions[0];
  await run(['responsibility', '--file', await fixture({ ...faultDefinition, hash: undefined, parents: [faultDefinition.hash], authorityRef: { ...faultDefinition.authorityRef, expiresAt: '2000-01-01T00:00:00Z' } })], 0, homeFor('fault-controller'));
  const revoked = await invoke('fault-controller', 'tick', { capacity: capacity('available') }, 2); assert.match(revoked.error, /unexpired cloud authority/);
  const revokedStatus = await invoke('fault-controller', 'status'); assert.equal(revokedStatus.scope.eligible, false); retain('current-authority-revocation', { status: 'passed' });
  await create('effect-drift');
  const effectDefinition = (await readStore(homeFor('effect-drift'))).records.find(record => record.type === 'definition');
  await run(['responsibility', '--file', await fixture({ ...effectDefinition, hash: undefined, parents: [effectDefinition.hash], feature: { ...effectDefinition.feature, intendedEffect: 'Changed intended effect requires a distinct controller binding.' } })], 0, homeFor('effect-drift'));
  const driftStatus = await invoke('effect-drift', 'status'); assert.equal(driftStatus.status, 'needs-attention'); assert.equal(driftStatus.scope.eligible, false); assert.match(driftStatus.scope.reason, /stable responsibility effect changed/);
  const driftDoctor = await run(['doctor'], 3, homeFor('effect-drift')); assert.equal(driftDoctor.status, 'needs-attention'); assert.ok(driftDoctor.store.cloudNeedsAttention);
  const driftTick = await invoke('effect-drift', 'tick', { capacity: capacity('available') }, 2); assert.match(driftTick.error, /stable responsibility effect changed/); retain('current-effect-identity-drift', { status: 'passed' });
  const review = await run(['reconcile', '--id', journalId, '--as-of', now()], 3, homeFor(journalId)); const journal = await readStore(homeFor(journalId)); const result = review.responsibilities[0].record;
  assert.ok(result.inputHashes.some(hash => journal.records.some(record => record.hash === hash && record.type.startsWith('cloud-'))));
  assert.deepEqual(replayReview(result, journal.records).cloud, result.cloud); retain('journal-replay-cloud-context', { status: 'passed', reviewHash: result.hash });
  const backup = join(directory, 'backup'); const restored = join(directory, 'restored'); await run(['backup', '--to', backup], 0, homeFor(journalId)); await run(['restore', '--from', backup, '--into', restored], 0, homeFor(journalId));
  const restoredFile = await fixture({ schemaVersion: 1, responsibilityId: journalId, operation: 'tick', capacity: capacity('available') }); const blocked = await run(['cloud', '--file', restoredFile], 3, restored); assert.equal(blocked.outcome, 'restore-suspended'); retain('archive-restore-suspension', { status: 'passed' });
  const suspendedStatusFile = await fixture({ schemaVersion: 1, responsibilityId: journalId, operation: 'status' }); const suspendedStatus = await run(['cloud', '--file', suspendedStatusFile], 3, restored); assert.equal(suspendedStatus.status, 'suspended');
  const restoredRecords = (await readStore(restored)).records; const epoch = restoredRecords.find(record => record.type === 'epoch'); const definition = restoredRecords.find(record => record.type === 'definition');
  const observations = ['target', 'authority', 'tasks', 'schedule'].map(category => ({ type: 'observation', responsibilityId: definition.id, subject: definition.target, observedAt: now(), observer: 'Synthetic current restored cloud acquisition', category, availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [], homeEpoch: epoch.hash, ...(category === 'authority' ? { authority: definition.authorityRef } : category === 'tasks' ? { tasks: [] } : category === 'schedule' ? { schedules: [] } : {}) }));
  await run(['reconcile', '--id', definition.id, '--as-of', now(), '--import', await fixture({ schemaVersion: 1, records: observations })], 3, restored);
  const freshButNotResumed = await run(['cloud', '--file', suspendedStatusFile], 3, restored); assert.equal(freshButNotResumed.status, 'suspended');
  const resumeFile = await fixture({ schemaVersion: 1, responsibilityId: definition.id, operation: 'resume', reason: 'Fresh scoped epoch observations verified in fixture.' }); const resumed = await run(['cloud', '--file', resumeFile], kernelSupported ? 3 : 0, restored); assert.equal(resumed.outcome, 'resumed'); assert.equal(resumed.state.epochHash, epoch.hash);
  const tickRestored = await run(['cloud', '--file', restoredFile], kernelSupported ? 3 : 0, restored); assert.equal(tickRestored.outcome, 'idle'); retain('fresh-epoch-explicit-resume', { status: 'passed' });
  assert.ok((await lstat(join(homeFor(journalId), 'records', final.headHash, 'record.json'))).isFile()); report.cloud.terminalRecordDigest = digest(await readFile(join(homeFor(journalId), 'records', final.headHash, 'record.json')));
  scenario('cloud-admission', 'Bounded twelve-job stdlib workload, real process restart, priority/backpressure, duplicates, actual measured sampler, injected monitoring/sign-in failures, pending escalation dedup, abandoned turn/configure recovery, journal replay and restored suspension.');
}
