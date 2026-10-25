import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMail, mailRules, morningView, mailPolicies } from '../src/morning.mjs';
import { fleetInitial, fleetTransition } from '../src/fleet-state.mjs';
import { digest } from '../src/records.mjs';
import { morningAssessments, morningAt, morningCommand, morningFixture, morningDelivery, morningItem, morningOpen, morningReceipt, morningRoot, refreshMorning } from '../verification/morning-fixtures.mjs';
const reviewed = () => { const fixture = morningFixture(); fixture.command('review', { items: [morningItem(), morningItem('outlook')] }); return fixture; };
const intent = (fixture, overrides = {}) => fixture.command('action-intent', { adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: morningItem().before, receipt: morningReceipt('gmail'), destination: null, ...overrides });
test('exact owner rules are conservative across false positives and explicit context overrides', () => {
  const base = morningItem(); const grants = Object.entries(mailRules).map(([id, rule]) => ({ id, version: rule.version, ownerRef: 'synthetic-owner-rule' }));
  const classify = review => classifyMail(review, 'owner@example.test', grants);
  assert.equal(classify(base).action, 'trash');
  assert.equal(classifyMail(base, 'owner@example.test', []).action, 'archive');
  for (const sender of ['Foodpanda <contact@info.foodpanda.sg>', 'contact@info.foodpanda.sg.evil.test', 'xcontact@info.foodpanda.sg']) assert.equal(classify({ ...base, before: { ...base.before, sender } }).action, 'archive');
  for (const key of ['actionRequired', 'reviewRequired', 'ambiguous', 'seriousSecurity', 'unresolved', 'consequential', 'academic', 'research', 'personal', 'billing', 'terms', 'securityWarning', 'invitation', 'directMessage']) assert.equal(classify({ ...base, context: { ...base.context, [key]: true } }).action, 'keep', key);
  for (const [id, rule] of Object.entries(mailRules)) {
    const review = { ...base, ruleId: id, before: { ...base.before, sender: rule.sender ?? 'owner@example.test', subject: '[Seerr] Request Now Available' }, context: { ...base.context, category: rule.category, recognizedLogin: id === 'successful-login-fyi' }, facts: id === 'successful-login-fyi' ? ['Recognized routine successful login; no warning or action.'] : [] };
    assert.equal(classify(review).action, id === 'successful-login-fyi' ? 'archive' : 'trash', id);
    assert.equal(classify({ ...review, context: { ...review.context, directMessage: true } }).action, 'keep');
    if (id === 'seerr-available') for (const subject of ['[Seerr] queued', 'Request Now Available']) assert.equal(classify({ ...review, before: { ...review.before, subject } }).action, 'archive');
    if (id === 'successful-login-fyi') assert.equal(classify({ ...review, context: { ...review.context, recognizedLogin: false } }).action, 'keep');
  }
});
test('browser-only Outlook unsafe unread inspection remains a kept gap; account surfaces cannot cross', () => {
  const item = morningItem('outlook'); item.context.safeUnreadInspection = false;
  assert.equal(classifyMail(item, 'student@example.test', []).action, 'keep');
  assert.throws(() => fleetTransition(fleetInitial(morningRoot), { operation: 'morning', command: { ...morningOpen, accounts: { ...morningOpen.accounts, outlook: { ...morningOpen.accounts.outlook, entityId: 'gmail' } } } }, morningRoot, morningAt), /exact authorized/);
  assert.throws(() => fleetTransition(fleetInitial(morningRoot), { operation: 'morning', command: { ...morningOpen, day: '2026-10-26', runId: '2026-10-26' } }, morningRoot, morningAt), /actual Singapore day/);
});
test('all reviewed IDs and useful receipt facts enter exact body; delivery/readback precedes reversible intents', () => {
  const fixture = reviewed(); assert.throws(() => intent(fixture), /delivered/);
  fixture.seal(); assert.match(fixture.run.sealed.body, /planned trash \(1\)/); assert.match(fixture.run.sealed.body, /gmail\\-one/); assert.match(fixture.run.sealed.body, /outlook\\-one/);
  const body = fixture.run.sealed.bodyDigest;
  fixture.command('send-intent', { sendRef: 'send', bodyDigest: body }); assert.throws(() => intent(fixture), /delivered/);
  assert.throws(() => fixture.command('send-ack', { sendRef: 'send', bodyDigest: body, deliveredBodyDigest: digest('different'), nativeId: 'message', readbackRef: 'readback' }), /exact-body/);
  assert.throws(() => fixture.command('send-intent', { sendRef: 'send', bodyDigest: body }), /no prior uncertain/);
  fixture.command('send-ack', { sendRef: 'send', bodyDigest: body, deliveredBodyDigest: body, nativeId: 'message', readbackRef: 'readback' });
  intent(fixture); const attempt = fixture.run.items[0].attempts[0]; assert.equal(attempt.rule.version, 1); assert.equal(attempt.rule.ownerRef, 'synthetic-narrow-owner-rule');
  assert.throws(() => intent(fixture), /already verified or uncertain/);
  const result = { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, receipt: morningReceipt('gmail'), outcome: 'verified', after: { ...morningItem().before, labels: ['UNREAD', 'STARRED', 'TRASH'] } };
  assert.throws(() => fixture.command('action-result', { ...result, after: { ...result.after, unread: false } }), /preserve/);
  assert.throws(() => fixture.command('action-result', { ...result, after: { ...result.after, nativeId: 'foreign' } }), /preserve/);
  fixture.command('action-result', result); assert.equal(fixture.run.items[0].attempts[0].status, 'verified');
  assert.throws(() => intent(fixture), /already verified/);
});
test('incomplete pagination, cache, omitted inventories and missing reviewed IDs degrade rather than invent completeness', () => {
  for (const change of ['cache', 'pagination', 'resource', 'review']) {
    const fixture = reviewed(); const state = fixture.state;
    if (change === 'cache') state.morningRuns[0].sources[0].capture.cached = true;
    if (change === 'pagination') state.morningRuns[0].sources[0].capture.paginationComplete = false;
    if (change === 'resource') state.morningRuns[0].sources[2].capture.resourceIds.push('omitted-secondary-calendar');
    if (change === 'review') state.morningRuns[0].sources[0].capture.messageIds.push('unreviewed-two');
    fixture.deliver(); assert.ok(fixture.run.sealed.gaps.length > 0, change); assert.throws(() => intent(fixture), /complete fresh coverage/);
  }
});
test('scoped corrections suppress cleanup; source freshness and same-ID races retain uncertainty', () => {
  const fixture = reviewed(); fixture.command('correct', { adapter: 'gmail', nativeId: 'gmail-one', disposition: 'dismissed', sourceRef: 'owner-dismissal', reason: 'This exact item was handled.' }); fixture.deliver();
  assert.match(fixture.run.sealed.body, /gmail dismissed \(1\)/); assert.doesNotMatch(fixture.run.sealed.body, /gmail planned trash/); assert.throws(() => intent(fixture), /conservative/);
  const other = reviewed(); other.deliver(); assert.throws(() => intent(other, { before: { ...morningItem().before, unread: false } }), /before-state race/);
  assert.throws(() => other.command('action-intent', { adapter: 'gmail', nativeId: 'gmail-one', action: 'purge', before: morningItem().before, receipt: morningReceipt('gmail'), destination: null }), /Only reversible/);
  assert.throws(() => intent(other, { receipt: morningReceipt('gmail', '2026-10-24T01:00:00.000Z') }), /fresh source/);
  assert.throws(() => other.command('action-intent', { adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: morningItem().before, receipt: morningReceipt('gmail', '2026-10-25T01:06:00.000Z'), destination: null }, '2026-10-25T01:06:00.000Z'), /fresh source/);
});
test('useful order facts require actual delivered body; Outlook folder/read state adapters stay distinct', () => {
  const fixture = morningFixture(); const item = morningItem(); item.context.orderReceipt = true; item.facts = ['Order ABC is ready for collection at the saved location.'];
  fixture.command('review', { items: [item, morningItem('outlook')] }); fixture.deliver(); assert.ok(fixture.run.sealed.body.includes(item.facts[0])); assert.equal(fixture.run.items[0].classification.action, 'archive');
  const outlook = morningItem('outlook'); fixture.command('action-intent', { adapter: 'outlook', nativeId: 'outlook-one', action: 'archive', before: outlook.before, receipt: outlook.receipt, destination: { folder: 'Archive', folderId: 'archive-native' } });
  const attempt = fixture.run.items[1].attempts[0]; fixture.command('action-result', { adapter: 'outlook', nativeId: 'outlook-one', intentDigest: attempt.intentDigest, receipt: outlook.receipt, outcome: 'verified', after: { ...outlook.before, folder: 'Archive', folderId: 'archive-native' } }); assert.equal(fixture.run.items[1].attempts[0].status, 'verified');
});
test('same-day rerun coalesces and an uncertain move needs same-ID no-effect evidence', () => {
  const fixture = reviewed(); const count = fixture.state.morningRuns.length; fixture.command('open', Object.fromEntries(Object.entries(morningOpen).filter(([key]) => !['step', 'runId'].includes(key)))); assert.equal(fixture.state.morningRuns.length, count);
  fixture.deliver(); intent(fixture); const attempt = fixture.run.items[0].attempts[0];
  fixture.command('action-result', { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, receipt: morningReceipt('gmail'), outcome: 'uncertain', after: null }); assert.throws(() => intent(fixture), /uncertain/);
  fixture.command('action-result', { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, receipt: morningReceipt('gmail'), outcome: 'known-unexecuted', after: morningItem().before }); intent(fixture); assert.equal(fixture.run.items[0].attempts.length, 2);
});
test('cleanup summary edits the same native brief; uncertain or failed readbacks never resend', () => {
  const fixture = reviewed(); fixture.deliver(); intent(fixture); const attempt = fixture.run.items[0].attempts[0];
  fixture.command('action-result', { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, receipt: morningReceipt('gmail'), outcome: 'verified', after: { ...morningItem().before, labels: ['UNREAD', 'STARRED', 'TRASH'] } });
  fixture.command('summary'); assert.match(fixture.run.summary.body, /gmail verified \(1\)/); assert.match(fixture.run.summary.body, /contact@info/);
  const edit = { nativeId: 'synthetic-message', editRef: 'same-message-edit', bodyDigest: fixture.run.summary.bodyDigest };
  assert.throws(() => fixture.command('edit-intent', { ...edit, nativeId: 'another-message' }), /same delivered native/);
  fixture.command('edit-intent', edit); assert.throws(() => fixture.command('edit-intent', edit), /same delivered/); assert.throws(() => fixture.command('summary'), /uncertain same-message/);
  assert.throws(() => fixture.command('edit-ack', { ...edit, readbackRef: 'edit-readback', deliveredBodyDigest: digest('wrong body') }), /exact same/);
  assert.equal(fixture.run.summary.delivery.status, 'uncertain');
  fixture.command('edit-ack', { ...edit, readbackRef: 'edit-readback', deliveredBodyDigest: edit.bodyDigest }); assert.equal(fixture.run.summary.delivery.status, 'delivered');
  assert.equal(fixture.run.delivery.nativeId, edit.nativeId);
});
test('all conservative classifications retain policy provenance; routine notices favor delivered archive', () => {
  const item = morningItem(); for (const informational of [true, false]) { const result = classifyMail({ ...item, ruleId: null, context: { ...item.context, informational } }, 'owner@example.test', []); assert.equal(result.policyVersion, 2); assert.match(result.policyDigest, /^[a-f0-9]{64}$/); }
  const notice = { ...item, ruleId: 'successful-login-fyi', context: { ...item.context, recognizedLogin: true, category: 'successful-login' } };
  assert.equal(classifyMail(notice, 'owner@example.test', []).action, 'keep');
  assert.equal(classifyMail({ ...notice, facts: ['Known account login succeeded; no action is needed.'] }, 'owner@example.test', [{ id: 'successful-login-fyi', version: 1, ownerRef: 'prior-owner-rule' }]).action, 'archive');
});

