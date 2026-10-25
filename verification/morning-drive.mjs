import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, readStore, validateReferences } from '../src/records.mjs';
import { morningAssessments, morningDelivery, morningEntities, morningItem } from './morning-fixtures.mjs';
export async function driveMorning({ home, bindings, target, run, scenario, report }) {
  const selected = join(home, 'morning-drive'); await mkdir(selected, { recursive: true }); await writeFile(join(selected, 'bindings.json'), JSON.stringify(bindings));
  let ordinal = 0; let view;
  const file = async (label, value) => { const path = join(selected, `${ordinal++}-${label}.json`); await writeFile(path, JSON.stringify(value)); return path; };
  const evidence = async (sourceRef, value) => { const path = await file('raw', value); return { path, sha256: digest(await readFile(path)), sourceRef }; };
  const owner = await evidence('synthetic-owner', { synthetic: true, scope: 'Two exact accounts and one narrow rule; no native authority.' });
  const now = () => new Date().toISOString(); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const definition = { id: 'fixture-morning', parents: [], goal: 'Retain one synthetic morning run.', context: 'No live effects or native truth.', workClass: 'coordination', action: 'monitor', resource: target.projectId, destination: 'fixture-parent', target, authorityRef: { reference: owner.sourceRef, action: 'monitor', resource: target.projectId, destination: 'fixture-parent' }, criteria: [{ id: 'receipts', evidence: 'reported-check', description: 'Synthetic parent receipt.' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'fixture-morning', method: 'Retain exact synthetic receipts.', intendedEffect: 'Bounded morning outcomes.', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' } };
  await run(['responsibility', '--file', await file('definition', definition)], 0, selected);
  const call = async (action, refs = [], expected = 3) => { const input = { schemaVersion: 1, responsibilityId: definition.id, ...(view?.headHash ? { expectedHead: view.headHash } : {}), action, evidence: refs }; const path = await file('command', input); const result = await run(['fleet', '--file', path], expected, selected); if (result.headHash) view = result; return { result, path }; };
  const command = (step, fields = {}, refs = [], expected = 3) => call({ operation: 'morning', command: { step, runId: day, ...fields } }, refs, expected);
  const receipt = async (id, value) => { const ref = await evidence(`synthetic-${id}-${ordinal}`, value); return { ref, receipt: { sourceRef: ref.sourceRef, sha256: ref.sha256, observedAt: now(), capturedAt: now(), observer: 'Synthetic fresh-process parent harness', scope: morningEntities.find(row => row.id === id)?.scope ?? { service: 'assessment', environment: 'parent-cloud', surface: 'cloud', resource: id }, coverage: { complete: true, gaps: [] } } }; };
  await call({ operation: 'configure', entities: morningEntities });
  const open = { day, policyVersion: 2, delivery: { ...morningDelivery, ownerRef: owner.sourceRef }, ownerRef: owner.sourceRef, accounts: { gmail: { account: 'owner@example.test', entityId: 'gmail' }, outlook: { account: 'student@example.test', entityId: 'outlook' } }, sources: morningEntities.map(row => ({ id: row.id, role: row.id, entityId: row.id })), rules: [{ id: 'foodpanda-promotions', version: 1, ownerRef: owner.sourceRef }] };
  const opened = await command('open', open, [owner]); await run(['fleet', '--file', opened.path], 3, selected); assert.equal(view.state.morningRuns.length, 1);
  const start = new Date(Date.parse(`${day}T00:00:00.000Z`) - 28800000).toISOString(); const window = { start, end: new Date(Date.parse(start) + 86400000).toISOString() };
  const acquisitions = new Map();
  for (const entity of morningEntities) {
    await call({ operation: 'submit', job: { id: `source-${entity.id}`, kind: 'briefing-source-read', occurrence: day, priority: 'morning', entityIds: [entity.id], purpose: 'Synthetic bounded source acquisition; no native call.', maxReads: 1, maxBytes: 4096, steps: 1 } });
    const admitted = await call({ operation: 'claim', ownerRef: 'synthetic-parent' }); const ticket = admitted.result.ticket; assert.ok(ticket);
    const captured = await receipt(entity.id, { synthetic: true, source: entity.id, messageIds: ['gmail', 'outlook'].includes(entity.id) ? [`${entity.id}-one`] : [] }); acquisitions.set(entity.id, captured);
    await call({ operation: 'result', jobKey: ticket.key, ticket: ticket.ticket, checkpoint: 1, outcome: 'completed', usage: { reads: 1, bytes: 4096 }, receipt: captured.receipt }, [captured.ref]);
    const fields = { sourceId: entity.id, jobKey: ticket.key, receipt: captured.receipt, paginationComplete: true, cached: false, resourceIds: entity.id === 'calendar-inventory' ? ['calendar'] : entity.id === 'task-inventory' ? ['tasks'] : [], messageIds: ['gmail', 'outlook'].includes(entity.id) ? [`${entity.id}-one`] : [], window: ['calendar', 'tasks'].includes(entity.id) ? window : null };
    if (entity.id === 'calendar') await command('source', { ...fields, window: { start, end: start } }, [captured.ref], 2);
    await command('source', fields, [captured.ref]);
  }
  const reviews = []; const reviewRefs = [];
  for (const adapter of ['gmail', 'outlook']) { const item = morningItem(adapter); const captured = await receipt(adapter, { synthetic: true, fullThread: item.before, context: item.context }); item.receipt = captured.receipt; item.context.threadDigest = captured.ref.sha256; reviews.push(item); reviewRefs.push(captured.ref); }
  await command('review', { items: reviews.map(item => ({ ...item, context: { ...item.context, threadDigest: 'a'.repeat(64) } })) }, reviewRefs, 2);
  await command('review', { items: reviews }, reviewRefs);
  const baseIntent = { adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: reviews[0].before, receipt: reviews[0].receipt, destination: null };
  await command('action-intent', baseIntent, reviewRefs, 2);
  const assessments = morningAssessments(now(), window); const assessmentRefs = [];
  for (const key of ['briefing', 'calendar']) {
    const value = assessments[key]; const captured = await receipt(`${key}-assessment`, { ok: true, data: value.result }); value.receipt = { ...captured.receipt, observedAt: key === 'briefing' ? value.assessment.checkedAt : value.result.evaluatedAt }; assessmentRefs.push(captured.ref);
    const inputCapture = await receipt(`${key}-input`, value.input); value.inputReceipt = inputCapture.receipt; assessmentRefs.push(inputCapture.ref);
    if (key === 'briefing') value.assessment.inputDigest = value.inputReceipt.sha256; else value.result.inputDigest = value.inputReceipt.sha256;
    await writeFile(captured.ref.path, JSON.stringify({ ok: true, data: value.result })); captured.ref.sha256 = digest(await readFile(captured.ref.path)); value.receipt.sha256 = captured.ref.sha256;
    if (key === 'briefing') { const generated = await receipt('briefing-generated-receipt', value.assessment); value.assessmentReceipt = generated.receipt; assessmentRefs.push(generated.ref); }
  }
  await command('seal', { ...assessments, briefing: { ...assessments.briefing, result: { ...assessments.briefing.result, body: 'changed', bodyDigest: digest('changed') } } }, assessmentRefs, 2);
  await command('seal', assessments, assessmentRefs);
  const sealed = view.state.morningRuns[0].sealed; assert.equal(sealed.gaps.length, 0); assert.ok(sealed.body.includes('planned trash')); assert.ok(sealed.body.includes('contact@info'));
  const bodyRef = await evidence('synthetic-body', sealed.body); await writeFile(bodyRef.path, sealed.body); bodyRef.sha256 = digest(sealed.body);
  const send = { sendRef: 'synthetic-send', bodyDigest: sealed.bodyDigest };
  const intentSend = await command('send-intent', send, [bodyRef]); await run(['fleet', '--file', intentSend.path], 3, selected); await command('send-intent', send, [bodyRef], 2);
  const ack = { ...send, readbackRef: 'synthetic-readback', deliveredBodyDigest: send.bodyDigest, nativeId: 'synthetic-message', scope: morningDelivery.scope, acquiredAt: now() };
  const wrong = await evidence(ack.readbackRef, { nativeId: ack.nativeId, sendRef: send.sendRef, scope: ack.scope, acquiredAt: ack.acquiredAt, body: 'wrong body' }); await command('send-ack', ack, [wrong], 2);
  const obsolete = await evidence(ack.readbackRef, { nativeId: ack.nativeId, sendRef: send.sendRef, scope: { ...ack.scope, service: 'gmail', resource: 'wrong-recipient' }, acquiredAt: '2020-01-01T00:00:00.000Z', body: sealed.body }); await command('send-ack', { ...ack, scope: { ...ack.scope, service: 'gmail', resource: 'wrong-recipient' }, acquiredAt: '2020-01-01T00:00:00.000Z' }, [obsolete], 2);
  const readback = await evidence(ack.readbackRef, { synthetic: true, nativeId: ack.nativeId, sendRef: send.sendRef, scope: ack.scope, acquiredAt: ack.acquiredAt, body: sealed.body }); await command('send-ack', ack, [readback]);
  const before = await receipt('gmail', { synthetic: true, sameNativeIdBefore: reviews[0].before });
  await command('action-intent', { ...baseIntent, receipt: before.receipt, before: { ...baseIntent.before, unread: false } }, [before.ref], 2);
  await command('action-intent', { ...baseIntent, receipt: before.receipt }, [before.ref]); const attempt = view.state.morningRuns[0].items[0].attempts[0];
  const after = { ...reviews[0].before, labels: ['UNREAD', 'STARRED', 'TRASH'] }; const afterReceipt = await receipt('gmail', { synthetic: true, sameNativeIdAfter: after });
  await command('action-result', { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, after: { ...after, unread: false }, receipt: afterReceipt.receipt, outcome: 'verified' }, [afterReceipt.ref], 2);
  await command('action-result', { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, after, receipt: afterReceipt.receipt, outcome: 'verified' }, [afterReceipt.ref]);
  await command('action-intent', { ...baseIntent, receipt: before.receipt }, [before.ref], 2);
  await command('summary'); const summary = view.state.morningRuns[0].summary; const summaryRef = await evidence('summary-body', summary.body); await writeFile(summaryRef.path, summary.body); summaryRef.sha256 = digest(summary.body);
  const edit = { editRef: 'synthetic-same-message-edit', bodyDigest: summary.bodyDigest, nativeId: ack.nativeId }; await command('edit-intent', edit, [summaryRef]); await command('edit-intent', edit, [summaryRef], 2);
  const editAck = { ...edit, readbackRef: 'synthetic-edit-readback', deliveredBodyDigest: summary.bodyDigest, scope: morningDelivery.scope, acquiredAt: now() }; const editRead = await evidence(editAck.readbackRef, { nativeId: edit.nativeId, sendRef: edit.editRef, scope: editAck.scope, acquiredAt: editAck.acquiredAt, body: summary.body }); await command('edit-ack', editAck, [editRead]);
  const retained = await readStore(selected); const corrupted = structuredClone(retained.records); const reviewedRecord = corrupted.find(record => record.action?.operation === 'morning' && record.action.command.step === 'review'); reviewedRecord.fileDigests = {}; assert.throws(() => validateReferences(corrupted), /receipt bytes|context bytes/); report.morning = { synthetic: true, records: retained.records.length, reviewedIds: view.state.morningRuns[0].items.map(row => row.before.nativeId), exactBodyDigest: sealed.bodyDigest, exactSummaryDigest: summary.bodyDigest, nativeToolsInvoked: false, actualDelivery: 'not-tested' };
  scenario('morning-run', 'Fresh-process fleet-backed morning acquisition, exact context/body bytes, reviewed sender/subject/disposition, send/readback-before-cleanup, unread-preserved same-ID action, duplicate-safe replay and exact same-message summary edit. Synthetic parent declarations only.');
}
