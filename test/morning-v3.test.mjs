import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/records.mjs';
import { morningInput, classifyMail, morningView, verifiedPriorBriefingFacts } from '../src/morning.mjs';
import { fleetInitial, fleetTransition } from '../src/fleet-state.mjs';
import { morningFixture, morningItem, morningOpen, morningRoot, morningAt, morningReceipt, morningAssessments, morningEntities, refreshMorning } from '../verification/morning-fixtures.mjs';
import { morningV3Open, morningV3Policy, morningV3Plan } from '../verification/morning-v3-fixtures.mjs';
import { preparePolicyBriefing } from '../src/briefing-plan.mjs';

test('v3 binds one existing journal owner, exact policy, predecessor and ChatGPT scope', () => {
  const initial = fleetInitial(morningRoot);
  const open = command => fleetTransition(initial, { operation: 'morning', command }, morningRoot, morningAt);
  assert.equal(open(morningV3Open).state.morningMigration.policyDigest, digest(morningV3Policy));
  for (const migration of [{ ...morningV3Open.migration, predecessorInactive: false }, { ...morningV3Open.migration, predecessorStateDigest: digest('another predecessor') }, { ...morningV3Open.migration, acceptedAt: '2027-01-01T00:00:00.000Z' }, { ...morningV3Open.migration, policyDigest: digest('another policy') }]) assert.throws(() => open({ ...morningV3Open, migration }), /Migration|migration/);
  assert.throws(() => open({ ...morningV3Open, delivery: morningOpen.delivery }), /configured accounts and exact ChatGPT/);
  assert.throws(() => morningInput({ ...morningOpen, policy: morningV3Policy }), /Historical morning/);
  const pending = morningFixture(); pending.command('review', { items: [morningItem(), morningItem('outlook')] }); pending.seal(); pending.command('send-intent', { sendRef: 'uncertain-legacy', bodyDigest: pending.run.sealed.bodyDigest });
  const later = '2026-10-26T01:00:00.000Z';
  const migration = { ...morningV3Open.migration, predecessorStateDigest: digest(pending.state.morningRuns), acceptedAt: later };
  assert.throws(() => fleetTransition(pending.state, { operation: 'morning', command: { ...morningV3Open, day: '2026-10-26', runId: '2026-10-26', migration } }, morningRoot, later), /uncertain effects/);
});

test('v3 classifier leaves v2 replay intact and archives actual receipts despite generic billing flags', () => {
  const item = morningItem(); item.context.billing = true; item.context.orderReceipt = true; item.facts = ['Invoice amount and payment status retained.']; item.policyEvidence = { recordPurpose: 'invoice', duplicate: null, priorFactsDelivery: null };
  assert.equal(classifyMail(item, 'owner@example.test', [], 3, morningV3Policy).action, 'archive');
  const old = structuredClone(item); delete old.policyEvidence;
  assert.equal(classifyMail(old, 'owner@example.test', [], 2).action, 'keep');
  assert.throws(() => classifyMail(item, 'owner@example.test', [], 2), /cannot reinterpret historical/);
  assert.equal(classifyMail({ ...item, context: { ...item.context, unresolved: true } }, 'owner@example.test', [], 3, morningV3Policy).action, 'keep');
});

