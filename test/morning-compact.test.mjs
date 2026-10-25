import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBriefingDraft, renderBriefing } from '../src/briefing.mjs';
import { digest } from '../src/records.mjs';
import { morningFixture, morningItem, morningAt, refreshMorning } from '../verification/morning-fixtures.mjs';
import { compactAssessments } from '../verification/morning-compact-fixtures.mjs';
const setup = () => { const f = morningFixture({ cleanupMode: 'batched-v1' }); const item = morningItem(); item.context.orderReceipt = true; item.facts = ['Order ABC-123 is ready for collection on the saved date.']; f.command('review', { items: [item, morningItem('outlook')] }); return f; };
const send = f => { const value = { sendRef: 'compact-send', bodyDigest: f.run.sealed.bodyDigest }; f.command('send-intent', value); f.command('send-ack', { ...value, nativeId: 'compact-original-message', readbackRef: 'compact-native-readback', deliveredBodyDigest: value.bodyDigest }); };
test('compact seal on the same open run removes diagnostic machinery while retaining exact facts and private audit', () => {
  const f = setup(); const specification = f.run.specification; f.command('seal', compactAssessments()); const { body, diagnostic } = f.run.sealed;
  assert.equal(f.run.specification, specification); assert.equal(f.state.morningRuns.length, 1); assert.equal(f.run.sealed.presentation, 'compact-v1');
  assert.doesNotMatch(body, /^\s*(?:#{1,6}\s|```|\|)/m); assert.doesNotMatch(body, /gmail-one|outlook-one|gmail-thread|opaque-source|private-native/);
  for (const item of f.run.items) { assert.ok(body.includes(item.before.sender)); assert.ok(body.includes(item.before.subject)); for (const fact of item.facts) assert.ok(body.includes(fact)); }
  assert.match(body, /archive proposed; not yet verified/); assert.match(body, /Required quiz; completed, reported/); assert.match(body, /Research seminar; cancelled, reported/);
  assert.match(diagnostic.body, /## Mail review/); assert.match(diagnostic.body, /gmail\\-one/); assert.equal(diagnostic.bodyDigest, digest(diagnostic.body)); assert.ok(diagnostic.assessment.sources.length > 0);
  assert.equal(f.run.sealed.bodyDigest, digest(body)); send(f); assert.equal(f.run.delivery.bodyDigest, digest(body));
});
test('compact grouped coverage preserves material gaps, distinct omitted items and global versus selected ranges', () => {
  const f = setup(); f.run.sources[0].capture.messageIds.push('private-unreviewed-A', 'private-unreviewed-B'); f.run.sources[2].capture.resourceIds.push('private-calendar-A');
  f.command('seal', compactAssessments()); send(f); const batch = refreshMorning(f); f.command('summary', {}, batch.at); const body = f.run.summary.body;
  assert.match(body, /unreviewed Gmail message 1/); assert.match(body, /unreviewed Gmail message 2/); assert.match(body, /calendar 2/); assert.doesNotMatch(body, /private-unreviewed|private-calendar/);
  assert.match(body, /global reads .*09:00/); assert.match(body, /selected-message reads .*09:06/); assert.match(body, /not whole-source coverage/); assert.match(body, /historical assessment/);
  assert.equal((body.match(/Coverage Gmail:/g) ?? []).length, 1); assert.ok(f.run.summary.diagnostic.body.includes('Global')); assert.equal(f.run.summary.presentation, 'compact-v1');
});
test('compact summary distinguishes corrections, uncertain effects and verified outcomes without a resend', () => {
  const f = setup(); f.command('correct', { adapter: 'outlook', nativeId: 'outlook-one', disposition: 'dismissed', sourceRef: 'owner', reason: 'Already handled.' }); f.command('seal', compactAssessments()); send(f);
  const item = f.run.items[0]; f.command('action-intent', { adapter: 'gmail', nativeId: item.before.nativeId, action: 'archive', before: item.before, receipt: item.receipt, destination: null }); f.command('summary'); assert.match(f.run.summary.body, /archive outcome unknown; held/); assert.match(f.run.summary.body, /dismissed; no cleanup owed/);
  const attempt = f.run.items[0].attempts[0]; f.command('action-result', { adapter: 'gmail', nativeId: item.before.nativeId, intentDigest: attempt.intentDigest, receipt: item.receipt, after: { ...item.before, labels: ['UNREAD', 'STARRED'] }, outcome: 'verified' }); f.command('summary'); assert.match(f.run.summary.body, /archive verified; unread preserved/); assert.equal(f.run.delivery.nativeId, 'compact-original-message');
});
test('compact presentation refuses relabelled caller prose and unknown selectors', () => {
  const f = setup(); const input = compactAssessments(); input.briefing.result.body = 'Invented current all-clear'; input.briefing.result.bodyDigest = digest(input.briefing.result.body); input.briefing.assessment.bodyDigest = input.briefing.result.bodyDigest;
  assert.throws(() => f.command('seal', input), /exact existing assessed/); assert.throws(() => f.command('seal', { ...compactAssessments(), presentation: 'compact-v99' }), /Unknown morning presentation/);
});
test('compact unknown decisions precede cancellation and keep material qualifications', () => {
  const f = setup(); const input = compactAssessments(); const source = input.briefing.input.sources[2]; source.availability = 'unavailable'; source.coverage = { complete: false, gaps: [] }; source.contentAt = '2026-10-23T01:00:00.000Z';
  input.briefing.inputReceipt.sha256 = digest(JSON.stringify(input.briefing.input)); input.briefing.assessment.inputDigest = input.briefing.inputReceipt.sha256; const assessment = assessBriefingDraft(input.briefing.input, input.briefing.result.guidance, morningAt); input.briefing.result.body = renderBriefing(assessment); input.briefing.result.bodyDigest = digest(input.briefing.result.body); input.briefing.assessment.bodyDigest = input.briefing.result.bodyDigest; input.briefing.result.status = assessment.status; input.briefing.assessment.status = assessment.status;
  f.command('seal', input); assert.match(f.run.sealed.body, /Research seminar; historical assessment; current state unknown/); assert.match(f.run.sealed.body, /source unavailable/); assert.match(f.run.sealed.body, /partial source coverage/); assert.match(f.run.sealed.body, /historical content/); assert.doesNotMatch(f.run.sealed.body, /Research seminar; .*cancelled, reported/);
});
test('compact holds unsafe exact facts and explicit private labels without changing useful references or words', () => {
  const f = setup(); f.run.items[0].facts = ['Internal reference gmail-one must not leak.']; assert.throws(() => f.command('seal', compactAssessments()), /held.*internal identifier/);
  const control = setup(); control.run.items[0].facts = ['A useful fact\u2028```danger']; assert.throws(() => control.command('seal', compactAssessments()), /line control/);
  const short = compactAssessments(); short.briefing.input.sources[0].id = 'a'; short.briefing.input.entries[0].sourceIds = ['a']; short.briefing.input.entries[0].label = 'Read algebra'; short.briefing.input.coverage.otherSourcesRead[0] = 'a'; short.briefing.inputReceipt.sha256 = digest(JSON.stringify(short.briefing.input)); short.briefing.assessment.inputDigest = short.briefing.inputReceipt.sha256; const assessed = assessBriefingDraft(short.briefing.input, short.briefing.result.guidance, morningAt); short.briefing.result.body = renderBriefing(assessed); short.briefing.result.bodyDigest = digest(short.briefing.result.body); short.briefing.assessment.bodyDigest = short.briefing.result.bodyDigest;
  const safe = setup(); safe.command('seal', short); assert.ok(safe.run.sealed.body.includes('Read algebra')); assert.ok(safe.run.sealed.body.includes('Order ABC-123'));
});
test('compact keep explains declared action, ambiguity and unread constraints without inventing advice', () => {
  const f = morningFixture(); const item = morningItem(); item.context.actionRequired = true; item.context.ambiguous = true; item.context.safeUnreadInspection = false; f.command('review', { items: [item, morningItem('outlook')] }); f.command('seal', compactAssessments()); assert.match(f.run.sealed.body, /keep; unread-preserving inspection unavailable, action required, ambiguous/); assert.doesNotMatch(f.run.sealed.body, /safeUnreadInspection|actionRequired/);
});

test('compact deduplicates repeated gaps while retaining unknown material gaps and exact original assessment times', () => {
  const f = setup(); const input = compactAssessments(); input.briefing.input.coverage.gaps = ['Unknown provider restriction remains unresolved.', 'Only the primary calendar was accessible.']; input.briefing.inputReceipt.sha256 = digest(JSON.stringify(input.briefing.input)); input.briefing.assessment.inputDigest = input.briefing.inputReceipt.sha256; const assessed = assessBriefingDraft(input.briefing.input, input.briefing.result.guidance, morningAt); input.briefing.result.body = renderBriefing(assessed); input.briefing.result.bodyDigest = digest(input.briefing.result.body); input.briefing.assessment.bodyDigest = input.briefing.result.bodyDigest;
  f.command('seal', input); const original = f.run.sealed; assert.match(original.body, /Unknown provider restriction remains unresolved/); assert.match(original.body, /Only the primary calendar was accessible/); assert.equal(original.diagnostic.assessment.checkedAt, morningAt);
  send(f); refreshMorning(f); f.run.cleanup.globalGaps.push('Initial delivered coverage gap. gmail stale source', 'gmail stale source'); f.command('summary', {}, '2026-10-25T01:06:00.001Z'); assert.equal((f.run.summary.body.match(/Gmail stale source/g) ?? []).length, 1); assert.equal(f.run.sealed.diagnostic.assessment.checkedAt, morningAt);
});
