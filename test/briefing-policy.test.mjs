import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBriefingMail, validateBriefingPolicy, assessBriefingLearning, validateDuplicateCaptures } from '../src/briefing-policy.mjs';
import { preparePolicyBriefing } from '../src/briefing-plan.mjs';
import { digest } from '../src/records.mjs';
import { policy, review, rule, plan, at } from './fixtures/briefing-policy.mjs';

test('current receipt correction overrides old Trash; different record purposes never imply duplicate', () => {
  const p = policy(); const r = review();
  r.context.billing = true; assert.equal(classifyBriefingMail(r, p).action, 'archive');
  for (const purpose of ['invoice', 'receipt']) { r.policyEvidence.recordPurpose = purpose; assert.equal(classifyBriefingMail(r, p).action, 'archive'); }
  const content = Buffer.from('same exact invoice PDF').toString('base64');
  r.policyEvidence.duplicate = { nativeId: 'copy-2', recordPurpose: 'invoice', contentSha256: digest(Buffer.from(content, 'base64')), copySha256: digest(Buffer.from(content, 'base64')), contentBase64: content, copyBase64: content, verified: true, sourceRef: 'exact-copy-proof', currentCaptureSha256:r.context.threadDigest, copyCaptureSha256:'b'.repeat(64), currentMessagePointer:'', copyMessagePointer:'', contentPointer:'/data', copyContentPointer:'/data' };
  assert.equal(classifyBriefingMail(r, p).action, 'archive');
  r.policyEvidence.recordPurpose = 'invoice'; assert.equal(classifyBriefingMail(r, p).action, 'trash');
  r.policyEvidence.duplicate.copyBase64 = Buffer.from('different').toString('base64'); assert.throws(() => classifyBriefingMail(r, p), /retained exact content/);
});
test('protected serious issues stay; scoped owner overrides apply; unbound exceptions never broaden', () => {
  const p = policy(); const r = review(); r.policyEvidence.recordPurpose = 'notice'; r.context.seriousSecurity = true;
  assert.equal(classifyBriefingMail(r, p).action, 'keep');
  r.context.category = 'paypal-nonreceipt'; assert.equal(classifyBriefingMail(r, p).action, 'keep'); r.context.seriousSecurity = false; assert.equal(classifyBriefingMail(r,p).action,'trash');
  r.policyEvidence.recordPurpose = 'receipt'; r.context.seriousSecurity = true; assert.equal(classifyBriefingMail(r,p).action,'keep'); r.context.seriousSecurity=false;
  r.policyEvidence.recordPurpose = 'notice'; r.context.category = 'blackboard-notification'; assert.equal(classifyBriefingMail(r, p).action, 'trash');
  r.before.nativeId = 'exact-1'; assert.equal(classifyBriefingMail(r, p).action, 'trash');
  r.before.nativeId = 'other'; r.context.seriousSecurity = false; r.context.category = 'reference'; r.policyEvidence.recordPurpose = 'statement'; assert.equal(classifyBriefingMail(r, p).action, 'keep');
  r.before.nativeId = 'reading-1'; r.adapter = 'outlook'; delete r.before.labels; r.before.folder = 'Inbox'; r.before.folderId = 'inbox-native'; assert.equal(classifyBriefingMail(r, p).action, 'keep');
});
test('OpenAI FYI scope never becomes unrelated-provider Trash; conflicting selectors fail closed', () => {
  const p = policy(); const r = review(); r.policyEvidence.recordPurpose = 'notice'; r.context.category = 'routine-account-fyi';
  assert.equal(classifyBriefingMail(r, p).action, 'archive');
  r.context.category = 'openai-routine-fyi'; assert.equal(classifyBriefingMail(r, p).action, 'trash');
  p.rules.push(rule('conflict', { category: 'openai-routine-fyi' }, 'archive')); assert.throws(() => classifyBriefingMail(r, p), /Conflicting category/);
  p.exceptions.push(rule('exact-conflict', { nativeId: 'exact-1' }, 'archive')); r.before.nativeId = 'exact-1'; assert.throws(() => classifyBriefingMail(r, p), /Conflicting exact/);
});
test('facts, safe unread inspection and original Inbox identity are mandatory', () => {
  const r = review(); const p = policy(); r.facts = []; assert.equal(classifyBriefingMail(r, p).action, 'keep');
  r.facts = ['Paid']; r.context.safeUnreadInspection = false; assert.equal(classifyBriefingMail(r, p).action, 'keep');
  r.context.safeUnreadInspection = true; r.before.labels = ['TRASH']; assert.equal(classifyBriefingMail(r, p).reason, 'already-outside-inbox');
  p.delivery.scope.service = 'slack'; assert.throws(() => validateBriefingPolicy(p), /ChatGPT/);
});
test('completed, cancelled, dismissed or moved native Tasks suppress exact projections only', () => {
  const input = plan();
  for (const [index, status] of ['completed', 'cancelled', 'needsAction', 'needsAction'].entries()) {
    input.tasks.items.push({ nativeId: `t${index}`, listId: 'tasks-1', title: `Study ${index}`, status, ownerDismissed: index === 2, manuallyMoved: index === 3, doDate: null, deadline: null });
    input.calendar.items.push({ nativeId: `e${index}`, calendarId: 'calendar-1', iCalUID: `uid${index}`, start: '2026-11-03T02:00:00.000Z', end: '2026-11-03T03:00:00.000Z', allDay: false, title: `Study ${index}`, status: 'confirmed', taskId: `t${index}` });
  }
  input.calendar.items.push({ ...input.calendar.items[0], nativeId: 'actual-event', iCalUID: 'independent-uid', taskId: null, title: 'Independent same-title event' });
  const result = preparePolicyBriefing(input); assert.ok(!result.body.includes('Study 0')); assert.ok(!result.body.includes('Study 1')); assert.ok(!result.body.includes('Study 2')); assert.ok(!result.body.includes('Study 3')); assert.ok(result.body.includes('Independent same-title event'));
});
test('calendar uses occurrence identity and midnight overlap; original gaps and counts persist', () => {
  const input = plan(); const event = { nativeId: 'event-1', calendarId: 'calendar-1', iCalUID: 'uid', start: '2026-11-02T15:00:00.000Z', end: '2026-11-02T17:00:00.000Z', allDay: false, title: 'Overnight event', status: 'confirmed', taskId: null };
  input.calendar.items.push(event, { ...event, nativeId: 'copy' });
  input.mail[0].inboxIds.push('omitted'); input.calendar.resourceIds.push('unread-calendar');
  const result = preparePolicyBriefing(input); assert.equal(result.body.match(/00:00 Overnight event/g).length, 1); assert.equal(result.counts.messages, 1); assert.equal(result.counts.expandedContextMessages, 2); assert.ok(result.gaps.some(gap => gap.includes('unreviewed'))); assert.ok(result.gaps.some(gap => gap.includes('resources missing')));
  input.mail[1].environment = 'connected-mac'; assert.throws(() => preparePolicyBriefing(input), /cloud UI/);
});
test('learning excludes own moves, label-only claims and serious financial broadening', () => {
  const p = policy(); const entry = { id: 'learning-1', kind: 'observed-preference', risk: 'low-risk', authority: p.authority, scope: 'routine-marketing', action: 'trash', observations: ['emmy', 'owner'].map((actor,index)=>({actor,actorVerified:index===0,labelOnly:false,sourceRef:'source-'+index,sourceDigest:'a'.repeat(64),account:'primary',nativeId:'mail-'+index,observedAt:at,scope:'routine-marketing',action:'trash'})), counterexamples: [] };
  assert.equal(assessBriefingLearning(p, entry).status, 'held');
  entry.observations = ['a', 'b'].map(sourceRef => ({ actor: 'owner', actorVerified: true, labelOnly: false, sourceRef,sourceDigest:'a'.repeat(64),account:'primary',nativeId:sourceRef,observedAt:at,scope:'routine-marketing',action:'trash' })); assert.equal(assessBriefingLearning(p, entry).status, 'append');
  entry.scope = 'financial'; assert.equal(assessBriefingLearning(p, entry).status, 'held');
  entry.kind = 'owner-correction'; assert.equal(assessBriefingLearning(p, entry).status, 'append');
  assert.throws(() => assessBriefingLearning(p, { ...entry, action: 'keep' }, [entry]), /Conflicting decision/);
});
test('sensitive codes and personalized account links cannot enter final human body', () => {
  const input = plan(); input.mail[0].items[0].facts = ['Login code 123456; https://example.test/unsubscribe?token=secret'];
  assert.throws(() => preparePolicyBriefing(input), /Private codes/);
});
test('same-action rule safety conflicts and Seerr category without exact self subject refuse', () => {
  const p = policy(); const r = review(); r.policyEvidence.recordPurpose = 'notice'; r.context.category = 'openai-routine-fyi'; r.facts = [];
  p.rules.push({ ...p.rules.at(-1), id: 'conflict-facts', requiresFacts: false }); assert.throws(() => classifyBriefingMail(r, p), /Conflicting category/);
  p.rules = [rule('seerr-available', { category: 'verified-self-seerr-available' })]; r.context.category = 'verified-self-seerr-available'; r.facts = ['Available'];
  assert.throws(() => classifyBriefingMail(r, p), /actual self-sender/);
  r.before.sender = p.accounts.gmail.account; r.before.subject = '[Seerr] Example Request Now Available'; assert.equal(classifyBriefingMail(r, p).action, 'trash');
});
test('duplicate bytes must extract from exact retained current and copy native captures', () => {
  const r = review(); const encoded = Buffer.from('actual PDF bytes').toString('base64');
  const raw = Buffer.from(JSON.stringify({ id: r.before.nativeId, attachment: { data: encoded } })); const copyRaw = Buffer.from(JSON.stringify({ id: 'copy-2', attachment: { data: encoded } }));
  r.context.threadDigest = digest(raw); r.policyEvidence.duplicate = { nativeId: 'copy-2', recordPurpose: 'invoice', contentSha256: digest(Buffer.from(encoded, 'base64')), copySha256: digest(Buffer.from(encoded, 'base64')), contentBase64: encoded, copyBase64: encoded, verified: true, sourceRef: 'copy-proof', currentCaptureSha256: digest(raw), copyCaptureSha256: digest(copyRaw), currentMessagePointer: '', copyMessagePointer: '', contentPointer: '/attachment/data', copyContentPointer: '/attachment/data' };
  assert.equal(validateDuplicateCaptures(r, raw, copyRaw), true);
  const wrong = Buffer.from(JSON.stringify({ id: 'different-id', attachment: { data: encoded } })); r.policyEvidence.duplicate.copyCaptureSha256 = digest(wrong); assert.throws(() => validateDuplicateCaptures(r, raw, wrong), /identity/);
});
test('checks retain useful summaries, suppress exactly delivered unchanged snapshots and never repeat lifecycle as daily due', () => {
  const input = plan(); input.checks = [{ kind: 'suggestions', scheduledFor: '2026-11-02T20:30:00.000Z', attemptId: 'attempt', requestId: 'request', state: 'terminal', execution: 'completed', coverage: 'complete', availability: 'available', sourceEnd: '2026-11-02T16:00:00.000Z', observedAt: input.asOf, recordedAt: input.asOf, snapshotDigest: 'a'.repeat(64), summary: 'New useful efficiency suggestion.' }];
  let result = preparePolicyBriefing(input); assert.ok(result.body.includes('New useful efficiency suggestion.')); assert.ok(!result.body.includes('lifecycle'));
  input.checkHistory = [{ kind: 'suggestions', scheduledFor: input.checks[0].scheduledFor, snapshotDigest: 'a'.repeat(64), bodyDigest: 'b'.repeat(64), nativeId: 'prior-message', room: input.policy.delivery.scope.resource, receiptRef: 'prior-exact-readback' }];
  result = preparePolicyBriefing(input); assert.ok(!result.body.includes('New useful efficiency suggestion.'));
  input.checks[0].execution = 'failed'; input.checks[0].summary = 'New concrete failure.'; assert.ok(preparePolicyBriefing(input).body.includes('New concrete failure.'));
});
test('common code subjects refuse; Blackboard personal instructor mail stays; observed KEEP cannot learn Trash', () => {
  for(const subject of ['Your verification code is 123456','123456 is your verification code','OTP AB12CD']) { const input=plan(); input.mail[0].items[0].before.subject=subject; assert.throws(()=>preparePolicyBriefing(input),/Private codes/); }
  const r=review(); r.policyEvidence.recordPurpose='notice'; r.context.category='blackboard-notification'; r.context.personal=true; assert.equal(classifyBriefingMail(r,policy()).action,'keep');
  const p=policy(); const entry={id:'learning-disposition',kind:'observed-preference',risk:'low-risk',authority:p.authority,scope:'routine-marketing',action:'trash',observations:['a','b'].map(nativeId=>({actor:'owner',actorVerified:true,labelOnly:false,sourceRef:nativeId,sourceDigest:'a'.repeat(64),account:'primary',nativeId,observedAt:at,scope:'routine-marketing',action:'keep'})),counterexamples:[]}; assert.equal(assessBriefingLearning(p,entry).status,'held');
  const input=plan(); input.learning={history:[],entries:[{...entry,kind:'owner-correction',observations:[]}]}; assert.ok(preparePolicyBriefing(input).body.includes('Proposed trash for routine-marketing'));
});
test('a newly terminal older admitted failure remains in same briefing after nominal rollover',()=>{
 const input=plan(); input.checks=[{kind:'maintenance',scheduledFor:'2026-11-01T19:15:00.000Z',attemptId:'old-attempt',requestId:'same-admitted-request',state:'terminal',execution:'failed',coverage:'partial',availability:'available',sourceEnd:'2026-11-01T16:00:00.000Z',observedAt:'2026-11-02T23:59:00.000Z',recordedAt:'2026-11-02T23:59:00.000Z',snapshotDigest:'c'.repeat(64),summary:'Concrete older admitted request terminal failure.'}]; const result=preparePolicyBriefing(input); assert.ok(result.body.includes('Concrete older admitted request terminal failure.')); assert.equal(result.checks.retainedAttempts[0].scheduledFor,input.checks[0].scheduledFor);
});