test('v3 permits recoverable Outlook Trash only after delivered exact body and unread-preserved results', () => {
  const fixture = morningFixture({ open: morningV3Open });
  const gmail = morningItem(); const outlook = morningItem('outlook'); outlook.before.sender = 'notices@vendor.example';
  fixture.command('review', { items: [gmail, outlook] });
  const action = { adapter: 'outlook', nativeId: outlook.before.nativeId, action: 'trash', before: outlook.before, receipt: morningReceipt('outlook'), destination: { folder: 'DeletedItems', folderId: 'synthetic-deleted-items' } };
  assert.throws(() => fixture.command('action-intent', action), /delivered/);
  assert.throws(() => fixture.seal(), /deterministic briefing acceptance/);
  fixture.command('seal', { ...morningAssessments(), deterministic: morningV3Plan(fixture.run) });
  const send = { sendRef: 'synthetic-v3-send', bodyDigest: fixture.run.sealed.bodyDigest };
  fixture.command('send-intent', send);
  fixture.command('send-ack', { ...send, nativeId: 'synthetic-message', deliveredBodyDigest: send.bodyDigest, readbackRef: 'synthetic-chatgpt-readback' });
  assert.equal(fixture.run.delivery.scope.service, 'chatgpt');
  assert.throws(() => fixture.command('action-intent', { ...action, receipt: morningReceipt('outlook', '2026-10-25T01:00:00.001Z') }, '2026-10-25T01:00:00.001Z'), /full-thread review/);
  assert.throws(() => fixture.command('action-intent', { ...action, destination: { folder: 'Archive', folderId: 'archive' } }), /versioned recoverable intent/);
  fixture.command('action-intent', action); const attempt = fixture.run.items.find(item => item.adapter === 'outlook').attempts[0];
  assert.throws(() => fixture.command('action-intent', action), /already verified or uncertain/);
  const after = { ...outlook.before, folder: action.destination.folder, folderId: action.destination.folderId };
  const result = { adapter: 'outlook', nativeId: outlook.before.nativeId, intentDigest: attempt.intentDigest, receipt: morningReceipt('outlook'), outcome: 'verified', after };
  assert.throws(() => fixture.command('action-result', { ...result, after: { ...after, unread: false } }), /preserve/);
  fixture.command('action-result', result);
  fixture.command('summary'); const edit = { editRef: 'same-chatgpt-message', bodyDigest: fixture.run.summary.bodyDigest, nativeId: fixture.run.delivery.nativeId };
  assert.doesNotMatch(fixture.run.summary.body, /outlook-one|outlook-thread/);
  assert.match(fixture.run.summary.body, /Recoverable Trash verified/);
  fixture.command('edit-intent', edit);
  assert.throws(() => fixture.command('edit-intent', edit), /same delivered/);
  fixture.command('edit-ack', { ...edit, deliveredBodyDigest: edit.bodyDigest, readbackRef: 'same-message-readback' });
  assert.equal(morningView(fixture.state.morningRuns)[0].delivery, 'delivered');
});

test('v3 refreshed summaries reject private codes and personalized links before any edit', () => {
  for (const field of ['facts-code', 'facts-link', 'subject', 'sender']) {
    const fixture = morningFixture({ open: morningV3Open });
    fixture.command('review', { items: [morningItem(), morningItem('outlook')] });
    fixture.command('seal', { ...morningAssessments(), deterministic: morningV3Plan(fixture.run) });
    const send = { sendRef: 'synthetic-private-guard', bodyDigest: fixture.run.sealed.bodyDigest };
    fixture.command('send-intent', send);
    fixture.command('send-ack', { ...send, nativeId: 'synthetic-message', deliveredBodyDigest: send.bodyDigest, readbackRef: 'synthetic-private-guard-readback' });
    const changed = morningItem();
    if (field === 'facts-code') changed.facts = ['Login code 123456'];
    if (field === 'facts-link') changed.facts = ['Visit https://vendor.example/unsubscribe?token=personal'];
    if (field === 'subject') changed.before.subject = 'Verification code 123456';
    if (field === 'sender') changed.before.sender = 'https://vendor.example/login?code=personal';
    const batch = refreshMorning(fixture, { items: [changed] });
    assert.throws(() => fixture.command('summary', {}, batch.at), /Private codes or personalized/);
    assert.equal(fixture.run.summary, undefined);
  }
});

test('v3 compiler body must disclose cached journal sources and bind original day metadata', () => {
  const fixture = morningFixture({ open: morningV3Open });
  fixture.command('review', { items: [morningItem(), morningItem('outlook')] });
  const captured = fixture.run.sources.find(source => source.role === 'gmail').capture;
  fixture.command('source', { ...captured, cached: true });
  assert.throws(() => fixture.command('seal', { ...morningAssessments(), deterministic: morningV3Plan(fixture.run) }), /every journal-derived coverage gap/);
  const packet = morningV3Plan(fixture.run); packet.input.journalGaps = ['gmail incomplete pagination, cache, or source coverage']; packet.result = preparePolicyBriefing(packet.input);
  fixture.command('seal', { ...morningAssessments(), deterministic: packet });
  assert.match(fixture.run.sealed.body, /gmail incomplete pagination, cache, or source coverage/);
  assert.ok(fixture.run.sealed.gaps.length);
  for (const change of ['resource', 'clock', 'mail-gap']) {
    const clean = morningFixture({ open: morningV3Open }); clean.command('review', { items: [morningItem(), morningItem('outlook')] });
    const invalid = morningV3Plan(clean.run);
    if (change === 'resource') { invalid.input.calendar.resourceIds = ['invented-calendar']; invalid.input.calendar.acquiredResourceIds = ['invented-calendar']; }
    if (change === 'clock') invalid.input.tasks.observedAt = '2026-10-25T00:59:00.000Z';
    if (change === 'mail-gap') invalid.input.mail[0].gaps = ['invented source gap'];
    invalid.result = preparePolicyBriefing(invalid.input);
    assert.throws(() => clean.command('seal', { ...morningAssessments(), deterministic: invalid }), /bind original acquired|bind actual inventory/);
  }
});

