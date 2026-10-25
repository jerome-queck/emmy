import { canonical, digest } from '../src/records.mjs';
import { morningAssessments, morningCommand, morningDelivery, morningAt, morningEntities, morningItem, morningOpen, morningReceipt, morningRoot, morningWindow } from './morning-fixtures.mjs';
export const morningBounds = { protectedContextFlags: 15, adapters: ['gmail', 'outlook'], cases: 52, assumptions: 'Parsed single-controller journal, retained unauthenticated parent interpretations and completed fleet acquisitions. No connector/browser/native truth, external exactly-once action, delivery or omitted-source completeness is authenticated.' };
export function verifyMorningPolicy({ morning, fleet }, check) {
  let cases = 0;
  const expect = (name, value, message) => { cases++; check('morning-contract', { case: name }, value, message); };
  const rejects = action => { try { action(); return false; } catch { return true; } };
  const item = morningItem(); const grants = morningOpen.rules;
  for (const flag of ['actionRequired', 'reviewRequired', 'ambiguous', 'seriousSecurity', 'unresolved', 'consequential', 'academic', 'research', 'personal', 'billing', 'terms', 'securityWarning', 'invitation', 'directMessage']) expect(`context/${flag}`, morning.classifyMail({ ...item, context: { ...item.context, [flag]: true } }, morningOpen.accounts.gmail.account, grants).action === 'keep', 'Protected thread context overrides narrow Trash authority.');
  expect('context/unsafe', morning.classifyMail({ ...item, context: { ...item.context, safeUnreadInspection: false } }, morningOpen.accounts.gmail.account, grants).action === 'keep', 'Unread-unsafe inspection keeps the item.');
  expect('rule/missing-authority', morning.classifyMail(item, morningOpen.accounts.gmail.account, []).action === 'archive', 'Missing owner narrow authority cannot authorize Trash.');
  expect('rule/valid', morning.classifyMail(item, morningOpen.accounts.gmail.account, grants).action === 'trash', 'An exact applicable narrow owner rule supports recoverable Trash.');
  expect('rule/spoof', morning.classifyMail({ ...item, before: { ...item.before, sender: 'contact@info.foodpanda.sg.evil.test' } }, morningOpen.accounts.gmail.account, grants).action !== 'trash', 'Display or suffix lookalikes cannot match exact sender.');
  const self = { ...item, ruleId: 'seerr-available', before: { ...item.before, sender: morningOpen.accounts.gmail.account, subject: '[Seerr] queued' }, context: { ...item.context, category: 'self-notification' } };
  expect('rule/both-markers', morning.classifyMail(self, morningOpen.accounts.gmail.account, [{ id: 'seerr-available', version: 1, ownerRef: 'owner' }]).action !== 'trash', 'Self-sent notifications need both exact subject markers.');
  expect('facts/required', morning.classifyMail({ ...item, context: { ...item.context, orderReceipt: true } }, morningOpen.accounts.gmail.account, grants).action === 'keep', 'Useful order facts are required before an archive can be proposed.');
  expect('policy/version', morning.classifyMail(item, morningOpen.accounts.gmail.account, grants).policyVersion === 2, 'Every classification retains its policy version and digest.');
  const prepare = () => {
    const state = fleet.fleetInitial(morningRoot); morning.morningTransition(state, morningOpen, morningRoot, morningAt);
    const run = state.morningRuns[0];
    for (const source of run.sources) {
      const receipt = morningReceipt(source.id); const key = digest(source.id);
      state.jobs.push({ key, status: 'completed', input: { kind: 'briefing-source-read', entityIds: [source.entityId] }, receipts: [receipt] });
      morning.morningTransition(state, { step: 'source', runId: run.id, sourceId: source.id, jobKey: key, receipt, paginationComplete: true, cached: false, messageIds: ['gmail', 'outlook'].includes(source.role) ? [`${source.role}-one`] : [], resourceIds: source.role === 'calendar-inventory' ? ['calendar'] : source.role === 'task-inventory' ? ['tasks'] : [], window: ['calendar', 'tasks'].includes(source.role) ? morningWindow : null }, morningRoot, morningAt);
    }
    const step = (step, fields = {}, at = morningAt) => morning.morningTransition(state, morningCommand(step, fields), morningRoot, at);
    step('review', { items: [morningItem(), morningItem('outlook')] });
    const seal = () => step('seal', morningAssessments());
    const send = () => { seal(); step('send-intent', { sendRef: 'send', bodyDigest: run.sealed.bodyDigest }); };
    const deliver = () => { send(); step('send-ack', { sendRef: 'send', bodyDigest: run.sealed.bodyDigest, deliveredBodyDigest: run.sealed.bodyDigest, nativeId: 'message', readbackRef: 'readback' }); };
    const intent = () => step('action-intent', { adapter: 'gmail', nativeId: 'gmail-one', action: 'trash', before: item.before, receipt: item.receipt, destination: null });
    return { state, run, step, seal, send, deliver, intent };
  };
  let fixture = prepare(); expect('delivery/before', rejects(fixture.intent), 'Archive/Trash require actual parent delivery acknowledgement first.');
  fixture.send(); expect('delivery/uncertain', rejects(fixture.intent), 'Send intent alone cannot authorize cleanup.');
  expect('delivery/no-resend', rejects(() => fixture.step('send-intent', { sendRef: 'send', bodyDigest: fixture.run.sealed.bodyDigest })), 'Uncertain sends cannot replay.');
  fixture = prepare(); fixture.deliver(); fixture.intent(); const attempt = fixture.run.items[0].attempts[0];
  const result = { adapter: 'gmail', nativeId: 'gmail-one', intentDigest: attempt.intentDigest, receipt: item.receipt, outcome: 'verified', after: { ...item.before, labels: ['UNREAD', 'STARRED', 'TRASH'] } };
  expect('mail/unread', rejects(() => fixture.step('action-result', { ...result, after: { ...result.after, unread: false } })), 'Same-ID native readback must preserve unread.');
  expect('mail/identity', rejects(() => fixture.step('action-result', { ...result, after: { ...result.after, nativeId: 'other' } })), 'Readback cannot borrow another item.');
  fixture.step('action-result', result); expect('mail/verified', fixture.run.items[0].attempts[0].status === 'verified', 'Exact reversible native-state declaration completes only that item.');
  expect('mail/no-repeat', rejects(fixture.intent), 'Verified mail action cannot replay.');
  fixture = prepare(); fixture.run.sources[0].capture.cached = true; fixture.deliver(); expect('coverage/cache', fixture.run.sealed.gaps.length > 0 && rejects(fixture.intent), 'Cached source cannot imply fresh complete cleanup coverage.');
  fixture = prepare(); fixture.run.sources[2].capture.resourceIds.push('secondary-calendar'); fixture.seal(); expect('coverage/omitted', fixture.run.sealed.gaps.length > 0, 'Every declared accessible calendar must be acquired.');
  fixture = prepare(); fixture.run.sources[0].capture.messageIds.push('second-reviewed'); fixture.seal(); expect('coverage/accounting', fixture.run.sealed.gaps.length > 0, 'Unaccounted acquired mail IDs degrade the brief.');
  fixture = prepare(); fixture.seal(); expect('source/stale-send', rejects(() => fixture.step('send-intent', { sendRef: 'late', bodyDigest: fixture.run.sealed.bodyDigest }, '2026-10-25T01:05:00.001Z')), 'Old sealed acquisitions cannot authorize a later send.');
  fixture = prepare(); fixture.step('correct', { adapter: 'gmail', nativeId: 'gmail-one', disposition: 'complete', sourceRef: 'owner', reason: 'This item is already handled.' }); fixture.deliver(); expect('correction/complete', rejects(fixture.intent) && fixture.run.sealed.body.includes('gmail complete (1)'), 'Exact completion correction suppresses cleanup and pending reminder.');
  fixture = prepare(); fixture.deliver(); fixture.step('summary'); const edit = { editRef: 'edit', nativeId: 'message', bodyDigest: fixture.run.summary.bodyDigest }; expect('edit/same-id', rejects(() => fixture.step('edit-intent', { ...edit, nativeId: 'other' })), 'Cleanup summary can amend only the same native brief.');
  fixture.step('edit-intent', edit); expect('edit/no-repeat', rejects(() => fixture.step('edit-intent', edit)), 'An uncertain edit requires inspection, never resend.');
  const resolveEdit = { ...edit, priorBodyDigest: fixture.run.delivery.bodyDigest, readbackRef: 'prior-body-readback', sourceRef: 'owner-inspection', reason: 'Same native message still contains prior body.', outcome: 'known-unexecuted' };
  expect('edit/no-effect-mismatch', rejects(() => fixture.step('edit-resolve', { ...resolveEdit, priorBodyDigest: digest('other') })), 'No-effect reconciliation must name the exact prior body.');
  fixture.step('edit-resolve', resolveEdit); expect('edit/no-effect-retained', fixture.run.summary.editAttempts.length === 1 && fixture.run.summary.delivery === null, 'Exact same-message no-effect inspection retains failed edit before permitting another bounded attempt.');
  expect('open/day', rejects(() => morning.morningTransition(fleet.fleetInitial(morningRoot), { ...morningOpen, day: '2026-10-26', runId: '2026-10-26' }, morningRoot, morningAt)), 'A morning run must use the real Singapore day.');
  fixture = prepare(); const assessments = morningAssessments();
  expect('assessment/stale-calendar', rejects(() => fixture.step('seal', { ...assessments, calendar: { ...assessments.calendar, result: { ...assessments.calendar.result, evaluatedAt: '2026-10-24T01:00:00.000Z' } } })), 'A fresh wrapper cannot refresh old calendar evaluation.');
  expect('assessment/stale-briefing', rejects(() => fixture.step('seal', { ...assessments, briefing: { ...assessments.briefing, assessment: { ...assessments.briefing.assessment, checkedAt: '2026-10-24T01:00:00.000Z' } } })), 'A fresh wrapper cannot refresh old rendered briefing source time.');
  fixture = prepare(); fixture.step('correct', { adapter: 'outlook', nativeId: 'outlook-one', disposition: 'complete', sourceRef: 'owner', reason: 'Handled.' }); fixture.deliver(); fixture.step('summary'); fixture.intent();
  fixture.step('action-result', { ...result, intentDigest: fixture.run.items[0].attempts[0].intentDigest });
  expect('summary/stale-intent', rejects(() => fixture.step('edit-intent', { editRef: 'stale', nativeId: 'message', bodyDigest: fixture.run.summary.bodyDigest })), 'A summary rendered before cleanup cannot become the final delivered outcome.');
  fixture = prepare(); fixture.step('correct', { adapter: 'outlook', nativeId: 'outlook-one', disposition: 'complete', sourceRef: 'owner', reason: 'Handled.' }); fixture.deliver(); fixture.intent(); fixture.step('summary');
  const pendingEdit = { editRef: 'pending-edit', nativeId: 'message', bodyDigest: fixture.run.summary.bodyDigest }; fixture.step('edit-intent', pendingEdit); fixture.step('action-result', { ...result, intentDigest: fixture.run.items[0].attempts[0].intentDigest }); fixture.step('edit-ack', { ...pendingEdit, readbackRef: 'readback', deliveredBodyDigest: pendingEdit.bodyDigest });
  expect('summary/stale-view', morning.morningView(fixture.state.morningRuns)[0].status === 'needs-summary', 'A truthful old-body edit acknowledgement cannot complete newer outcomes.');
  fixture = prepare(); fixture.send(); const deliveryAck = { sendRef: 'send', bodyDigest: fixture.run.sealed.bodyDigest, deliveredBodyDigest: fixture.run.sealed.bodyDigest, nativeId: 'message', readbackRef: 'readback' };
  expect('delivery/scope', rejects(() => fixture.step('send-ack', { ...deliveryAck, scope: { ...morningDelivery.scope, service: 'gmail' } })), 'Gmail readback cannot establish Slack delivery.');
  expect('delivery/recipient', rejects(() => fixture.step('send-ack', { ...deliveryAck, scope: { ...morningDelivery.scope, resource: 'other-recipient' } })), 'Delivery must preserve exact intended recipient.');
  expect('delivery/old-time', rejects(() => fixture.step('send-ack', { ...deliveryAck, acquiredAt: '2020-01-01T00:00:00.000Z' })), 'An old readback cannot establish the current send.');
  expect('delivery/future-time', rejects(() => fixture.step('send-ack', { ...deliveryAck, acquiredAt: '2027-01-01T00:00:00.000Z' })), 'A future readback cannot establish delivery.');
  const unknownLogin = { ...item, ruleId: null, context: { ...item.context, category: 'successful-login', recognizedLogin: false } };
  const historical = morning.classifyMail(unknownLogin, morningOpen.accounts.gmail.account, [], 1);
  expect('policy/historical', historical.action === 'archive' && historical.policyDigest === '8ad3996a98ab9af02ef02f265365a1300d7e09fc354540527e2b9fdd08db0029', 'Legacy version dispatch preserves its exact recorded digest and decisions.');
  expect('policy/current', morning.classifyMail(unknownLogin, morningOpen.accounts.gmail.account, [], 2).action === 'keep', 'Unrecognized successful login remains unknown and kept.');
  const historicalState = fleet.fleetInitial(morningRoot); morning.morningTransition(historicalState, { ...morningOpen, policyVersion: 1 }, morningRoot, morningAt);
  historicalState.morningRuns[0].sources[0].capture = { messageIds: [item.before.nativeId] }; morning.morningTransition(historicalState, { step: 'review', runId: morningOpen.runId, items: [unknownLogin] }, morningRoot, morningAt);
  expect('policy/run-pin', historicalState.morningRuns[0].items[0].classification.policyVersion === 1 && historicalState.morningRuns[0].items[0].classification.action === 'archive', 'Historical runs use their pinned classifier, not the current default.');
  const groupState = fleet.fleetTransition(fleet.fleetInitial(morningRoot), { operation: 'assess', captures: [] }, morningRoot, morningAt).state;
  const groupAction = { operation: 'group-send-intent', alertIds: groupState.alerts.map(row => row.id), bodyDigest: digest('body'), sendRef: 'group', delivery: morningDelivery }; const groupedState = fleet.fleetTransition(groupState, groupAction, morningRoot, morningAt).state;
  const groupAck = { ...groupAction, operation: 'group-send-ack', deliveredBodyDigest: groupAction.bodyDigest, readbackRef: 'group-readback', nativeId: 'message', scope: morningDelivery.scope, acquiredAt: morningAt }; delete groupAck.delivery;
  expect('group-delivery/scope', rejects(() => fleet.fleetTransition(groupedState, { ...groupAck, scope: { ...morningDelivery.scope, resource: 'other' } }, morningRoot, morningAt)), 'Grouped delivery cannot cross recipient scope.');
  expect('group-delivery/old-time', rejects(() => fleet.fleetTransition(groupedState, { ...groupAck, acquiredAt: '2020-01-01T00:00:00.000Z' }, morningRoot, morningAt)), 'Grouped delivery cannot borrow historical readback.');
  expect('group-delivery/current', fleet.fleetTransition(groupedState, groupAck, morningRoot, morningAt).state.deliveryGroups[0].status === 'delivered', 'Current exact-scope group readback remains valid.');
  return { cases };
}
const mutant = (id, before, after, counterexample) => ({ id: `morning-${id}`, source: 'src/morning.mjs', property: 'morning-contract', edits: [[before, after]], counterexample });
export const morningMutations = [
  mutant('stale-summary-intent', 'run.summary.outcomeDigest === outcomeDigest(run)', 'true', 'summary/stale-intent'),
  mutant('stale-summary-complete', 'run.summary?.outcomeDigest === outcomeDigest(run)', 'true', 'summary/stale-view'),
  mutant('delivery-wrong-scope', 'same(command.scope, intent.scope)', 'true', 'delivery/scope'),
  mutant('delivery-old-readback', 'Date.parse(command.acquiredAt) >= Date.parse(intent.at)', 'true', 'delivery/old-time'),
  mutant('delivery-future-readback', 'Date.parse(command.acquiredAt) <= Date.parse(at)', 'true', 'delivery/future-time'),
  mutant('unknown-login-archive', "policy.unknownLogin === 'keep' && context.category === 'successful-login' && !context.recognizedLogin", 'false', 'policy/current'),
  mutant('ignore-run-policy', 'run.policyVersion ?? 1', '2', 'policy/run-pin'),
  { id: 'morning-refresh-old-calendar', source: 'src/morning.mjs', property: 'morning-contract', edits: [[' && command.calendar.receipt.observedAt === calendar.evaluatedAt', ''], [' fresh({ ...command.calendar.receipt, observedAt: calendar.evaluatedAt }, run, at);', '']], counterexample: 'assessment/stale-calendar' },
  { id: 'morning-refresh-old-briefing', source: 'src/morning.mjs', property: 'morning-contract', edits: [[' && command.briefing.receipt.observedAt === briefingReceipt.checkedAt', ''], ['fresh({ ...command.briefing.receipt, observedAt: briefingReceipt.checkedAt }, run, at);', '']], counterexample: 'assessment/stale-briefing' },
  mutant('ignore-protected-context', 'protectedFlags.some(key => context[key])', 'false', 'context/actionRequired'),
  mutant('ignore-unsafe-unread', '!context.complete || !context.safeUnreadInspection', '!context.complete', 'context/unsafe'),
  mutant('sender-prefix', 'sender === rule.sender', 'sender.startsWith(rule.sender)', 'rule/spoof'),
  mutant('seerr-one-marker', " && before.subject.includes('Request Now Available')", '', 'rule/both-markers'),
  mutant('drop-facts', "(context.orderReceipt || context.recognizedLogin || context.category === 'account-notice') && review.facts.length === 0", 'false', 'facts/required'),
  mutant('cleanup-before-delivery', "run.delivery?.status === 'delivered' && run.sealed && !run.sealed.gaps.length", 'true', 'delivery/before'),
  mutant('ignore-unread', ' && after.unread === item.before.unread', '', 'mail/unread'),
  mutant('ignore-identity', 'after.nativeId === item.before.nativeId && ', '', 'mail/identity'),
  mutant('allow-edit-other-message', 'command.nativeId === run.delivery.nativeId && ', '', 'edit/same-id'),
];