test('Task do-dates respect briefing day while deadlines remain separate context', () => {
  const input = plan();
  const task = { nativeId: 'task', listId: 'tasks-1', title: 'Future study', status: 'needsAction', ownerDismissed: false, manuallyMoved: false, doDate: '2026-11-05', deadline: null };
  input.tasks.items = [task];
  assert.doesNotMatch(preparePolicyBriefing(input).body, /Future study/);
  for (const doDate of ['2026-11-02', '2026-11-03', null]) {
    task.doDate = doDate; assert.match(preparePolicyBriefing(input).body, /Future study/);
  }
  task.doDate = '2026-11-05'; task.deadline = '2026-11-06T01:00:00.000Z';
  const result = preparePolicyBriefing(input);
  assert.match(result.body, /Future study.*Study do-date 2026-11-05.*Deadline 2026-11-06/);
});
test('every mail safety flag needs a boolean and exact thread/snapshot attribution', () => {
  const original = review();
  for (const key of Object.keys(original.context).filter(key => typeof original.context[key] === 'boolean')) {
    for (const value of ['false', 'true', 0, 1, null, undefined, [], {}]) {
      const r = review(); r.context[key] = value;
      assert.throws(() => classifyBriefingMail(r, policy()), /mail context/, `${key} ${JSON.stringify(value)}`);
    }
    const r = review(); delete r.context[key];
    assert.throws(() => classifyBriefingMail(r, policy()), /mail context/, key);
  }
  for (const key of ['complete', 'safeUnreadInspection']) {
    const input = plan(); input.mail[0].items[0].context[key] = false;
    const result = preparePolicyBriefing(input);
    assert.equal(result.judgments[0].classification.action, 'keep');
    assert.ok(result.gaps.some(gap => gap.includes('context/read-state')));
  }
  const r = review(); r.before.unread = 'false'; assert.throws(() => classifyBriefingMail(r, policy()), /mail snapshot/);
  r.before.unread = true; r.context.threadDigest = null; assert.throws(() => classifyBriefingMail(r, policy()), /mail context/);
});
test('unknown Task overlays remain unknown with explicit partial coverage', () => {
  const input = plan();
  input.tasks.items = [{ nativeId: 'unknown-task', listId: 'tasks-1', title: 'Uncertain study', status: 'needsAction', ownerDismissed: null, manuallyMoved: null, doDate: input.day, deadline: null }];
  input.calendar.items = [{ nativeId: 'projection', calendarId: 'calendar-1', iCalUID: null, start: '2026-11-03T01:00:00.000Z', end: '2026-11-03T02:00:00.000Z', allDay: false, title: 'Uncertain study', status: 'confirmed', taskId: 'unknown-task' }];
  const result = preparePolicyBriefing(input);
  assert.equal(result.coverage, 'partial'); assert.ok(result.gaps.includes('Task dismissal or move status unknown'));
  assert.doesNotMatch(result.body, /Uncertain study/);
  assert.equal(input.tasks.items[0].ownerDismissed, null); assert.equal(input.tasks.items[0].manuallyMoved, null);
  for (const key of ['ownerDismissed', 'manuallyMoved']) {
    const bad = structuredClone(input); bad.tasks.items[0][key] = 'false';
    assert.throws(() => preparePolicyBriefing(bad), /Task status/);
  }
});
test('unavailable source clocks cannot carry purported acquired items', () => {
  const input = plan(); input.mail[0].observedAt = null; input.mail[0].capturedAt = null;
  input.mail[0].complete = false; input.mail[0].paginationComplete = false;
  assert.throws(() => preparePolicyBriefing(input), /Unavailable source/);
});
