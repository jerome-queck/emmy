import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, digest, readStore } from '../src/records.mjs';
import { executeBriefingEffect, acquireBriefingSource, acquireBriefingPlanSource } from '../src/briefing-cloud-caller.mjs';
import { assessBriefingReporting } from '../src/briefing-reporting.mjs';
import { morningEntities, morningItem, morningAssessments } from './morning-fixtures.mjs';
import { morningV3Policy } from './morning-v3-fixtures.mjs';

export async function driveMorningV3({ home, bindings, target, run, report }) {
  const selected = join(home, 'morning-drive', 'v3'); await mkdir(selected, { recursive: true }); await writeFile(join(selected, 'bindings.json'), JSON.stringify(bindings));
  let ordinal = 0; let view;
  const now = () => new Date().toISOString();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const file = async (label, value) => { const path = join(selected, `${ordinal++}-${label}.json`); await writeFile(path, canonical(value)); return path; };
  const evidence = async (sourceRef, value) => { const path = await file('evidence', value); return { path, sha256: digest(await readFile(path)), sourceRef }; };
  const owner = await evidence('synthetic-v3-owner', { scope: 'Synthetic v3 local driver. No native authority.' });
  const definition = { id: 'fixture-morning-v3', parents: [], goal: 'Exercise the real briefing caller and same journal.', context: 'Synthetic supported adapters only.', workClass: 'coordination', action: 'monitor', resource: target.projectId, destination: 'fixture-parent', target, authorityRef: { reference: owner.sourceRef, action: 'monitor', resource: target.projectId, destination: 'fixture-parent' }, criteria: [{ id: 'receipts', evidence: 'reported-check', description: 'Synthetic exact readback.' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'fixture-morning-v3', method: 'Drive actual fresh CLI and portable caller.', intendedEffect: 'No remote effects.', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' } };
  await run(['responsibility', '--file', await file('definition', definition)], 0, selected);
  const envelope = (command, refs) => ({ schemaVersion: 1, responsibilityId: definition.id, expectedHead: view.headHash, action: { operation: 'morning', command: { runId: day, ...command } }, evidence: refs });
  const fleet = async (input, expected = 3) => { const result = await run(['fleet', '--file', await file('fleet', input)], expected, selected); if (result.headHash) view = result; return result; };
  const call = (action, refs = [], expected = 3) => fleet({ schemaVersion: 1, responsibilityId: definition.id, ...(view?.headHash ? { expectedHead: view.headHash } : {}), action, evidence: refs }, expected);
  const command = (step, fields = {}, refs = [], expected = 3) => fleet(envelope({ step, ...fields }, refs), expected);
  const entities = morningEntities.map(entity => ({ ...entity, scope: { ...entity.scope, environment: 'dot-cloud' } }));
  const receipt = async (role, value, observedAt = now()) => { const ref = await evidence(`synthetic-v3-${role}-${ordinal}`, value); return { ref, receipt: { sourceRef: ref.sourceRef, sha256: ref.sha256, observer: 'Synthetic local CLI driver', scope: entities.find(entity => entity.id === role)?.scope ?? { service: 'assessment', environment: 'dot-cloud', surface: 'cloud', resource: role }, observedAt, capturedAt: now(), coverage: { complete: true, gaps: [] } } }; };
  await call({ operation: 'configure', semanticsVersion: 2, entities });
  const policy = { ...morningV3Policy, authority: { ...morningV3Policy.authority, sourceRef: owner.sourceRef }, delivery: { ...morningV3Policy.delivery, ownerRef: owner.sourceRef } };
  const migration = { sourceRef: 'synthetic-v3-accepted-migration', predecessorOwner: 'morning-v2', predecessorInactive: true, predecessorStateDigest: digest([]), policyDigest: digest(policy), acceptedAt: now() };
  const migrationRef = await evidence(migration.sourceRef, migration); const policyRef = await evidence('synthetic-v3-policy', policy);
  await command('open', { day, policyVersion: 3, delivery: policy.delivery, cleanupMode: 'batched-v1', policy, migration, accounts: policy.accounts, ownerRef: owner.sourceRef, sources: entities.map(entity => ({ id: entity.id, role: entity.id, entityId: entity.id })), rules: [] }, [owner, migrationRef, policyRef]);
  const start = new Date(`${day}T00:00:00+08:00`).toISOString(); const window = { start, end: new Date(Date.parse(start) + 86400000).toISOString() };
  const captures = new Map(); const reviews = []; const reviewRefs = [];
  for (const adapter of ['gmail', 'outlook']) {
    const item = morningItem(adapter); item.before.sender = 'notices@vendor.example'; item.ruleId = null;
    if (adapter === 'gmail') { item.facts = ['Synthetic invoice paid; amount and date retained.']; item.context.orderReceipt = true; item.context.billing = true; item.policyEvidence = { recordPurpose: 'invoice', duplicate: null, priorFactsDelivery: null }; }
    reviews.push(item);
  }
  for (const entity of entities) {
    await call({ operation: 'submit', job: { id: `v3-source-${entity.id}`, kind: 'briefing-source-read', occurrence: day, priority: 'morning', entityIds: [entity.id], purpose: 'Synthetic exact source acquisition.', maxReads: 1, maxBytes: 4096, steps: 1 } });
    const ticket = (await call({ operation: 'claim', ownerRef: owner.sourceRef })).ticket;
    const reviewed = reviews.find(item => item.adapter === entity.id);
    const captured = await receipt(entity.id, reviewed ? { fullThread: reviewed.before, context: reviewed.context, facts: reviewed.facts } : { synthetic: true, source: entity.id }); captures.set(entity.id, captured);
    if (reviewed) { reviewed.receipt = captured.receipt; reviewed.context.threadDigest = captured.ref.sha256; reviewRefs.push(captured.ref); }
    await call({ operation: 'result', jobKey: ticket.key, ticket: ticket.ticket, checkpoint: 1, outcome: 'completed', usage: { reads: 1, bytes: 4096 }, receipt: captured.receipt }, [captured.ref]);
    await command('source', { sourceId: entity.id, jobKey: ticket.key, receipt: captured.receipt, paginationComplete: true, cached: false, resourceIds: entity.id === 'calendar-inventory' ? ['calendar'] : entity.id === 'task-inventory' ? ['tasks'] : [], messageIds: ['gmail', 'outlook'].includes(entity.id) ? [`${entity.id}-one`] : [], window: ['calendar', 'tasks'].includes(entity.id) ? window : null }, [captured.ref]);
  }
  for (const key of ['complete', 'safeUnreadInspection', 'personal']) {
    const invalid = structuredClone(reviews); invalid[0].context[key] = 'false';
    await command('review', { items: invalid }, reviewRefs, 2);
  }
  await command('review', { items: reviews }, reviewRefs);
  const assessedAt = now(); const calendarInput = { intent: { window: { ...window, timeZone: 'Asia/Singapore' } } };
  const assessments = morningAssessments(assessedAt, window); assessments.calendar.input = calendarInput;
  const assessmentRefs = [];
  for (const role of ['briefing', 'calendar']) {
    const value = assessments[role]; const input = await receipt(`${role}-input`, value.input); value.inputReceipt = input.receipt; assessmentRefs.push(input.ref);
    if (role === 'briefing') value.assessment.inputDigest = input.receipt.sha256; else value.result.inputDigest = input.receipt.sha256;
    const captured = await receipt(`${role}-result`, value.result, assessedAt); value.receipt = captured.receipt; assessmentRefs.push(captured.ref);
    if (role === 'briefing') { const generated = await receipt('briefing-generated', value.assessment); value.assessmentReceipt = generated.receipt; assessmentRefs.push(generated.ref); }
  }
  const daySource = role => { const receipts = [captures.get(role).receipt, captures.get(role === 'calendar' ? 'calendar-inventory' : 'task-inventory').receipt]; return { observedAt: receipts.map(receipt => receipt.observedAt).sort()[0], capturedAt: receipts.map(receipt => receipt.capturedAt).sort().at(-1), complete: true, paginationComplete: true, gaps: [], window, resourceIds: [role], acquiredResourceIds: [role], items: [] }; };
  const checks = assessBriefingReporting({ action: 'checks', asOf: assessedAt, results: [] }).expected.filter(check => check.state !== 'not-due').map(check => ({ kind: check.kind, scheduledFor: check.scheduledFor, requestId: `synthetic-request-${check.kind}`, attemptId: `synthetic-attempt-${check.kind}`, state: 'terminal', execution: 'completed', coverage: 'complete', availability: 'available', sourceEnd: assessedAt, observedAt: assessedAt, recordedAt: assessedAt, snapshotDigest: digest(check.kind), summary: 'Synthetic completed check.' }));
  const planInput = { schemaVersion: 3, day, asOf: assessedAt, policy, mail: ['gmail', 'outlook'].map(adapter => { const captured = captures.get(adapter).receipt; return { adapter, account: policy.accounts[adapter].account, surface: adapter === 'gmail' ? 'connector' : 'browser', environment: 'dot-cloud', observedAt: captured.observedAt, capturedAt: captured.capturedAt, complete: true, paginationComplete: true, gaps: [], inboxIds: [`${adapter}-one`], items: reviews.filter(item => item.adapter === adapter), expandedContextCount: 1 }; }), calendar: daySource('calendar'), tasks: daySource('tasks'), obligations: [], checks };
  for (const role of ['gmail', 'outlook', 'calendar', 'tasks']) {
    const source = ['gmail', 'outlook'].includes(role) ? planInput.mail.find(row => row.adapter === role) : planInput[role];
    const page = { ...source, ...(source.adapter ? { unreadPreserved: true } : {}), nextCursor: null };
    const result = await acquireBriefingPlanSource({ schemaVersion: 1, role, account: policy.accounts[role]?.account ?? 'synthetic-owner', environment: 'dot-cloud', surface: role === 'outlook' ? 'browser' : 'connector', maxReads: 1, maxBytes: 1048576 }, {
      policy, now, async read() { return { raw: canonical({ structuredContent: page }), value: page }; },
      async retainRaw(bytes, metadata) { const ref = await evidence(`synthetic-normalization-${role}`, JSON.parse(bytes)); return { ...metadata, sourceRef: ref.path, sha256: ref.sha256, byteCount: (await readFile(ref.path)).length }; },
      readRaw: ref => readFile(ref.sourceRef), async completeAcquisition() {}
    });
    assert.deepEqual(result.source, source);
    if (source.adapter) planInput.mail[planInput.mail.indexOf(source)] = result.source; else planInput[role] = result.source;
  }
  const futureDay = new Date(Date.parse(start) + 2 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  const task = { nativeId: 'synthetic-future-study', listId: 'tasks', title: 'Synthetic future study', status: 'needsAction', ownerDismissed: false, manuallyMoved: false, doDate: futureDay, deadline: null };
  planInput.tasks.items = [task, { ...task, nativeId: 'synthetic-deadline', title: 'Synthetic upcoming deadline', deadline: new Date(Date.parse(window.end) + 86400000).toISOString() }];
  const learningRefs = []; const observations = [];
  for (const nativeId of ['synthetic-observed-one', 'synthetic-observed-two']) {
    const event = { actor: 'synthetic-verified-owner', actorVerified: true, labelOnly: false, account: policy.accounts.gmail.account, nativeId, observedAt: assessedAt, scope: 'synthetic-routine-promotions', action: 'trash' };
    const raw = await evidence(`synthetic-learning-${nativeId}`, event); learningRefs.push(raw); observations.push({ ...event, sourceRef: raw.sourceRef, sourceDigest: raw.sha256 });
  }
  planInput.learning = { history: [], entries: [{ id: 'synthetic-preference', kind: 'observed-preference', risk: 'low-risk', authority: policy.authority, scope: 'synthetic-routine-promotions', action: 'trash', observations, counterexamples: [] }] };
  const unknownInput = structuredClone(planInput);
  unknownInput.tasks.items.push({ ...task, nativeId: 'synthetic-unknown', title: 'Synthetic unknown overlay', ownerDismissed: null, doDate: day });
  const unknown = await run(['daily-briefing', '--file', await file('unknown-task-prepare', { action: 'prepare', input: unknownInput })], 3, selected);
  assert.doesNotMatch(unknown.body, /Synthetic unknown overlay/);
  assert.ok(unknown.gaps.includes('Task dismissal or move status unknown'));
  const unknownRaw = await receipt('unknown-task-result', unknown, assessedAt); const unknownSource = await receipt('unknown-task-input', unknownInput);
  await command('seal', { ...assessments, deterministic: { input: unknownInput, result: unknown, receipt: unknownRaw.receipt, inputReceipt: unknownSource.receipt } }, [...assessmentRefs, unknownRaw.ref, unknownSource.ref, owner, ...learningRefs]);
  assert.equal(view.state.morningRuns[0].sealed.deterministic.input.tasks.items.at(-1).ownerDismissed, null);
  const prepared = await run(['daily-briefing', '--file', await file('prepare', { action: 'prepare', input: planInput })], 0, selected);
  assert.doesNotMatch(prepared.body, /Synthetic future study|Synthetic unknown overlay/);
  assert.match(prepared.body, /Synthetic upcoming deadline.*Study do-date.*Deadline/);
  for (const key of ['complete', 'safeUnreadInspection', 'personal']) {
    const invalid = structuredClone(planInput); invalid.mail[0].items[0].context[key] = 'false';
    await run(['daily-briefing', '--file', await file('strict-mail-refused', { action: 'prepare', input: invalid })], 2, selected);
  }
  const planRaw = await receipt('deterministic-result', prepared, assessedAt); const planSource = await receipt('deterministic-input', planInput);
  const deterministic = { input: planInput, result: prepared, receipt: planRaw.receipt, inputReceipt: planSource.receipt };
  {
    const unstartedInput = { ...planInput, checks: [] };
    const unstarted = await run(['daily-briefing', '--file', await file('unstarted-prepare', { action: 'prepare', input: unstartedInput })], 3, selected);
    assert.equal(unstarted.checksTerminal, false);
    const unstartedRaw = await receipt('unstarted-result', unstarted, assessedAt); const unstartedSource = await receipt('unstarted-input', unstartedInput);
    await command('seal', { ...assessments, deterministic: { input: unstartedInput, result: unstarted, receipt: unstartedRaw.receipt, inputReceipt: unstartedSource.receipt } }, [...assessmentRefs, unstartedRaw.ref, unstartedSource.ref, owner, ...learningRefs], 2);
    const missingInput = { ...planInput, checks: checks.map((check, index) => index ? check : { ...check, state: 'missing', execution: 'unknown', coverage: 'unavailable', availability: 'unavailable', sourceEnd: null, observedAt: null, recordedAt: null, snapshotDigest: null, summary: 'Synthetic supported exact acquisition verified terminal missing output.' }) };
    const contradictoryInput = structuredClone(missingInput); contradictoryInput.checks[0].execution = 'running';
    await run(['daily-briefing', '--file', await file('running-missing-refused', { action: 'prepare', input: contradictoryInput })], 2, selected);
    const missing = await run(['daily-briefing', '--file', await file('missing-prepare', { action: 'prepare', input: missingInput })], 3, selected);
    assert.equal(missing.checksTerminal, true); assert.match(missing.body, /verified terminal missing output/);
    const missingRaw = await receipt('missing-result', missing, assessedAt); const missingSource = await receipt('missing-input', missingInput);
    await command('seal', { ...assessments, deterministic: { input: missingInput, result: missing, receipt: missingRaw.receipt, inputReceipt: missingSource.receipt } }, [...assessmentRefs, missingRaw.ref, missingSource.ref, owner, ...learningRefs]);
    assert.ok(view.state.morningRuns[0].sealed.gaps.length > 0);
  }
  const allRefs = [...assessmentRefs, planRaw.ref, planSource.ref, owner, ...learningRefs];
  if (checks.length) {
    const pendingInput = { ...planInput, checks: checks.map((check, index) => index === 0 ? { ...check, state: 'pending', execution: 'running', coverage: 'partial', snapshotDigest: null, summary: 'Synthetic admitted check remains pending.' } : check) };
    const pending = await run(['daily-briefing', '--file', await file('pending-prepare', { action: 'prepare', input: pendingInput })], 3, selected);
    const pendingRaw = await receipt('pending-result', pending, assessedAt); const pendingSource = await receipt('pending-input', pendingInput);
    await command('seal', { ...assessments, deterministic: { input: pendingInput, result: pending, receipt: pendingRaw.receipt, inputReceipt: pendingSource.receipt } }, [...assessmentRefs, pendingRaw.ref, pendingSource.ref, owner, ...learningRefs], 2);
  }
  await command('seal', { ...assessments, deterministic: { ...deterministic, result: { ...prepared, body: 'invented' } } }, allRefs, 2);
  await command('seal', { ...assessments, deterministic }, allRefs);
  assert.equal(view.state.morningRuns[0].sealed.body, prepared.body);
  assert.match(prepared.body, /Proposed trash for synthetic-routine-promotions/);
  let sends = 0; let moves = 0; let edits = 0; const rawReceipts = [];
  const adapters = { now, fleet, retainRaw: async (raw, metadata) => { const relativePath = `${ordinal++}-tool-raw.bin`; const path = join(selected, relativePath); await writeFile(path, raw); const receipt = { sourceRef: path, sha256: digest(await readFile(path)), byteCount: raw.length, metadata }; rawReceipts.push({ relativePath, sha256: receipt.sha256, byteCount: receipt.byteCount, metadata }); return receipt; }, chatgpt: { send: async parameters => { sends++; assert.equal(parameters.room, policy.delivery.scope.resource); throw new Error('Synthetic lost response after accepted send'); }, edit: async () => { edits++; return { raw: '{"accepted":true}', value: { accepted: true } }; } }, gmail: { move: async () => { moves++; return { raw: '{"accepted":true}', value: { accepted: true } }; } }, outlookUI: { move: async () => { moves++; return { raw: '{"accepted":true}', value: { accepted: true } }; } } };
  const effect = async input => executeBriefingEffect({ schemaVersion: 1, envelope: input, pilotAuthority: { accepted: true, sourceRef: owner.sourceRef, environment: 'dot-cloud' } }, adapters);
  const body = view.state.morningRuns[0].sealed.body; const bodyRef = await evidence('v3-send-body', body); await writeFile(bodyRef.path, body); bodyRef.sha256 = digest(body);
  const sendFields = { step: 'send-intent', sendRef: 'synthetic-v3-send', bodyDigest: digest(body) }; const sendEnvelope = envelope(sendFields, [bodyRef]);
  assert.equal((await effect(sendEnvelope)).status, 'uncertain');
  assert.equal((await effect(sendEnvelope)).status, 'rediscover-only'); assert.equal(sends, 1);
  const ack = { sendRef: sendFields.sendRef, bodyDigest: sendFields.bodyDigest, deliveredBodyDigest: sendFields.bodyDigest, readbackRef: 'synthetic-v3-send-readback', nativeId: 'synthetic-v3-message', scope: policy.delivery.scope, acquiredAt: now() };
  const ackRef = await evidence(ack.readbackRef, { ...ack, body }); await command('send-ack', ack, [ackRef]);
  for (const item of reviews) {
    const before = { receipt: item.receipt, ref: reviewRefs.find(ref => ref.sha256 === item.context.threadDigest) };
    const destination = item.adapter === 'gmail' ? null : { folder: 'DeletedItems', folderId: 'synthetic-deleted-items' };
    const action = item.adapter === 'gmail' ? 'archive' : 'trash';
    const intent = envelope({ step: 'action-intent', adapter: item.adapter, nativeId: item.before.nativeId, before: item.before, receipt: before.receipt, destination, action }, [before.ref]);
    assert.equal((await effect(intent)).status, 'accepted-unverified');
    assert.equal((await effect(intent)).status, 'rediscover-only');
    const pending = view.state.morningRuns[0].items.find(row => row.adapter === item.adapter).attempts.at(-1);
    const after = { ...item.before, ...(item.adapter === 'gmail' ? { labels: item.before.labels.filter(label => label !== 'INBOX') } : destination) };
    const afterRef = await receipt(item.adapter, { after });
    await command('action-result', { adapter: item.adapter, nativeId: item.before.nativeId, intentDigest: pending.intentDigest, outcome: 'verified', after, receipt: afterRef.receipt }, [afterRef.ref]);
  }
  assert.equal(moves, 2);
  await command('summary'); const summary = view.state.morningRuns[0].summary;
  const summaryRef = await evidence('v3-summary-body', summary.body); await writeFile(summaryRef.path, summary.body); summaryRef.sha256 = digest(summary.body);
  const editFields = { step: 'edit-intent', editRef: 'synthetic-v3-edit', bodyDigest: summary.bodyDigest, nativeId: ack.nativeId }; const editEnvelope = envelope(editFields, [summaryRef]);
  assert.equal((await effect(editEnvelope)).status, 'accepted-unverified'); assert.equal((await effect(editEnvelope)).status, 'rediscover-only'); assert.equal(edits, 1);
  const editAck = { ...editFields, readbackRef: 'synthetic-v3-edit-readback', deliveredBodyDigest: summary.bodyDigest, scope: policy.delivery.scope, acquiredAt: now() }; delete editAck.step;
  const edited = await evidence(editAck.readbackRef, { nativeId: ack.nativeId, sendRef: editFields.editRef, body: summary.body, scope: policy.delivery.scope, acquiredAt: editAck.acquiredAt }); await command('edit-ack', editAck, [edited]);
  assert.equal(view.morning[0].status, 'complete'); assert.equal(view.state.morningRuns[0].delivery.nativeId, ack.nativeId);
  const reportEntity = { id: 'canonical-automation-report-records', kind: 'cloud-job', scope: { service: 'emmy', environment: 'studio', surface: 'installed', resource: 'synthetic-canonical-reports' } };
  await call({ operation: 'inventory', entities: [...entities, reportEntity], sourceRef: owner.sourceRef, reason: 'Exercise the production canonical admission schema with a synthetic exact source.' }, [owner]);
  const readId = 'synthetic-canonical-briefing-read';
  await call({ operation: 'submit', job: { id: readId, kind: 'briefing-source-read', occurrence: day, priority: 'morning', entityIds: [reportEntity.id], purpose: 'One synthetic report read through production caller and actual fleet claim/result.', maxReads: 1, maxBytes: 8192, steps: 1 } });
  let admitted; let reportReads = 0;
  const reportAdapters = { ...adapters,
    claimAdmission: async () => { const result = await call({ operation: 'claim', ownerRef: owner.sourceRef }, [owner]); if (result.ticket) admitted = result.ticket; return result; },
    read: async () => { reportReads++; return { raw: JSON.stringify({ observedAt: now(), complete: true, nextCursor: null }) }; },
    completeAcquisition: async result => {
      const capture = result.responses[0]; const raw = capture.raw;
      return call({ operation: 'result', jobKey: admitted.key, ticket: admitted.ticket, checkpoint: 1, outcome: 'completed', usage: { reads: result.reads, bytes: result.bytes }, receipt: { sourceRef: raw.sourceRef, sha256: raw.sha256, observer: 'Synthetic production caller actual fleet admission', scope: reportEntity.scope, observedAt: capture.response.observedAt, capturedAt: capture.capturedAt, coverage: { complete: true, gaps: [] } } }, [{ path: raw.sourceRef, sourceRef: raw.sourceRef, sha256: raw.sha256 }]);
    }
  };
  const reportRequest = { schemaVersion: 1, role: 'reporting', account: 'synthetic-owner', environment: 'dot-cloud', surface: 'bridge', maxReads: 1, maxBytes: 8192, admission: { requestId: readId, owner: 'LC1', sourceId: reportEntity.id } };
  assert.equal((await acquireBriefingSource(reportRequest, reportAdapters)).complete, true);
  await assert.rejects(acquireBriefingSource(reportRequest, reportAdapters), /Null, replayed/);
  assert.equal(reportReads, 1, 'Actual completed fleet claim cannot admit a second report read');
  const replayed = await readStore(selected); assert.equal(replayed.records.length > 30, true);
  report.morningV3 = { synthetic: true, records: replayed.records.length, bodyDigest: prepared.bodyDigest, rawReceipts, sends, moves, edits, reportReads, actualFleetAdmission: true, nativeToolsInvoked: false, actualDelivery: 'not-tested' };
}
