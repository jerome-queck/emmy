import { policy as fixturePolicy, review, rule, plan as fixturePlan, at } from '../test/fixtures/briefing-policy.mjs';
import { digest } from '../src/records.mjs';

export const briefingWorkflowCases = 25;
export function verifyBriefingWorkflow({ policy, plan, reporting }, check) {
  let cases = 0;
  const expect = (name, value, message) => { cases++; check('morning-contract', { case: `v3-workflow/${name}` }, value, message); };
  const rejects = action => { try { action(); return false; } catch { return true; } };
  const p = fixturePolicy(); const r = review();
  expect('receipt', policy.classifyBriefingMail(r, p).action === 'archive', 'Actual invoices retain useful facts then archive.');
  expect('receipt-no-facts', policy.classifyBriefingMail({ ...r, facts: [] }, p).action === 'keep', 'Receipt facts cannot be omitted.');
  expect('serious-receipt', policy.classifyBriefingMail({ ...r, context: { ...r.context, seriousSecurity: true } }, p).action === 'keep', 'Actual serious receipt issues stay open.');
  const bytes = Buffer.from('identical exact PDF'); const encoded = bytes.toString('base64');
  const raw = Buffer.from(JSON.stringify({ id: r.before.nativeId, data: encoded })); const copy = Buffer.from(JSON.stringify({ id: 'copy', data: encoded })); r.context.threadDigest = digest(raw);
  r.policyEvidence.duplicate = { nativeId: 'copy', recordPurpose: 'invoice', contentSha256: digest(bytes), copySha256: digest(bytes), contentBase64: encoded, copyBase64: encoded, verified: true, sourceRef: 'copy-proof', currentCaptureSha256: digest(raw), copyCaptureSha256: digest(copy), currentMessagePointer: '', copyMessagePointer: '', contentPointer: '/data', copyContentPointer: '/data' };
  expect('duplicate', policy.validateDuplicateCaptures(r, raw, copy) && policy.classifyBriefingMail(r, p).action === 'trash', 'Verified same-purpose copies permit recoverable Trash.');
  r.policyEvidence.duplicate.recordPurpose = 'receipt';
  expect('different-purpose', policy.classifyBriefingMail(r, p).action === 'archive', 'Invoice and receipt for one payment are distinct records.');
  r.policyEvidence.duplicate.recordPurpose = 'invoice'; const wrong = Buffer.from(JSON.stringify({ id: 'wrong', data: encoded })); r.policyEvidence.duplicate.copyCaptureSha256 = digest(wrong);
  expect('raw-identity', rejects(() => policy.validateDuplicateCaptures(r, raw, wrong)), 'Copy extraction binds the original exact native identity.');
  const conflicted = fixturePolicy(); conflicted.rules.push({ ...conflicted.rules.at(-1), id: 'different-facts', requiresFacts: false }); const routine = review(); routine.policyEvidence.recordPurpose = 'notice'; routine.context.category = 'openai-routine-fyi'; routine.facts = [];
  expect('rule-conflict', rejects(() => policy.classifyBriefingMail(routine, conflicted)), 'Same-action safety differences never depend on rule order.');
  routine.context.category = 'routine-account-fyi'; routine.facts = ['Routine reference']; expect('provider-scope', policy.classifyBriefingMail(routine, p).action === 'archive', 'Unrelated routine providers do not inherit OpenAI Trash.');
  const input = fixturePlan(); input.mail[0].items[0].facts = ['Login code 123456'];
  expect('privacy', rejects(() => plan.preparePolicyBriefing(input)), 'Login codes cannot enter the human body.');
  const completed = fixturePlan(); completed.tasks.items.push({ nativeId: 'task', listId: 'tasks-1', title: 'Completed study', status: 'completed', ownerDismissed: false, manuallyMoved: false, doDate: null, deadline: null }); completed.calendar.items.push({ nativeId: 'projection', calendarId: 'calendar-1', iCalUID: 'uid', start: '2026-11-03T01:00:00.000Z', end: '2026-11-03T02:00:00.000Z', allDay: false, title: 'Completed study', status: 'confirmed', taskId: 'task' });
  expect('completed-projection', !plan.preparePolicyBriefing(completed).body.includes('Completed study'), 'Exact native completion suppresses its projection.');
  const stale = fixturePlan(); stale.mail[0].observedAt = '2026-11-02T23:00:00.000Z'; expect('source-clock', plan.preparePolicyBriefing(stale).gaps.some(gap => gap.includes('original source stale')), 'Fresh wrappers preserve original stale source age.');
  const pending = { kind: 'maintenance', scheduledFor: '2026-11-02T19:15:00.000Z', attemptId: 'attempt', requestId: 'request', state: 'pending', execution: 'running', coverage: 'partial', availability: 'available', sourceEnd: null, observedAt: null, recordedAt: null, snapshotDigest: null, summary: '' };
  expect('pending', reporting.assessBriefingReporting({ action: 'checks', asOf: at, results: [pending] }).readyForBriefing === false, 'Pending exact requests must reach terminal.');
  const unstarted = reporting.assessBriefingReporting({ action: 'checks', asOf: at, results: [] });
  expect('unstarted', unstarted.readyForBriefing === false && unstarted.follow.length === 0 && unstarted.acquisitionRequired.length > 0, 'Absent attempts cannot stand in for verified terminal missing output.');
  const missing = unstarted.acquisitionRequired.map(row => ({ ...pending, kind: row.kind, scheduledFor: row.scheduledFor, attemptId: `missing-${row.kind}`, requestId: `missing-request-${row.kind}`, state: 'missing', execution: 'unknown', coverage: 'unavailable', availability: 'unavailable', summary: 'Synthetic verified terminal missing.' }));
  expect('terminal-missing', reporting.assessBriefingReporting({ action: 'checks', asOf: at, results: missing }).readyForBriefing === true, 'Explicit terminal missing attempts permit a disclosed gap, never inferred empty output.');
  expect('running-blocker', rejects(() => reporting.assessBriefingReporting({ action: 'checks', asOf: at, results: [{ ...pending, state: 'offline' }] })), 'Inaccessible reporting cannot erase known running workload and its follow identity.');
  expect('lifecycle', reporting.assessBriefingReporting({ action: 'checks', asOf: at, results: [] }).expected.find(row => row.kind === 'lifecycle').state === 'not-due', 'The lifecycle one-off is never a daily stale nag.');
  const useful = fixturePlan(); useful.checks = [{ ...pending, state: 'terminal', execution: 'completed', snapshotDigest: 'a'.repeat(64), observedAt: at, recordedAt: at, sourceEnd: '2026-11-02T16:00:00.000Z', summary: 'Useful verified improvement.' }]; expect('check-summary', plan.preparePolicyBriefing(useful).body.includes('Useful verified improvement.'), 'One briefing includes useful check content.');
  const entry = { id: 'same-id', kind: 'owner-correction', risk: 'low-risk', authority: p.authority, scope: 'narrow-example', action: 'keep', observations: [], counterexamples: [] };
  expect('decision-conflict', rejects(() => policy.assessBriefingLearning(p, { ...entry, action: 'trash' }, [entry])), 'A reused decision ID cannot silently lose a correction.');
  const self = fixturePolicy(); self.rules = [rule('seerr-available', { category: 'verified-self-seerr-available' })]; routine.context.category = 'verified-self-seerr-available';
  expect('seerr', rejects(() => policy.classifyBriefingMail(routine, self)), 'Seerr requires exact self sender and both subject markers.');
  const dated = fixturePlan(); const task = { nativeId: 'dated', listId: 'tasks-1', title: 'Future study', status: 'needsAction', ownerDismissed: false, manuallyMoved: false, doDate: '2026-11-05', deadline: null }; dated.tasks.items = [task];
  expect('future-do-date', !plan.preparePolicyBriefing(dated).body.includes('Future study'), 'Future study do-dates do not enter current Tasks.');
  task.deadline = '2026-11-06T00:00:00.000Z';
  expect('future-deadline', plan.preparePolicyBriefing(dated).body.includes('Future study. Study do-date 2026-11-05. Deadline'), 'A real upcoming deadline remains separately labelled.');
  task.deadline = null; task.doDate = dated.day; task.ownerDismissed = null;
  const unknownTask = plan.preparePolicyBriefing(dated);
  expect('unknown-task', !unknownTask.body.includes('Future study') && unknownTask.gaps.includes('Task dismissal or move status unknown'), 'Unknown overlays cannot become false active status.');
  const invalid = review(); invalid.context.complete = 'false';
  expect('strict-complete', rejects(() => policy.classifyBriefingMail(invalid, p)), 'String completeness cannot authorize a disposition.');
  invalid.context.complete = true; delete invalid.context.personal;
  expect('strict-protection', rejects(() => policy.classifyBriefingMail(invalid, p)), 'Missing protected context cannot become false.');
  const unavailable = fixturePlan(); Object.assign(unavailable.mail[0], { observedAt: null, capturedAt: null, complete: false, paginationComplete: false });
  expect('unavailable-items', rejects(() => plan.preparePolicyBriefing(unavailable)), 'Unknown source clocks cannot claim acquired mail.');
  if (cases !== briefingWorkflowCases) throw new Error(`Briefing workflow domain changed ${cases}`);
  return cases;
}
const mutation = (id, source, find, replacement, name) => ({ id: `briefing-${id}`, source: `src/${source}.mjs`, property: 'morning-contract', edits: [[find, replacement]], counterexample: `v3-workflow/${name}` });
export const briefingWorkflowMutations = [
  mutation('future-task', 'briefing-plan', 'row.doDate <= input.day', 'true', 'future-do-date'),
  mutation('unknown-task', 'briefing-plan', 'row.ownerDismissed === false', 'row.ownerDismissed !== true', 'unknown-task'),
  mutation('strict-context', 'briefing-policy', 'need(Object.keys(context).length', 'need(true || Object.keys(context).length', 'strict-complete'),
  mutation('unavailable-items', 'briefing-plan', ' && list(value.items) && value.items.length === 0 && (value.inboxIds ?? value.acquiredResourceIds)?.length === 0', '', 'unavailable-items'),
  mutation('receipt-facts', 'briefing-policy', "if (!review.facts.length) return keep('useful-receipt-facts-required');", "if (false) return keep('useful-receipt-facts-required');", 'receipt-no-facts'),
  mutation('record-purpose', 'briefing-policy', 'duplicate.recordPurpose === evidence.recordPurpose && duplicate.contentSha256', 'true && duplicate.contentSha256', 'different-purpose'),
  mutation('copy-native-id', 'briefing-policy', '(copy.nativeId ?? copy.id) === proof.nativeId && ', '', 'raw-identity'),
  mutation('privacy', 'briefing-policy', "need(!/(?:\\b", "need(true || !/(?:\\b", 'privacy'),
  mutation('completed-projection', 'briefing-plan', "if (task && (task.status !== 'needsAction' || task.ownerDismissed || task.manuallyMoved)) continue;", 'if (false) continue;', 'completed-projection'),
  mutation('pending-check', 'briefing-reporting', "readyForBriefing: !expected.some(row => row.state === 'unstarted') && !input.results.some(result => result.state === 'pending')", 'readyForBriefing: true', 'pending'),
  mutation('unstarted-check', 'briefing-reporting', "!expected.some(row => row.state === 'unstarted') && ", '', 'unstarted'),
  mutation('running-blocker', 'briefing-reporting', "result.state === 'pending' || result.execution !== 'running'", 'true', 'running-blocker'),
];