test('v3 absent day inventory produces honest unknown-clock partial report without cleanup', () => {
  const fixture = morningFixture({ open: morningV3Open, skipSources: ['calendar-inventory', 'calendar'] });
  fixture.command('review', { items: [morningItem(), morningItem('outlook')] });
  const packet = morningV3Plan(fixture.run);
  packet.input.calendar = { ...packet.input.calendar, observedAt: null, capturedAt: null, complete: false, paginationComplete: false, resourceIds: [], acquiredResourceIds: [], items: [] };
  packet.input.journalGaps = ['calendar-inventory missing acquisition', 'calendar missing acquisition'];
  packet.result = preparePolicyBriefing(packet.input);
  fixture.command('seal', { ...morningAssessments(), deterministic: packet });
  assert.match(fixture.run.sealed.body, /calendar original source clock unavailable/);
  assert.match(fixture.run.sealed.body, /calendar missing acquisition/);
  assert.equal(fixture.run.sealed.deterministic.result.coverage, 'partial');
  const send = { sendRef: 'partial-source-send', bodyDigest: fixture.run.sealed.bodyDigest }; fixture.command('send-intent', send);
  fixture.command('send-ack', { ...send, deliveredBodyDigest: send.bodyDigest, nativeId: 'partial-source-message', readbackRef: 'partial-source-readback' });
  assert.throws(() => fixture.command('action-intent', { adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: morningItem().before, receipt: morningReceipt('gmail'), destination: null }), /complete acquired coverage/);
});

