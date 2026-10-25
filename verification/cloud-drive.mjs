import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { readStore, digest } from '../src/records.mjs';
import { replayReview } from '../src/responsibilities.mjs';

export async function driveCloud({ sourceRoot, root, home, run, scenario, report, children, evidenceDir }) {
  const directory = join(evidenceDir, 'cloud'); const privateHome = join(directory, 'private-home'); await mkdir(privateHome, { recursive: true });
  report.cloud = { provenance: 'synthetic fault fixtures and real bounded standard-library execution', controls: [], home: privateHome, independentProcesses: [], delivery: 'pending-parent-owned-dot', limits: ['No actual cloud provider acceptance, provider-wide enforcement, arbitrary external exactly-once, native access or delivered notification.'] };
  const retain = (name, value) => { report.cloud.controls.push({ name, ...value }); };
  for (const phase of ['prepare', 'resume']) {
    const result = spawnSync(process.execPath, [join(sourceRoot, 'scripts/cloud-acceptance.mjs'), '--home', privateHome, '--phase', phase], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` } });
    await writeFile(join(directory, `${phase}-outer-output.json`), JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
    assert.equal(result.status, 0, result.stdout + result.stderr); const summary = JSON.parse(result.stdout); const receipt = JSON.parse(await readFile(summary.report, 'utf8'));
    assert.equal(summary.status, phase === 'prepare' ? 'prepared' : 'passed'); report.cloud.independentProcesses.push(receipt.process); retain(`acceptance-${phase}`, { report: summary.report, calls: receipt.calls.length, status: receipt.status });
  }
  assert.notEqual(...report.cloud.independentProcesses);
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
  const adopted = (await readStore(privateHome)).records.find(record => record.type === 'definition');
  const create = async (id, config = {}) => {
    await run(['responsibility', '--file', await fixture({ ...adopted, hash: undefined, id, resource: id, authorityRef: { ...adopted.authorityRef, resource: id } })], 0, homeFor(id));
    return invoke(id, 'configure', { config });
  };
  const competing = { ...adopted, hash: undefined, id: 'second-controller', resource: 'second-controller', authorityRef: { ...adopted.authorityRef, resource: 'second-controller' } };
  await run(['responsibility', '--file', await fixture(competing)], 0, privateHome);
  await run(['cloud', '--file', await fixture({ schemaVersion: 1, responsibilityId: competing.id, operation: 'configure' })], 2, privateHome);
  assert.equal((await readStore(privateHome)).records.filter(record => record.type === 'cloud-request').length, 1); retain('single-home-controller', { status: 'passed' });
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
      const busy = await invoke(id, 'status'); assert.equal(busy.turn.status, 'busy'); assert.equal(busy.status, 'busy');
      if (operation === 'tick') { const duplicate = await invoke(id, 'submit', { job: job('checkpoint', { units: 3 }) }); assert.equal(duplicate.outcome, 'coalesced'); }
      child.kill('SIGKILL'); const output = await closed; assert.equal(output.signal, 'SIGKILL'); children.delete(child); await writeFile(join(directory, `interruption-${sequence}.json`), JSON.stringify({ file, marker, frame, output, busy }, null, 2));
      const unknown = await invoke(id, 'status'); assert.equal(unknown.turn.status, 'abandoned'); assert.equal(unknown.status, 'unknown'); assert.equal(unknown.pendingEscalations.at(-1).delivery, 'pending');
      const repeat = await invoke(id, 'status'); assert.equal(repeat.pendingEscalations.at(-1).id, unknown.pendingEscalations.at(-1).id);
      await run(['backup', '--to', join(directory, `must-refuse-${sequence}`)], 2, homeFor(id));
      const wrong = await invoke(id, 'recover', { expectedOwnerToken: '0'.repeat(64) }); assert.equal(wrong.outcome, 'turn-unresolved');
      const recovered = await invoke(id, 'recover', { expectedOwnerToken: unknown.turn.owner.token }); assert.ok(['configured', 'checkpoint-recovered'].includes(recovered.outcome)); return { unknown, recovered };
    } finally { if (children.has(child)) { child.kill('SIGKILL'); await closed; children.delete(child); } }
  };
  await create('interrupt-controller'); await invoke('interrupt-controller', 'submit', { job: job('checkpoint', { units: 3 }) });
  await invoke('interrupt-controller', 'tick', { capacity: capacity('available') });
  const cancelled = await interrupt('interrupt-controller', 'tick', { capacity: capacity('available') }); assert.equal(cancelled.recovered.state.jobs[0].completedUnits, 1);
  await invoke('interrupt-controller', 'tick', { capacity: capacity('available') }); const final = await invoke('interrupt-controller', 'tick', { capacity: capacity('available') }); assert.equal(final.counts.finished, 1); assert.equal(final.state.jobs[0].completedUnits, 3);
  retain('abandoned-turn-checkpoint-recovery', { status: 'passed', checkpointUnits: 1, terminalEffects: 1 });
  const configureId = 'interrupted-configure'; await run(['responsibility', '--file', await fixture({ ...adopted, hash: undefined, id: configureId, resource: configureId, authorityRef: { ...adopted.authorityRef, resource: configureId } })], 0, homeFor(configureId));
  const boot = await interrupt(configureId, 'configure', { config: { maxPending: 3, reservedInteractive: 1, reservedMorning: 1 } }); assert.equal(boot.recovered.state.jobs.length, 0); retain('abandoned-configure-recovery', { status: 'passed' });
  const doctor = await run(['doctor'], 3, homeFor('fault-controller')); assert.ok(doctor.store.cloudNeedsAttention); assert.ok(doctor.store.cloud.some(item => item.pendingEscalations.length > 0));
  const faultDefinitions = (await readStore(homeFor('fault-controller'))).records.filter(record => record.type === 'definition'); const faultDefinition = faultDefinitions[0];
  await run(['responsibility', '--file', await fixture({ ...faultDefinition, hash: undefined, parents: [faultDefinition.hash], authorityRef: { ...faultDefinition.authorityRef, expiresAt: '2000-01-01T00:00:00Z' } })], 0, homeFor('fault-controller'));
  const revoked = await invoke('fault-controller', 'tick', { capacity: capacity('available') }, 2); assert.match(revoked.error, /unexpired cloud authority/);
  const revokedStatus = await invoke('fault-controller', 'status'); assert.equal(revokedStatus.scope.eligible, false); retain('current-authority-revocation', { status: 'passed' });
  const review = await run(['reconcile', '--id', 'interrupt-controller', '--as-of', now()], 3, homeFor('interrupt-controller')); const journal = await readStore(homeFor('interrupt-controller')); const result = review.responsibilities[0].record;
  assert.ok(result.inputHashes.some(hash => journal.records.some(record => record.hash === hash && record.type.startsWith('cloud-'))));
  assert.deepEqual(replayReview(result, journal.records).cloud, result.cloud); retain('journal-replay-cloud-context', { status: 'passed', reviewHash: result.hash });
  const backup = join(directory, 'backup'); const restored = join(directory, 'restored'); await run(['backup', '--to', backup], 0, homeFor('interrupt-controller')); await run(['restore', '--from', backup, '--into', restored], 0, homeFor('interrupt-controller'));
  const restoredFile = await fixture({ schemaVersion: 1, responsibilityId: 'interrupt-controller', operation: 'tick', capacity: capacity('available') }); const blocked = await run(['cloud', '--file', restoredFile], 3, restored); assert.equal(blocked.outcome, 'restore-suspended'); retain('archive-restore-suspension', { status: 'passed' });
  const suspendedStatusFile = await fixture({ schemaVersion: 1, responsibilityId: 'interrupt-controller', operation: 'status' }); const suspendedStatus = await run(['cloud', '--file', suspendedStatusFile], 3, restored); assert.equal(suspendedStatus.status, 'suspended');
  const restoredRecords = (await readStore(restored)).records; const epoch = restoredRecords.find(record => record.type === 'epoch'); const definition = restoredRecords.find(record => record.type === 'definition');
  const observations = ['target', 'authority', 'tasks', 'schedule'].map(category => ({ type: 'observation', responsibilityId: definition.id, subject: definition.target, observedAt: now(), observer: 'Synthetic current restored cloud acquisition', category, availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [], homeEpoch: epoch.hash, ...(category === 'authority' ? { authority: definition.authorityRef } : category === 'tasks' ? { tasks: [] } : category === 'schedule' ? { schedules: [] } : {}) }));
  await run(['reconcile', '--id', definition.id, '--as-of', now(), '--import', await fixture({ schemaVersion: 1, records: observations })], 3, restored);
  const freshButNotResumed = await run(['cloud', '--file', suspendedStatusFile], 3, restored); assert.equal(freshButNotResumed.status, 'suspended');
  const resumeFile = await fixture({ schemaVersion: 1, responsibilityId: definition.id, operation: 'resume', reason: 'Fresh scoped epoch observations verified in fixture.' }); const resumed = await run(['cloud', '--file', resumeFile], 3, restored); assert.equal(resumed.outcome, 'resumed'); assert.equal(resumed.state.epochHash, epoch.hash);
  const tickRestored = await run(['cloud', '--file', restoredFile], 3, restored); assert.equal(tickRestored.outcome, 'idle'); retain('fresh-epoch-explicit-resume', { status: 'passed' });
  assert.ok((await lstat(join(homeFor('interrupt-controller'), 'records', final.headHash, 'record.json'))).isFile()); report.cloud.terminalRecordDigest = digest(await readFile(join(homeFor('interrupt-controller'), 'records', final.headHash, 'record.json')));
  scenario('cloud-admission', 'Bounded twelve-job stdlib workload, real process restart, priority/backpressure, duplicates, actual measured sampler, injected monitoring/sign-in failures, pending escalation dedup, abandoned turn/configure recovery, journal replay and restored suspension.');
}
