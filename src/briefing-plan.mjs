import { digest } from './records.mjs';
import { validateBriefingPolicy, classifyBriefingMail, briefingHumanText, assessBriefingLearning } from './briefing-policy.mjs';
import { assessBriefingReporting } from './briefing-reporting.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2000 && !/[\x00-\x1f\x7f]/.test(value);
const list = (value, max = 500) => Array.isArray(value) && value.length <= max;
const unique = values => new Set(values).size === values.length;
const clean = briefingHumanText;
function shape(value, fields) { need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), `Plan members must be ${fields.join(', ')}`); }
function strings(value) { need(list(value) && value.every(text) && unique(value), 'Bounded unique text required'); }
function source(value, asOf, gaps, role) {
  if (value.observedAt === null || value.capturedAt === null) { need(value.observedAt === null && value.capturedAt === null && value.complete === false && value.paginationComplete === false && list(value.gaps) && value.gaps.every(text) && list(value.items) && value.items.length === 0 && (value.inboxIds ?? value.acquiredResourceIds)?.length === 0, 'Unavailable source cannot invent clocks, completeness or acquired items'); gaps.push(`${role} original source clock unavailable`, ...value.gaps.map(gap => `${role}: ${gap}`)); return; }
  need(stamp(value.observedAt) && stamp(value.capturedAt) && value.observedAt <= value.capturedAt && value.capturedAt <= asOf, 'Original source/acquisition clocks required');
  need(typeof value.complete === 'boolean' && typeof value.paginationComplete === 'boolean', 'Explicit coverage required'); strings(value.gaps);
  if (!value.complete || !value.paginationComplete) gaps.push(`${role} acquisition incomplete`);
  if (Date.parse(asOf) - Date.parse(value.observedAt) > 300000) gaps.push(`${role} original source stale`);
  gaps.push(...value.gaps.map(gap => `${role}: ${gap}`));
}
export function preparePolicyBriefing(input) {
  shape(input, ['schemaVersion', 'day', 'asOf', 'policy', 'mail', 'calendar', 'tasks', 'obligations', 'checks', ...(Object.hasOwn(input, 'checkHistory') ? ['checkHistory'] : []), ...(Object.hasOwn(input, 'mailOutcomes') ? ['mailOutcomes'] : []), ...(Object.hasOwn(input, 'journalGaps') ? ['journalGaps'] : []), ...(Object.hasOwn(input, 'learning') ? ['learning'] : [])]);
  need(input.schemaVersion === 3 && /^\d{4}-\d\d-\d\d$/.test(input.day) && stamp(input.asOf), 'Invalid briefing version or clock');
  const start = new Date(`${input.day}T00:00:00+08:00`).toISOString(); const end = new Date(Date.parse(start) + 86400000).toISOString();
  need(input.asOf >= start && input.asOf < end, 'Assessment must use current Singapore day');
  validateBriefingPolicy(input.policy);
  strings(input.journalGaps ?? []);
  const gaps = [...(input.journalGaps ?? [])]; const judgments = []; let messages = 0; let contexts = 0; const conversations = new Set();
  need(list(input.mail, 2) && input.mail.length === 2 && unique(input.mail.map(row => row.adapter)), 'Both authorized mailbox captures required');
  for (const mail of input.mail) {
    shape(mail, ['adapter', 'account', 'surface', 'environment', 'observedAt', 'capturedAt', 'complete', 'paginationComplete', 'gaps', 'inboxIds', 'items', 'expandedContextCount']);
    need(['gmail', 'outlook'].includes(mail.adapter) && mail.account === input.policy.accounts[mail.adapter].account && mail.environment === 'dot-cloud' && mail.surface === (mail.adapter === 'gmail' ? 'connector' : 'browser'), 'Primary Gmail connector and school Outlook cloud UI only');
    source(mail, input.asOf, gaps, mail.adapter); strings(mail.inboxIds);
    need(list(mail.items) && unique(mail.items.map(row => row.before.nativeId)) && Number.isSafeInteger(mail.expandedContextCount) && mail.expandedContextCount >= 0 && mail.expandedContextCount <= 5000, 'Invalid message/context accounting');
    for (const review of mail.items) {
      need(review.adapter === mail.adapter && mail.inboxIds.includes(review.before.nativeId), 'Review must bind exact original Inbox identity');
      const classification = classifyBriefingMail(review, input.policy);
      judgments.push({ adapter: mail.adapter, nativeId: review.before.nativeId, threadId: review.before.threadId, reviewDigest: digest(review), classification });
      conversations.add(`${mail.adapter}/${review.before.threadId}`); messages++;
      if (classification.reason === 'incomplete-or-unsafe-thread-inspection') gaps.push(`${mail.adapter} context/read-state review held`);
    }
    contexts += mail.expandedContextCount;
    const missing = mail.inboxIds.filter(id => !mail.items.some(row => row.before.nativeId === id));
    if (missing.length) gaps.push(`${mail.adapter} ${missing.length} Inbox messages unreviewed`);
  }
  for (const [role, capture] of [['calendar', input.calendar], ['tasks', input.tasks]]) {
    shape(capture, ['observedAt', 'capturedAt', 'complete', 'paginationComplete', 'gaps', 'window', 'resourceIds', 'acquiredResourceIds', 'items']);
    shape(capture.window, ['start', 'end']); need(capture.window.start === start && capture.window.end === end, 'Exact full Singapore day window required');
    strings(capture.resourceIds); strings(capture.acquiredResourceIds); need(capture.acquiredResourceIds.every(id => capture.resourceIds.includes(id)), 'Unknown acquired resource');
    source(capture, input.asOf, gaps, role); need(list(capture.items, 2000), 'Bounded day items required');
    if (capture.resourceIds.some(id => !capture.acquiredResourceIds.includes(id))) gaps.push(`${role} resources missing`);
  }
  const tasks = new Map();
  for (const task of input.tasks.items) {
    shape(task, ['nativeId', 'listId', 'title', 'status', 'ownerDismissed', 'manuallyMoved', 'doDate', 'deadline']);
    need(text(task.nativeId) && text(task.title) && input.tasks.acquiredResourceIds.includes(task.listId) && ['needsAction', 'completed', 'cancelled'].includes(task.status) && [task.ownerDismissed, task.manuallyMoved].every(value => value === null || typeof value === 'boolean') && (task.doDate === null || typeof task.doDate === 'string' && /^\d{4}-\d\d-\d\d$/.test(task.doDate)) && (task.deadline === null || stamp(task.deadline)), 'Exact native Task status required');
    need(!tasks.has(task.nativeId), 'Conflicting duplicate Task identity'); tasks.set(task.nativeId, task);
    if (task.status === 'needsAction' && (task.ownerDismissed === null || task.manuallyMoved === null)) gaps.push('Task dismissal or move status unknown');
  }
  const seen = new Map(); const events = [];
  for (const event of input.calendar.items) {
    shape(event, ['nativeId', 'calendarId', 'iCalUID', 'start', 'end', 'allDay', 'title', 'status', 'taskId']);
    need(text(event.nativeId) && input.calendar.acquiredResourceIds.includes(event.calendarId) && (event.iCalUID === null || text(event.iCalUID)) && stamp(event.start) && stamp(event.end) && event.end > event.start && typeof event.allDay === 'boolean' && text(event.title) && ['confirmed', 'cancelled'].includes(event.status) && (event.taskId === null || text(event.taskId)), 'Invalid occurrence fields');
    const key = `${event.iCalUID ?? event.nativeId}/${event.start}`;
    const prior = seen.get(key);
    if (prior) { need(prior.title === event.title && prior.end === event.end && prior.status === event.status && prior.taskId === event.taskId, 'Conflicting same-occurrence copies'); continue; }
    seen.set(key, event);
    if (event.end <= start || event.start >= end || event.status === 'cancelled') continue;
    const task = event.taskId && tasks.get(event.taskId);
    if (task && (task.status !== 'needsAction' || task.ownerDismissed || task.manuallyMoved)) continue;
    if (task && (task.ownerDismissed === null || task.manuallyMoved === null || task.doDate !== null && task.doDate > input.day)) continue;
    if (event.taskId && !task) gaps.push('Calendar Task projection has no matching native completion evidence');
    events.push(event);
  }
  const obligations = [];
  need(list(input.obligations, 500), 'Bounded owed-reply review required');
  for (const item of input.obligations) {
    shape(item, ['threadId', 'label', 'owed', 'automated', 'ownerReplied', 'dismissed', 'optionalThanks', 'deadline', 'calendarCovered']);
    need(text(item.threadId) && text(item.label) && ['owed', 'automated', 'ownerReplied', 'dismissed', 'optionalThanks', 'calendarCovered'].every(key => typeof item[key] === 'boolean') && (item.deadline === null || stamp(item.deadline)), 'Explicit recent-context obligation evidence required');
    if (!item.automated && !item.ownerReplied && !item.dismissed && !item.optionalThanks && !input.policy.dismissedObligations.includes(item.threadId) && !input.policy.dismissedObligations.includes(item.label) && (item.owed || item.deadline && item.deadline >= input.asOf)) obligations.push(item);
  }
  const checks = assessBriefingReporting({ action: 'checks', asOf: input.asOf, results: input.checks });
  const checksTerminal = checks.readyForBriefing;
  const checkHistory = input.checkHistory ?? [];
  need(list(checkHistory, 100), 'Bounded exact check delivery history required');
  for (const row of checkHistory) {
    shape(row, ['kind', 'scheduledFor', 'snapshotDigest', 'bodyDigest', 'nativeId', 'room', 'receiptRef']);
    need(text(row.kind) && stamp(row.scheduledFor) && /^[a-f0-9]{64}$/.test(row.snapshotDigest) && /^[a-f0-9]{64}$/.test(row.bodyDigest) && text(row.nativeId) && row.room === input.policy.delivery.scope.resource && text(row.receiptRef), 'Exact prior check snapshot/message/readback binding required');
  }
  const expectedAttemptIds = new Set(checks.expected.flatMap(row => row.attempts.map(attempt => attempt.attemptId)));
  const additionalChecks = checks.retainedAttempts.filter(attempt => !expectedAttemptIds.has(attempt.attemptId)).map(attempt => ({ kind: attempt.kind, scheduledFor: attempt.scheduledFor, attempts: [attempt], state: attempt.state === 'pending' ? 'pending' : ['failed', 'blocked', 'pending-approval', 'unknown'].includes(attempt.execution) || attempt.state !== 'terminal' ? 'attention' : 'terminal', gaps: attempt.coverage !== 'complete' || attempt.availability !== 'available' || attempt.state !== 'terminal' ? ['retained-admitted-check-needs-attention'] : [] }));
  const visibleChecks = [...checks.expected, ...additionalChecks].filter(item => !item.attempts.length || item.attempts.some(attempt => attempt.state !== 'terminal' || !['completed', 'skipped'].includes(attempt.execution) || attempt.snapshotDigest === null || !checkHistory.some(prior => prior.kind === item.kind && prior.scheduledFor === item.scheduledFor && prior.snapshotDigest === attempt.snapshotDigest)));
  const reportChecks = visibleChecks.filter(item => item.kind !== 'lifecycle' || item.attempts.length || input.day === '2026-10-31');
  gaps.push(...visibleChecks.flatMap(item => item.gaps.map(gap => `${item.kind}: ${gap}`)));
  const learningChanges = [];
  if (input.learning) {
    shape(input.learning, ['history', 'entries']); need(list(input.learning.history, 1000) && list(input.learning.entries, 20), 'Bounded prior decisions and new learning entries required');
    const history = [...input.learning.history];
    for (const entry of input.learning.entries) { const assessed = assessBriefingLearning(input.policy, entry, history); if (assessed.status === 'append') { history.push(entry); learningChanges.push(entry); } }
  }
  const mailOutcomes = input.mailOutcomes ?? [];
  need(list(mailOutcomes) && unique(mailOutcomes.map(row => `${row.adapter}/${row.nativeId}`)), 'Bounded unique exact mail outcomes required');
  for (const outcome of mailOutcomes) { shape(outcome, ['adapter', 'nativeId', 'action', 'status']); need(judgments.some(row => row.adapter === outcome.adapter && row.nativeId === outcome.nativeId && row.classification.action === outcome.action) && ['verified', 'uncertain', 'known-unexecuted'].includes(outcome.status), 'Mail outcome must bind one reviewed exact action'); }
  const mailLine = judgment => { const review = input.mail.find(row => row.adapter === judgment.adapter).items.find(row => row.before.nativeId === judgment.nativeId); return `- ${clean(review.before.sender)}; ${clean(review.before.subject)}. ${mailOutcomes.find(row => row.adapter === judgment.adapter && row.nativeId === judgment.nativeId)?.status === 'verified' ? `${judgment.classification.action} verified` : `${judgment.classification.action} proposed` }. ${clean(judgment.classification.reason)}.${review.facts.length ? ` ${review.facts.map(clean).join('; ')}.` : ''}`; };
  const section = (title, rows) => `## ${title}\n\n${rows.length ? rows.join('\n') : 'None declared.'}`;
  const timed = events.filter(row => !row.allDay).sort((a, b) => a.start.localeCompare(b.start) || a.nativeId.localeCompare(b.nativeId)).map(row => `- ${row.start < start ? '00:00' : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(row.start))} ${clean(row.title)}`);
  const allDay = events.filter(row => row.allDay).sort((a, b) => a.title.localeCompare(b.title)).map(row => `- All day ${clean(row.title)}`);
  const taskRows = [...tasks.values()].filter(row => row.status === 'needsAction' && row.ownerDismissed === false && row.manuallyMoved === false && (row.deadline !== null || row.doDate === null || row.doDate <= input.day)).map(row => `- ${clean(row.title)}${row.doDate ? `. Study do-date ${row.doDate}` : ''}${row.deadline ? `. Deadline ${row.deadline}` : ''}`);
  const body = `# Daily briefing ${input.day}\n\n${section('Needs action/review', judgments.filter(row => row.classification.action === 'keep').map(mailLine))}\n\n${section('Owed replies and open deadlines', obligations.map(row => `- ${clean(row.label)}${row.deadline ? `. Deadline ${row.deadline}` : ''}.`))}\n\n${section('Trashed (recoverable)', judgments.filter(row => row.classification.action === 'trash').map(mailLine))}\n\n${section('Archived', judgments.filter(row => row.classification.action === 'archive').map(mailLine))}\n\n${section('Today', ['SGT', ...allDay, ...timed])}\n\n${section('Tasks', taskRows)}\n\n${section('Emmy checks', reportChecks.map(item => `- ${clean(item.kind)} (${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(item.scheduledFor))} SGT). ${clean(item.state)}.${item.attempts.length ? ' ' + item.attempts.map(attempt => clean(attempt.summary)).filter(Boolean).join(' ') : ''}`))}\n\n${section('Counts', [`- Reviewed ${messages} Inbox messages; ${conversations.size} conversations; ${contexts} expanded-context messages.`, `- Verified moves ${mailOutcomes.filter(row => row.status === 'verified').length}; uncertain ${mailOutcomes.filter(row => row.status === 'uncertain').length}. Remaining dispositions proposed. Delivery remains separate.`])}\n\n${section('Learning changes', learningChanges.map(entry => `- Proposed ${clean(entry.action)} for ${clean(entry.scope)}. Source ${clean(entry.authority.date)}; ${clean(entry.kind)}. Policy adoption remains separate.`))}\n\n${section('Evidence coverage', gaps.map(gap => `- ${clean(gap)}`))}\n`;
  need(Buffer.byteLength(body) <= 262144, 'Briefing body exceeds bound');
  return { contract: 'daily-briefing-v3', day: input.day, policyDigest: digest(input.policy), body, bodyDigest: digest(body), coverage: gaps.length ? 'partial' : 'complete-declared', gaps, checksTerminal, inputDigest: digest(input), judgments, counts: { messages, conversations: conversations.size, expandedContextMessages: contexts }, checks };
}