test('v3 prior exact delivered facts permit next-day pre-send archive and require factual reseal', () => {
  const fixture = morningFixture({ open: morningV3Open });
  const invoice = morningItem(); invoice.facts = ['Synthetic invoice amount and paid status.']; invoice.context.orderReceipt = true; invoice.policyEvidence = { recordPurpose: 'invoice', duplicate: null, priorFactsDelivery: null };
  const kept = morningItem('outlook'); kept.context.personal = true;
  fixture.command('review', { items: [invoice, kept] });
  const firstPlan = morningV3Plan(fixture.run);
  const delayedCheck = { kind: 'suggestions', scheduledFor: '2026-10-24T20:30:00.000Z', attemptId: 'older-admitted-attempt', requestId: 'older-admitted-request', state: 'terminal', execution: 'completed', coverage: 'complete', availability: 'available', sourceEnd: '2026-10-24T16:00:00.000Z', observedAt: morningAt, recordedAt: morningAt, snapshotDigest: digest('delayed-useful-suggestion'), summary: 'Delayed useful suggestion already delivered.' };
  firstPlan.input.checks = [delayedCheck]; firstPlan.result = preparePolicyBriefing(firstPlan.input);
  fixture.command('seal', { ...morningAssessments(), deterministic: firstPlan });
  const original = { sendRef: 'prior-facts-send', bodyDigest: fixture.run.sealed.bodyDigest };
  fixture.command('send-intent', original);
  fixture.command('send-ack', { ...original, nativeId: 'prior-facts-message', deliveredBodyDigest: original.bodyDigest, readbackRef: 'prior-facts-exact-readback' });
  const nextAt = '2026-10-26T01:00:00.000Z'; const nextDay = '2026-10-26';
  const step = (step, fields = {}) => fixture.transition({ operation: 'morning', command: { step, runId: nextDay, ...fields } }, nextAt);
  step('open', { ...Object.fromEntries(Object.entries(morningV3Open).filter(([key]) => !['step', 'runId'].includes(key))), day: nextDay });
  const start = '2026-10-25T16:00:00.000Z'; const window = { start, end: '2026-10-26T16:00:00.000Z' };
  for (const entity of morningEntities) {
    fixture.transition({ operation: 'submit', job: { id: `next-day-${entity.id}`, kind: 'briefing-source-read', occurrence: nextDay, priority: 'morning', entityIds: [entity.id], purpose: 'Synthetic next-day full source acquisition.', maxReads: 1, maxBytes: 4096, steps: 1 } }, nextAt);
    const ticket = fixture.transition({ operation: 'claim', ownerRef: 'synthetic-parent' }, nextAt).ticket;
    const receipt = morningReceipt(entity.id, nextAt);
    fixture.transition({ operation: 'result', jobKey: ticket.key, ticket: ticket.ticket, checkpoint: 1, outcome: 'completed', usage: { reads: 1, bytes: 32 }, receipt }, nextAt);
    step('source', { sourceId: entity.id, jobKey: ticket.key, receipt, paginationComplete: true, cached: false, resourceIds: entity.id === 'calendar-inventory' ? ['calendar'] : entity.id === 'task-inventory' ? ['tasks'] : [], messageIds: ['gmail', 'outlook'].includes(entity.id) ? [`${entity.id}-one`] : [], window: ['calendar', 'tasks'].includes(entity.id) ? window : null });
  }
  const current = { ...invoice, receipt: morningReceipt('gmail', nextAt), policyEvidence: { ...invoice.policyEvidence, priorFactsDelivery: { bodyDigest: original.bodyDigest, contextDigest: invoice.context.threadDigest, messageId: 'prior-facts-message', verified: true } } };
  step('review', { items: [current, { ...kept, receipt: morningReceipt('outlook', nextAt) }] });
  const run = () => fixture.state.morningRuns[1];
  assert.ok(verifiedPriorBriefingFacts(fixture.state, run(), run().items[0]));
  const wrong = structuredClone(run().items[0]); wrong.policyEvidence.priorFactsDelivery.bodyDigest = digest('invented delivery');
  assert.equal(verifiedPriorBriefingFacts(fixture.state, run(), wrong), null);
  const seal = () => {
    const deterministic = morningV3Plan(run(), nextAt);
    deterministic.input.checks = [delayedCheck]; deterministic.input.checkHistory = [{ kind: delayedCheck.kind, scheduledFor: delayedCheck.scheduledFor, snapshotDigest: delayedCheck.snapshotDigest, bodyDigest: original.bodyDigest, nativeId: 'prior-facts-message', room: morningV3Policy.delivery.scope.resource, receiptRef: 'prior-facts-exact-readback' }];
    deterministic.result = preparePolicyBriefing(deterministic.input);
    assert.ok(!deterministic.result.body.includes(delayedCheck.summary));
    const invented = structuredClone(deterministic); invented.input.checkHistory[0].receiptRef = 'invented-readback'; invented.result = preparePolicyBriefing(invented.input);
    assert.throws(() => step('seal', { ...morningAssessments(nextAt, window), deterministic: invented }), /exact prior journal snapshot/);
    return step('seal', { ...morningAssessments(nextAt, window), deterministic });
  };
  seal(); const oldBody = run().sealed.bodyDigest;
  const intent = { adapter: 'gmail', nativeId: current.before.nativeId, action: 'archive', before: current.before, receipt: current.receipt, destination: null };
  step('action-intent', intent); const attempt = run().items[0].attempts[0];
  step('action-result', { adapter: 'gmail', nativeId: current.before.nativeId, intentDigest: attempt.intentDigest, outcome: 'verified', receipt: morningReceipt('gmail', nextAt), after: { ...current.before, labels: current.before.labels.filter(label => label !== 'INBOX') } });
  assert.throws(() => step('send-intent', { sendRef: 'current-final', bodyDigest: oldBody }), /resealing/);
  seal(); assert.match(run().sealed.body, /archive verified/);
  const final = { sendRef: 'current-final', bodyDigest: run().sealed.bodyDigest }; step('send-intent', final);
  step('send-ack', { ...final, deliveredBodyDigest: final.bodyDigest, nativeId: 'current-final-message', readbackRef: 'current-final-exact-readback', scope: morningV3Policy.delivery.scope, acquiredAt: nextAt });
  assert.equal(run().delivery.nativeId, 'current-final-message');
  assert.equal(run().items[0].attempts.length, 1);
  assert.equal(morningView(fixture.state.morningRuns)[1].status, 'complete');
});