test('known-unexecuted same-message edits retain failed attempt and allow a new bounded edit', () => {
  const fixture = reviewed(); fixture.deliver(); fixture.command('summary'); const edit = { editRef: 'failed-edit', nativeId: 'synthetic-message', bodyDigest: fixture.run.summary.bodyDigest }; fixture.command('edit-intent', edit);
  const resolution = { ...edit, priorBodyDigest: fixture.run.delivery.bodyDigest, readbackRef: 'same-message-prior-body', sourceRef: 'attributable-no-effect', reason: 'Exact same message still has the prior body.', outcome: 'known-unexecuted' };
  assert.throws(() => fixture.command('edit-resolve', { ...resolution, priorBodyDigest: digest('unrelated body') }), /exact prior body/);
  assert.equal(fixture.run.summary.delivery.status, 'uncertain'); fixture.command('edit-resolve', resolution); assert.equal(fixture.run.summary.editAttempts.length, 1);
  assert.throws(() => fixture.command('edit-intent', edit), /failed edit reference/);
  fixture.command('edit-intent', { ...edit, editRef: 'new-edit-after-same-id-inspection' }); assert.equal(fixture.run.summary.delivery.status, 'uncertain');
});

test('fresh wrappers cannot launder stale briefing/calendar assessment source times', () => {
  const fixture = reviewed(); const seal = morningAssessments();
  assert.throws(() => fixture.command('seal', { ...seal, calendar: { ...seal.calendar, result: { ...seal.calendar.result, evaluatedAt: '2026-10-24T01:00:00.000Z' } } }), /evaluation time|fresh source/);
  assert.throws(() => fixture.command('seal', { ...seal, briefing: { ...seal.briefing, assessment: { ...seal.briefing.assessment, checkedAt: '2026-10-24T01:00:00.000Z' } } }), /original assessment time|fresh source/);
});

