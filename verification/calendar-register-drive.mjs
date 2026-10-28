import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { digest } from '../src/records.mjs';
import { bindRegister, refreshRegisterEvidence, registerFixture, registerHash } from './calendar-register-fixtures.mjs';
import { academicOsPlanFixture } from './academic-os-plan-fixtures.mjs';
import { timingRegisterFixture, syntheticTimingPacket, syntheticTimingReceipt } from './calendar-timing-fixtures.mjs';

export async function driveCalendarRegister({ home, run, scenario, report }) {
  const directory = join(home, 'calendar/register');
  await mkdir(directory, { recursive: true });
  const input = registerFixture(new Date().toISOString());
  const providerData = join(directory, 'provider-data.json');
  const providerLog = join(directory, 'provider-requests.jsonl');
  await writeFile(providerData, JSON.stringify(input.snapshot));
  const academicOsRoot = join(directory, 'academic-os-fixture');
  const packageDirectory = join(academicOsRoot, 'node_modules/google-auth-library');
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(join(academicOsRoot, 'package.json'), '{"name":"synthetic-academic-os"}\n');
  await writeFile(join(packageDirectory, 'package.json'), '{"main":"index.cjs"}\n');
  await writeFile(join(packageDirectory, 'index.cjs'), `const fs = require('node:fs');
module.exports.GoogleAuth = class {
  constructor(options) { this.options = options; }
  async request(options) {
    if (options.method !== 'GET') throw new Error('Non-read refused');
    fs.appendFileSync(process.env.EMMY_REGISTER_PROVIDER_LOG, JSON.stringify({ options, scopes: this.options.scopes })+'\\n');
    const s = JSON.parse(fs.readFileSync(process.env.EMMY_REGISTER_PROVIDER_DATA));
    const path = new URL(options.url).pathname;
    if (path.endsWith('/calendarList')) return { data: { items: s.calendars.map(c => ({id:c.id,summary:c.title,timeZone:c.timeZone,accessRole:c.accessRole})) } };
    if (path.endsWith('/users/@me/lists')) return { data: { items: s.taskLists.map(c => ({id:c.id,title:c.title})) } };
    if (path.endsWith('/events')) return { data: { items: s.calendars[0].events } };
    if (path.endsWith('/tasks')) { if(process.env.EMMY_REGISTER_PROVIDER_FAULT) throw new Error('synthetic request failure'); return { data: { items: s.taskLists[0].tasks } }; }
    throw new Error('Unknown fixture route');
  }
};\n`);
  const configFile = join(directory, 'academic-os.config.json');
  await writeFile(configFile, JSON.stringify({ calendar: { credentials: { scheduledRead: join(directory, 'synthetic-calendar-read.credentials.json') } }, tasks: { credentials: { scheduledRead: join(directory, 'synthetic-tasks-read.credentials.json') } } }));
  const refreshFile = join(directory, 'refresh.json');
  await writeFile(refreshFile, JSON.stringify({ schemaVersion: 1, action: 'refresh', scope: input.snapshot.scope, academicOsRoot, configFile }));
  const env = { EMMY_REGISTER_PROVIDER_DATA: providerData, EMMY_REGISTER_PROVIDER_LOG: providerLog };
  const refresh = await run(['calendar-register', '--file', refreshFile], 0, home, env);
  assert.equal(refresh.status, 'collected'); assert.equal(refresh.execution, 'provider-reads-only'); assert.equal(refresh.taskTiming, 'unsupported-by-rest-needs-native-readback');
  input.snapshot = JSON.parse(await readFile(refresh.file, 'utf8'));
  const snapshotFile = join(directory, 'assessed-snapshot.json');
  const requestFile = join(directory, 'request.json');
  const envelopeFile = join(directory, 'assess.json');
  await writeFile(envelopeFile, JSON.stringify({ schemaVersion: 1, action: 'assess', snapshotFile, requestFile }));
  const assess = async (name, expected, mutate, assertion) => {
    const candidate = structuredClone(input); mutate(candidate); candidate.request.history.completeThrough = new Date().toISOString(); bindRegister(candidate);
    await writeFile(snapshotFile, JSON.stringify(candidate.snapshot)); await writeFile(requestFile, JSON.stringify(candidate.request));
    const before = [digest(await readFile(snapshotFile)), digest(await readFile(requestFile))];
    const result = await run(['calendar-register', '--file', envelopeFile], expected);
    assert.equal(result.execution, 'none'); assertion(result);
    assert.deepEqual([digest(await readFile(snapshotFile)), digest(await readFile(requestFile))], before);
    await writeFile(join(directory, `${name}.result.json`), JSON.stringify(result, null, 2));
    return result;
  };
  const baseline = await assess('proposed', 0, () => {}, result => {
    assert.equal(result.status, 'proposed'); assert.equal(result.proposals[0].sourceTiming.actualDurationMinutes, 40);
    assert.equal(result.proposals[0].changes.durationMinutes, 60); assert.equal(result.availability.freeIntervals.length, 3);
  });
  await assess('unknown-task-timing', 3, candidate => { candidate.request.taskSchedules = []; }, result => assert.equal(result.availability.freeIntervals, null));
  await assess('new-owner-event', 3, candidate => {
    candidate.snapshot.calendars[0].events.push({ id: 'new-owner-event', summary: 'New owner event', status: 'confirmed', start: { dateTime: candidate.request.operations[0].changes.start }, end: { dateTime: candidate.request.operations[0].changes.end } });
  }, result => assert.ok(result.findings.some(row => row.code === 'overlap')));
  await assess('protected-free-meal', 3, candidate => {
    const date = candidate.request.window.start.slice(0, 10);
    Object.assign(candidate.request.operations[0].changes, { start: `${date}T12:00:00Z`, end: `${date}T13:00:00Z` });
  }, result => assert.ok(result.proposals[0].findings.includes('overlap')));
  await assess('unsupported-api-duration', 3, candidate => { candidate.request.operations[0].transport = 'academic-os-mcp'; }, result => assert.ok(result.proposals[0].findings.includes('unsupported-provider-operation')));
  await assess('visual-review-missing', 3, candidate => { delete candidate.request.visualReview; }, result => assert.equal(result.visualReview, 'required'));
  const definitionFile = join(directory, 'coordination-definition.json');
  const definition = { id: 'calendar-coordination', parents: [], workClass: 'calendar-planning', goal: 'Plan calendar operations in the cloud.', context: 'Synthetic typed handoff with no native execution.', action: 'plan-calendar', resource: 'synthetic-calendar', destination: 'exact-local-plan', target: { projectId: 'fixture', repository: 'https://example.invalid/fixture', executor: 'dot-cloud', hostId: 'synthetic-cloud', revision: 'reported-source', dirtyDigest: 'reported-source' }, authorityRef: { reference: 'Synthetic owner request', action: 'plan-calendar', resource: 'synthetic-calendar', destination: 'exact-local-plan' }, criteria: [{ id: 'saved-fields', description: 'Fresh same-ID final readbacks.', evidence: 'reported-check' }], freshness: { maxAgeMs: 60000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'calendar-planning', method: 'Cloud plan and exact local application.', intendedEffect: 'Review declared saved calendar fields.', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' } };
  for (const executor of [null, 'local-codex', 'codex-cloud']) {
    const candidate = structuredClone(definition);
    if (executor === null) delete candidate.target.executor; else candidate.target.executor = executor;
    await writeFile(definitionFile, JSON.stringify(candidate));
    const refusal = await run(['responsibility', '--file', definitionFile], 2);
    assert.ok(refusal.error.includes('explicit target.executor dot-cloud'));
  }
  await writeFile(definitionFile, JSON.stringify(definition));
  const adopted = await run(['responsibility', '--file', definitionFile]);
  const packetFile = join(directory, 'handoff-packet.json');
  const handoffFile = join(directory, 'handoff.json');
  await writeFile(handoffFile, JSON.stringify({ schemaVersion: 1, action: 'handoff', snapshotFile, requestFile, packetFile }));
  const handoffInput = timingRegisterFixture(new Date().toISOString());
  handoffInput.evaluatedAt = new Date().toISOString(); refreshRegisterEvidence(handoffInput);
  const handoff = async (name, value, expected, candidate = handoffInput, withTiming = true) => {
    const packet = { ...value, ...(withTiming ? { timing: value.timing ?? syntheticTimingPacket(candidate, value.plan) } : {}) };
    if (value.receipts) packet.receipts = value.receipts.map(receipt => {
      const prepared = value.preflights?.find(row => row.preflightDigest === receipt.preflightDigest)?.timing;
      return receipt.outcome === 'verified' && prepared && !receipt.timing ? { ...receipt, timing: syntheticTimingReceipt(prepared, receipt.observedAt) } : receipt;
    });
    await writeFile(snapshotFile, JSON.stringify(candidate.snapshot)); await writeFile(requestFile, JSON.stringify(candidate.request)); await writeFile(packetFile, JSON.stringify(packet));
    const before = await Promise.all([snapshotFile, requestFile, packetFile].map(async file => digest(await readFile(file))));
    const result = await run(['calendar-register', '--file', handoffFile], expected);
    assert.equal(result.execution, 'none');
    assert.deepEqual(await Promise.all([snapshotFile, requestFile, packetFile].map(async file => digest(await readFile(file)))), before);
    for (const [suffix, file] of [['snapshot', snapshotFile], ['request', requestFile], ['packet', packetFile]]) await writeFile(join(directory, `${name}.${suffix}.json`), await readFile(file));
    await writeFile(join(directory, `${name}.result.json`), JSON.stringify(result, null, 2));
    return result;
  };
  const header = { schemaVersion: 1, policyDigest: digest('synthetic-owner-policy'), coordinationDefinitionHash: adopted.hash };
  const missingTiming = await handoff('timing-missing-plan', { ...header, stage: 'plan', executor: 'dot-cloud' }, 3, handoffInput, false);
  assert.ok(missingTiming.findings.includes('timing-contract-required'));
  const staleTiming = syntheticTimingPacket(handoffInput);
  staleTiming.observations[0].zoneObservation.observedAt = new Date(Date.parse(handoffInput.evaluatedAt) - 60001).toISOString();
  assert.ok((await handoff('timing-stale-zone', { ...header, stage: 'plan', executor: 'dot-cloud', timing: staleTiming }, 3)).findings.includes('stale-zone-observation'));
  const futureTiming = syntheticTimingPacket(handoffInput);
  futureTiming.observations[0].zoneObservation.observedAt = new Date(Date.now() + 60000).toISOString();
  assert.ok((await handoff('timing-future-zone', { ...header, stage: 'plan', executor: 'dot-cloud', timing: futureTiming }, 3)).findings.includes('future-zone-observation'));
  const wrongInterface = syntheticTimingPacket(handoffInput);
  wrongInterface.targets[0].target.inputTimeZone = 'Asia/Bangkok';
  wrongInterface.observations[0].zoneObservation.inputTimeZone = 'Asia/Bangkok';
  assert.ok((await handoff('timing-wrong-interface-compensation', { ...header, stage: 'plan', executor: 'dot-cloud', timing: wrongInterface }, 3)).findings.includes('unsupported-editor-zone-route'));
  const cloudPlan = await handoff('cloud-plan', { ...header, stage: 'plan', executor: 'dot-cloud' }, 0);
  assert.equal(cloudPlan.status, 'cloud-plan-ready');
  handoffInput.evaluatedAt = new Date().toISOString(); refreshRegisterEvidence(handoffInput);
  handoffInput.request.visualReview.observedAt = handoffInput.evaluatedAt;
  const operation = cloudPlan.plan.operations[0];
  const localPacket = { ...header, stage: 'preflight', executor: 'local-executor', plan: cloudPlan.plan, operationDigest: operation.operationDigest };
  const preflight = await handoff('local-preflight', localPacket, 0);
  assert.equal(preflight.status, 'preflight-ready'); assert.notEqual(preflight.snapshotDigest, cloudPlan.plan.snapshotDigest);
  assert.equal(preflight.preflight.timing.editorInput.start.time, operation.prepared.operation.changes.start.slice(11, 16));
  const repeated = await handoff('timing-repeat-preparation', localPacket, 0);
  assert.deepEqual(repeated.preflight.timing, preflight.preflight.timing);
  assert.ok((await handoff('timing-missing-preflight', localPacket, 3, handoffInput, false)).findings.includes('timing-contract-required'));
  const changed = structuredClone(handoffInput); changed.request.operations[0].changes.title += ' locally changed';
  assert.equal((await handoff('local-change-refused', localPacket, 3, changed)).status, 'return-to-cloud');
  const attemptedAt = new Date().toISOString();
  const uncertainReceipt = { planDigest: cloudPlan.plan.planDigest, operationDigest: operation.operationDigest, preflightDigest: preflight.preflight.preflightDigest, identity: operation.prepared.operation.identity, itemType: 'task', outcome: 'uncertain', attemptedAt, observedAt: attemptedAt, completedEffectKeys: [], evidenceRef: 'synthetic-first-interrupted-save', reason: 'Save response lost; inspect same native identity before retry.' };
  const uncertain = await handoff('uncertain-save-held', { ...localPacket, preflights: [preflight.preflight], receipts: [uncertainReceipt] }, 3);
  assert.equal(uncertain.reports[0].outcome, 'uncertain'); assert.deepEqual(uncertain.reports[0].target, uncertainReceipt.identity);
  assert.equal((await handoff('worker-done-insufficient', { ...header, stage: 'accept', executor: 'dot-cloud', plan: cloudPlan.plan, receipts: [] }, 3)).status, 'return-to-cloud');
  const verifiedAt = new Date().toISOString();
  const savedInput = structuredClone(handoffInput);
  savedInput.request.attempts = [{ identity: operation.prepared.operation.identity, effectKey: operation.effectKey, operationDigest: operation.operationDigest, prepared: operation.prepared, state: 'uncertain', attemptedAt, evidenceRef: uncertainReceipt.evidenceRef }];
  savedInput.request.taskSchedules[0].intervals = [{ start: operation.prepared.operation.changes.start, end: operation.prepared.operation.changes.end }];
  savedInput.evaluatedAt = new Date(Date.parse(verifiedAt) + 1).toISOString(); refreshRegisterEvidence(savedInput); savedInput.request.visualReview.observedAt = savedInput.evaluatedAt;
  savedInput.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: savedInput.request.snapshotDigest, evidenceRef: 'synthetic-independent-same-id-readback' };
  const verifiedReceipt = { ...uncertainReceipt, outcome: 'verified', observedAt: verifiedAt, completedEffectKeys: [operation.effectKey], evidenceRef: 'synthetic-verified-same-attempt', reason: null };
  const accepted = await handoff('root-final-same-id', { ...header, stage: 'accept', executor: 'dot-cloud', plan: cloudPlan.plan, preflights: [preflight.preflight], receipts: [uncertainReceipt, verifiedReceipt] }, 0, savedInput);
  assert.equal(accepted.status, 'accepted-reported'); assert.equal(accepted.reports[0].outcome, 'uncertain'); assert.equal(accepted.assessment.proposals[0].status, 'already-saved');
  const acceptedPacket = { ...header, stage: 'accept', executor: 'dot-cloud', plan: cloudPlan.plan, preflights: [preflight.preflight], receipts: [uncertainReceipt, verifiedReceipt] };
  assert.equal((await handoff('timing-missing-accept', acceptedPacket, 3, savedInput, false)).status, 'return-to-cloud');
  const wrongReadback = syntheticTimingPacket(savedInput, cloudPlan.plan);
  wrongReadback.observations[0].readback.start.time = '10:00';
  assert.ok((await handoff('timing-sgt-final-mismatch', { ...acceptedPacket, timing: wrongReadback }, 3, savedInput)).findings.includes('calendar-sgt-interval-mismatch'));
  const wrongReceipt = { ...verifiedReceipt, timing: syntheticTimingReceipt(preflight.preflight.timing, verifiedAt) };
  wrongReceipt.timing.readback.nativeIdentity = null; wrongReceipt.timing.readback.projectionId = 'synthetic-stable-calendar-projection';
  const projectionOnly = await handoff('timing-projection-only-receipt', { ...acceptedPacket, receipts: [uncertainReceipt, wrongReceipt] }, 3, savedInput);
  assert.ok(projectionOnly.findings.includes('exact-native-task-readback-required')); assert.deepEqual(projectionOnly.reports[1].completedEffectKeys, []);
  const clockInput = (start, end, windowStart, windowEnd) => {
    const candidate = timingRegisterFixture(new Date().toISOString());
    const window = { start: windowStart, end: windowEnd, timeZone: 'Asia/Singapore' };
    candidate.snapshot.scope.window = window; candidate.request.window = window;
    candidate.request.workingIntervals = [{ start: window.start, end: window.end }];
    candidate.request.visualReview.window = window;
    for (const schedule of candidate.request.taskSchedules) schedule.window = window;
    for (const calendar of candidate.snapshot.calendars) for (const page of calendar.collection.pages) Object.assign(page.query, { timeMin: window.start, timeMax: window.end });
    Object.assign(candidate.request.operations[0].changes, { start, end, date: start.slice(0, 10) });
    refreshRegisterEvidence(candidate); candidate.request.visualReview.observedAt = candidate.evaluatedAt;
    return candidate;
  };
  const day = handoffInput.request.operations[0].changes.date;
  for (const [name, candidate, expectedStart] of [
    ['standalone-bangkok', clockInput(`${day}T11:00:00+08:00`, `${day}T12:00:00+08:00`, `${day}T08:00:00+08:00`, `${day}T18:00:00+08:00`), { date: day, time: '10:00' }],
    ['standalone-rollover', clockInput('2027-01-01T00:30:00+08:00', '2027-01-01T01:30:00+08:00', '2026-12-31T22:00:00+08:00', '2027-01-01T03:00:00+08:00'), { date: '2026-12-31', time: '23:30' }],
  ]) {
    const timing = syntheticTimingPacket(candidate, null, 'standalone-tasks-editor');
    const planned = await handoff(`timing-${name}-plan`, { ...header, stage: 'plan', executor: 'dot-cloud', timing }, 0, candidate);
    candidate.evaluatedAt = new Date().toISOString(); refreshRegisterEvidence(candidate); candidate.request.visualReview.observedAt = candidate.evaluatedAt;
    const checked = await handoff(`timing-${name}-preflight`, { ...header, stage: 'preflight', executor: 'local-executor', plan: planned.plan, operationDigest: planned.plan.operations[0].operationDigest }, 0, candidate);
    assert.deepEqual(checked.preflight.timing.editorInput.start, expectedStart);
    if (name === 'standalone-rollover') assert.deepEqual(checked.preflight.timing.editorInput.end, { date: '2027-01-01', time: '00:30' });
    assert.equal(checked.preflight.timing.canonical.interval.start, candidate.request.operations[0].changes.start);
    const again = await handoff(`timing-${name}-repeat`, { ...header, stage: 'preflight', executor: 'local-executor', plan: planned.plan, operationDigest: planned.plan.operations[0].operationDigest }, 0, candidate);
    assert.deepEqual(again.preflight.timing, checked.preflight.timing);
    const row = planned.plan.operations[0];
    const attemptedAt = new Date().toISOString();
    const observedAt = new Date(Date.parse(attemptedAt) + 1).toISOString();
    const receipt = { planDigest: planned.plan.planDigest, operationDigest: row.operationDigest, preflightDigest: checked.preflight.preflightDigest, identity: row.prepared.operation.identity, itemType: 'task', outcome: 'verified', attemptedAt, observedAt, completedEffectKeys: [row.effectKey], evidenceRef: `synthetic-${name}-calendar-reopen`, timing: syntheticTimingReceipt(checked.preflight.timing, observedAt) };
    candidate.snapshot.taskLists[0].tasks[0].due = `${row.prepared.operation.changes.date}T00:00:00.000Z`;
    candidate.request.taskSchedules[0].taskDigest = registerHash(candidate.snapshot.taskLists[0].tasks[0]);
    candidate.request.taskSchedules[0].intervals = [{ start: row.prepared.operation.changes.start, end: row.prepared.operation.changes.end }];
    candidate.request.attempts = [{ identity: row.prepared.operation.identity, effectKey: row.effectKey, operationDigest: row.operationDigest, prepared: row.prepared, state: 'intent', attemptedAt, evidenceRef: `synthetic-${name}-original-intent` }];
    candidate.evaluatedAt = new Date(Date.parse(observedAt) + 1).toISOString(); refreshRegisterEvidence(candidate); candidate.request.visualReview.observedAt = candidate.evaluatedAt;
    candidate.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: candidate.request.snapshotDigest, evidenceRef: `synthetic-${name}-fresh-root-window` };
    assert.equal((await handoff(`timing-${name}-accept`, { ...header, stage: 'accept', executor: 'dot-cloud', plan: planned.plan, preflights: [checked.preflight], receipts: [receipt] }, 0, candidate)).status, 'accepted-reported');
  }
  const apiEnvelope = join(directory, 'academic-os.envelope.json');
  const apiRequest = join(directory, 'academic-os.request.json');
  await writeFile(apiEnvelope, JSON.stringify({ schemaVersion: 1, action: 'academic-os', requestFile: apiRequest }));
  const api = async (name, body, expected = 0) => {
    const bytes = JSON.stringify(body); await writeFile(apiRequest, bytes);
    const output = await run(['calendar-register', '--file', apiEnvelope], expected);
    assert.equal(await readFile(apiRequest, 'utf8'), bytes);
    await writeFile(join(directory, `academic-os-${name}.input.json`), bytes);
    await writeFile(join(directory, `academic-os-${name}.output.json`), JSON.stringify(output));
    return output;
  };
  let apiPrepared;
  for (const name of ['create', 'change', 'complete']) {
    const fixture = academicOsPlanFixture(name);
    fixture.observation.result = { content: [{ type: 'text', text: JSON.stringify(fixture.observation.result.report) }], isError: false };
    const output = await api(name, { schemaVersion: 1, stage: 'prepare', intent: fixture.intent, observation: fixture.observation });
    assert.equal(output.status, 'api-plan-ready-reported'); assert.equal(output.execution, 'none');
    assert.equal(JSON.parse(output.call.arguments.plan_json).operation.name, name);
    if (name === 'create') apiPrepared = output.prepared;
  }
  const apiAttempt = new Date().toISOString();
  const apiReply = { attemptedAt: apiAttempt, observedAt: apiAttempt, evidenceRef: 'synthetic-original-api-report', report: { schemaVersion: 1, operationId: apiPrepared.intent.operationId, outcome: 'uncertain', taskId: null, registerFresh: false, code: 'unknown-create-outcome' }, isError: true };
  const apiUncertain = await api('unknown-create', { schemaVersion: 1, stage: 'receipt', prepared: apiPrepared, receipt: apiReply }, 3);
  assert.equal(apiUncertain.status, 'reconcile-original-operation'); assert.equal(apiUncertain.call, null); assert.deepEqual(apiUncertain.prepared, apiPrepared);
  const apiSaved = await api('api-only-applied', { schemaVersion: 1, stage: 'receipt', prepared: apiPrepared, receipt: { attemptedAt: apiAttempt, observedAt: apiAttempt, evidenceRef: 'synthetic-later-api-reconciliation', result: { content: [{ type: 'text', text: JSON.stringify({ schemaVersion: 1, operationId: apiPrepared.intent.operationId, outcome: 'applied', taskId: 'new-exact-task', registerFresh: true }) }], isError: false } } });
  assert.equal(apiSaved.status, 'api-applied-reported'); assert.equal(apiSaved.nativeVerified, false); assert.deepEqual(apiSaved.completedEffectKeys, []);
  const apiStale = academicOsPlanFixture('change'); apiStale.observation.result.report.execution.expectedSnapshot = '3'.repeat(64);
  assert.equal((await api('changed-token', { schemaVersion: 1, stage: 'prepare', intent: apiStale.intent, observation: apiStale.observation }, 3)).call, null);
  const apiInvalid = academicOsPlanFixture('create'); apiInvalid.intent.operation.doDate = '2026-10-28';
  await api('unsupported-date', { schemaVersion: 1, stage: 'prepare', intent: apiInvalid.intent, observation: apiInvalid.observation }, 2);
  const partial = await run(['calendar-register', '--file', refreshFile], 3, home, { ...env, EMMY_REGISTER_PROVIDER_FAULT: 'partial' });
  assert.equal(partial.status, 'partial'); assert.notEqual(partial.snapshotDigest, refresh.snapshotDigest);
  await writeFile(join(directory, 'partial-refresh.result.json'), JSON.stringify(partial));
  const requests = (await readFile(providerLog, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(requests.every(row => row.options.method === 'GET' && row.scopes.every(scope => scope.endsWith('.readonly'))));
  assert.ok(requests.some(row => row.options.params.showAssigned === true));
  await writeFile(envelopeFile, '{"schemaVersion":1,"schemaVersion":1}'); await run(['calendar-register', '--file', envelopeFile], 2);
  const retain = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await retain(target);
      else { const bytes = await readFile(target); report.calendar.retainedFiles.push({ path: relative(join(home, 'calendar'), target), bytes: bytes.length, sha256: digest(bytes) }); }
    }
  };
  await retain(directory);
  for (const path of [refresh.file, partial.file]) {
    const bytes = await readFile(path); const destination = join(directory, `${digest(bytes)}.snapshot.json`); await writeFile(destination, bytes);
    report.calendar.retainedFiles.push({ path: relative(join(home, 'calendar'), destination), bytes: bytes.length, sha256: digest(bytes) });
  }
  report.calendarRegister = { snapshotDigest: refresh.snapshotDigest, baselineOperationDigest: baseline.proposals[0].operationDigest, nativeWrites: 0, requests: requests.length, assurance: 'synthetic transport and actual CLI' };
  scenario('calendar-register', 'Fresh real CLI processes collect immutable snapshots and validate cloud plans, exact preflights and final receipts. Canonical SGT stays separate from Calendar SGT or evidenced standalone Bangkok input, including rollover and repeated preparation. Missing, stale or future zone proof, wrong-interface compensation, projection-only identity and SGT final mismatches are refused. Original input bytes and retained evidence survive teardown. No live provider or native operation.');
}