test('stale summaries cannot be edited and outcomes changing during an edit require a current summary', () => {
  const fixture = reviewed(); fixture.command('correct', { adapter: 'outlook', nativeId: 'outlook-one', disposition: 'complete', sourceRef: 'owner', reason: 'Handled.' }); fixture.deliver(); fixture.command('summary');
  intent(fixture); const attempt = fixture.run.items[0].attempts[0]; const result = { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, receipt: morningReceipt('gmail'), outcome: 'verified', after: { ...morningItem().before, labels: ['UNREAD', 'STARRED', 'TRASH'] } };
  fixture.command('action-result', result); const stale = { editRef: 'stale-summary', nativeId: 'synthetic-message', bodyDigest: fixture.run.summary.bodyDigest };
  assert.throws(() => fixture.command('edit-intent', stale), /summary is stale/);
  fixture.command('summary'); const current = { ...stale, editRef: 'current-summary', bodyDigest: fixture.run.summary.bodyDigest }; fixture.command('edit-intent', current); fixture.command('edit-ack', { ...current, readbackRef: 'actual-readback', deliveredBodyDigest: current.bodyDigest }); assert.equal(morningView(fixture.state.morningRuns)[0].status, 'complete');
  const race = reviewed(); race.command('correct', { adapter: 'outlook', nativeId: 'outlook-one', disposition: 'complete', sourceRef: 'owner', reason: 'Handled.' }); race.deliver(); intent(race); race.command('summary'); const old = { editRef: 'pending-edit', nativeId: 'synthetic-message', bodyDigest: race.run.summary.bodyDigest }; race.command('edit-intent', old);
  race.command('action-result', { ...result, intentDigest: race.run.items[0].attempts[0].intentDigest }); race.command('edit-ack', { ...old, readbackRef: 'actual-old-body-readback', deliveredBodyDigest: old.bodyDigest }); assert.equal(race.run.summary.delivery.status, 'delivered'); assert.equal(morningView(race.state.morningRuns)[0].status, 'needs-summary');
});
test('delivery readbacks require intended Slack scope and acquisition inside the exact attempt', () => {
  const fixture = reviewed(); fixture.seal(); const send = { sendRef: 'send', bodyDigest: fixture.run.sealed.bodyDigest }; fixture.command('send-intent', send);
  const ack = { ...send, nativeId: 'message', readbackRef: 'readback', deliveredBodyDigest: send.bodyDigest };
  for (const acquiredAt of ['2020-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z']) assert.throws(() => fixture.command('send-ack', { ...ack, acquiredAt }), /acquisition interval/);
  assert.throws(() => fixture.command('send-ack', { ...ack, scope: { ...morningDelivery.scope, resource: 'wrong-recipient' } }), /exact destination/);
  assert.equal(fixture.run.delivery.status, 'uncertain'); fixture.command('send-ack', ack); assert.equal(fixture.run.delivery.status, 'delivered');
});
test('versioned policy descriptors dispatch historical decisions without source-text hashing', () => {
  const item = morningItem(); const unknown = { ...item, ruleId: null, context: { ...item.context, category: 'successful-login', recognizedLogin: false } };
  const legacy = classifyMail(unknown, 'owner@example.test', [], 1); const current = classifyMail(unknown, 'owner@example.test', [], 2);
  assert.equal(legacy.action, 'archive'); assert.equal(legacy.policyDigest, '8ad3996a98ab9af02ef02f265365a1300d7e09fc354540527e2b9fdd08db0029'); assert.equal(current.action, 'keep'); assert.equal(current.policyVersion, 2); assert.ok(Object.isFrozen(mailPolicies[1]));
  assert.throws(() => classifyMail(item, 'owner@example.test', [], 99), /Unsupported pinned/);
});
test('a delivered same-day run continues after expiry with fresh selected threads and unchanged delivered plans', () => {
  const fixture = reviewed(); fixture.deliver(); const original = structuredClone(fixture.run.delivery); const initialBody = fixture.run.sealed.body;
  const batch = refreshMorning(fixture); assert.equal(fixture.run.cleanup.kind, 'selected-mail-batch-v1'); assert.ok(fixture.run.cleanup.globalGaps.some(gap => gap.includes('stale global'))); assert.equal(fixture.run.cleanup.acquisitions[0].coverageKind, 'selected-ids');
  fixture.command('action-intent', { generation: 1, adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: batch.item.before, receipt: batch.item.receipt, destination: null }, batch.at);
  assert.deepEqual(fixture.run.delivery, original); assert.equal(fixture.run.sealed.body, initialBody); assert.equal(batch.item.reviewHistory.length, 1);
});
test('changed actionable context is kept; changed facts require a verified same-message plan edit', () => {
  const held = reviewed(); held.deliver(); const protectedItem = morningItem(); protectedItem.context.actionRequired = true; protectedItem.context.threadDigest = digest('new actionable thread'); const first = refreshMorning(held, { items: [protectedItem] });
  assert.equal(first.item.classification.action, 'keep'); assert.throws(() => held.command('action-intent', { generation: 1, adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: first.item.before, receipt: first.item.receipt, destination: null }, first.at), /changed cleanup plans|conservative/);
  const fixture = reviewed(); fixture.deliver(); const changed = morningItem(); changed.context.orderReceipt = true; changed.facts = ['The newly acquired receipt says collect order XYZ on the saved date.']; changed.context.threadDigest = digest('changed receipt context'); const batch = refreshMorning(fixture, { items: [changed] });
  const action = { generation: 1, adapter: 'gmail', nativeId: 'gmail-one', action: 'archive', before: batch.item.before, receipt: batch.item.receipt, destination: null };
  assert.throws(() => fixture.command('action-intent', action, batch.at), /verified same-message edit/);
  fixture.command('summary', {}, batch.at); assert.ok(fixture.run.summary.body.includes(changed.facts[0])); const edit = { editRef: 'fresh-plan-edit', bodyDigest: fixture.run.summary.bodyDigest, nativeId: fixture.run.delivery.nativeId };
  fixture.command('edit-intent', edit, batch.at); assert.throws(() => fixture.command('action-intent', action, batch.at), /resolved selected-ID/); assert.throws(() => fixture.command('refresh', { generation: 2, items: [{ adapter: 'gmail', nativeId: 'gmail-one' }], sourceRef: 'owner', reason: 'Do not bypass an uncertain edit.' }, batch.at), /resolved delivery/);
  fixture.command('edit-ack', { ...edit, deliveredBodyDigest: edit.bodyDigest, readbackRef: 'actual-fresh-plan-readback', acquiredAt: batch.at }, batch.at); fixture.command('action-intent', action, batch.at); assert.equal(fixture.run.items[0].attempts.length, 1);
});
test('refresh preserves owner corrections and terminal verified moves across later inbox acquisitions', () => {
  const fixture = reviewed(); fixture.command('correct', { adapter: 'gmail', nativeId: 'gmail-one', disposition: 'dismissed', sourceRef: 'owner-dismissal', reason: 'Handled, do not repeat.' }); fixture.deliver(); const batch = refreshMorning(fixture);
  assert.equal(batch.item.correction.sourceRef, 'owner-dismissal'); assert.throws(() => fixture.command('action-intent', { generation: 1, adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: batch.item.before, receipt: batch.item.receipt, destination: null }, batch.at), /conservative/);
  fixture.command('correct', { adapter: 'gmail', nativeId: 'gmail-one', disposition: 'complete', sourceRef: 'owner-completion', reason: 'Keep exact completion.' }, batch.at); assert.equal(fixture.run.items[0].correctionHistory.length, 1);
  const terminal = reviewed(); terminal.deliver(); intent(terminal); const attempt = terminal.run.items[0].attempts[0]; terminal.command('action-result', { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, after: { ...morningItem().before, labels: ['UNREAD', 'STARRED', 'TRASH'] }, receipt: morningReceipt('gmail'), outcome: 'verified' });
  assert.throws(() => refreshMorning(terminal), /terminal/); assert.equal(terminal.run.items[0].attempts[0].status, 'verified');
});
test('refresh rejects reused timestamps, missing selected context and header-only action wrappers', () => {
  const fixture = reviewed(); fixture.deliver(); const batch = refreshMorning(fixture);
  assert.throws(() => fixture.command('review', { generation: 1, items: [{ ...morningItem(), receipt: morningReceipt('gmail') }] }, batch.at), /exact admitted|genuinely new|fresh source/);
  assert.throws(() => fixture.command('action-intent', { generation: 1, adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: batch.item.before, receipt: morningReceipt('gmail', '2026-10-25T01:06:00.002Z'), destination: null }, '2026-10-25T01:06:00.002Z'), /header-only/);
  assert.throws(() => fixture.command('action-intent', { generation: 1, adapter: 'outlook', nativeId: 'outlook-one', action: 'archive', before: morningItem('outlook').before, receipt: morningReceipt('outlook', batch.at), destination: { folder: 'Archive', folderId: 'archive-native' } }, batch.at), /current resolved selected-ID/);
});

test('batched initial delivery keeps aged global sources explicit instead of requiring a whole-run sprint', () => {
  const fixture = morningFixture({ cleanupMode: 'batched-v1' }); fixture.command('review', { items: [morningItem(), morningItem('outlook')] }); const at = '2026-10-25T01:06:00.000Z'; fixture.command('seal', morningAssessments(at), at);
  assert.ok(fixture.run.sealed.gaps.some(gap => gap.includes('stale source'))); const send = { sendRef: 'degraded-original-send', bodyDigest: fixture.run.sealed.bodyDigest }; fixture.command('send-intent', send, at); fixture.command('send-ack', { ...send, acquiredAt: at, deliveredBodyDigest: send.bodyDigest, nativeId: 'same-original-message', readbackRef: 'actual-original-body-readback' }, at);
  assert.equal(fixture.run.delivery.status, 'delivered'); assert.throws(() => fixture.command('send-intent', send, at), /no prior uncertain|fresh source/);
});
test('refreshed edits replace old mail plans and expose current batch holds independently of global age', () => {
  const fixture = reviewed(); fixture.command('correct', { adapter: 'gmail', nativeId: 'gmail-one', disposition: 'dismissed', sourceRef: 'owner', reason: 'Already handled.' }); fixture.deliver(); const batch = refreshMorning(fixture); fixture.command('summary', {}, batch.at);
  assert.doesNotMatch(fixture.run.summary.body, /## Mail review/); assert.match(fixture.run.summary.body, /dismissed/); assert.equal((fixture.run.summary.body.match(/gmail\\-one/g) ?? []).length, 1);
  const selected = morningView(fixture.state.morningRuns, batch.at)[0].cleanup.selectedIds[0]; assert.equal(selected.state, 'kept'); assert.equal(morningView(fixture.state.morningRuns, batch.at)[0].cleanup.globalCoverage, 'degraded');
});
