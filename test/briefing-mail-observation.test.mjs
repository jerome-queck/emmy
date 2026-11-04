import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { executeBriefing } from '../src/briefing-core.mjs';
import { preparePolicyBriefing } from '../src/briefing-plan.mjs';
import { classifyBriefingMail } from '../src/briefing-policy.mjs';
import { buildFoundation, materializeFoundation } from '../src/foundation-release.mjs';
import { plan, at } from './fixtures/briefing-policy.mjs';
import { morningFixture, morningItem, morningAssessments } from '../verification/morning-fixtures.mjs';
import { morningV3Open, morningV3Plan } from '../verification/morning-v3-fixtures.mjs';

function observationPlan() {
  const input = plan(); input.schemaVersion = 1;
  Object.assign(input.mail[0], { observedAt: null, capturedAt: null, collectorObservation: { schemaVersion: 1, basis: 'original-read-start', startedAt: '2026-11-02T23:59:00.000Z', endedAt: '2026-11-02T23:59:30.000Z' } });
  input.mail[0].items[0].context.personal = null;
  return input;
}
const preview = input => executeBriefing({ action: 'preview', input }, { now: at });

test('versioned preview retains facts, original nulls, items and inventory independently of pagination', () => {
  for (const complete of [true, false]) for (const paginationComplete of [true, false]) {
    const input = observationPlan(); Object.assign(input.mail[0], { complete, paginationComplete }); input.mail[0].inboxIds.push('unreviewed');
    const original = structuredClone(input); const report = preview(input);
    assert.deepEqual(input, original); assert.deepEqual(report.mailSources, original.mail);
    assert.equal(report.contract, 'daily-briefing-mail-observation-v1'); assert.equal(report.coverage, 'partial');
    assert.equal(report.effectsAuthorized, false); assert.equal(report.sendAuthorized, false);
    assert.ok(report.judgments.every(row => row.classification.action === 'defer'));
    assert.match(report.body, /Example merchant, SGD 24\.42/); assert.match(report.body, /1 Inbox messages unreviewed/);
    assert.ok(report.gaps.includes('gmail provider snapshot clocks unknown; original collector read observation only'));
    assert.equal(report.gaps.includes('gmail acquisition incomplete'), !complete || !paginationComplete);
    assert.match(report.body, /All dispositions and send deferred/); assert.doesNotMatch(report.body, /Remaining dispositions proposed/);
    assert.doesNotMatch(report.body, /archive proposed|trash proposed|archive verified|trash verified/);
  }
});

test('original read bounds reject invalid, future, reversed, missing, forged clocks and wrong versions', () => {
  const changes = [
    source => { delete source.collectorObservation; },
    source => { source.observedAt = at; }, source => { source.capturedAt = at; },
    source => { source.collectorObservation = null; },
    ...['startedAt', 'endedAt'].flatMap(key => [null, 42, 'invalid', '2026-11-02T23:59:00Z', '2026-11-03T00:00:00.001Z'].map(value => source => { source.collectorObservation[key] = value; })),
    source => { source.collectorObservation.startedAt = at; },
    source => { source.collectorObservation.schemaVersion = 2; },
    source => { source.collectorObservation.basis = 'current-read-start'; },
    source => { source.collectorObservation.extra = true; },
  ];
  for (const change of changes) { const input = observationPlan(); change(input.mail[0]); assert.throws(() => preview(input)); }
  const input = observationPlan(); input.schemaVersion = 3; assert.throws(() => preview(input), /version/);
  const future = observationPlan(); future.asOf = '2026-11-03T00:00:00.001Z'; assert.throws(() => preview(future), /future/);
});

test('observation age uses original start, never replay or last read end', () => {
  for (const [startedAt, stale] of [['2026-11-02T23:55:00.000Z', false], ['2026-11-02T23:54:59.999Z', true]]) {
    const input = observationPlan(); input.mail[0].collectorObservation.startedAt = startedAt;
    assert.equal(preview(input).gaps.includes('gmail collector observation stale'), stale);
  }
});

test('every unknown flag remains null, all known/unknown/incomplete classifications defer', () => {
  const keys = Object.keys(plan().mail[0].items[0].context).filter(key => key !== 'threadDigest');
  for (const key of keys) {
    const input = observationPlan(); const review = input.mail[0].items[0]; review.context.personal = false; review.context[key] = null;
    const report = preview(input);
    assert.equal(report.mailSources[0].items[0].context[key], null);
    assert.equal(report.judgments[0].classification.reason, 'unknown-mail-classification');
    assert.equal(report.judgments[0].classification.action, 'defer');
    assert.throws(() => classifyBriefingMail(review, input.policy), /mail context/);
    for (const value of (key === 'category' ? [undefined, 0] : [undefined, 'false', 0])) { review.context[key] = value; assert.throws(() => preview(input)); }
  }
  for (const key of ['complete', 'safeUnreadInspection']) {
    const input = observationPlan(); input.mail[0].items[0].context.personal = false; input.mail[0].items[0].context[key] = false;
    assert.equal(preview(input).judgments[0].classification.reason, 'incomplete-or-unsafe-thread-inspection');
  }
  const known = observationPlan(); known.mail[0].items[0].context.personal = false;
  assert.equal(classifyBriefingMail(known.mail[0].items[0], known.policy).action, 'archive');
  assert.equal(preview(known).judgments[0].classification.action, 'defer');
  known.mail[0].items[0].before.nativeId = 'exact-1'; known.mail[0].inboxIds = ['exact-1'];
  assert.equal(classifyBriefingMail(known.mail[0].items[0], known.policy).action, 'trash');
  assert.equal(preview(known).judgments[0].classification.action, 'defer');
});

test('unknown read state displays honestly; changed context/read state changes exact review binding', () => {
  const input = observationPlan(); const first = preview(input);
  input.mail[0].items[0].before.unread = null;
  assert.equal(preview(input).mailSources[0].items[0].before.unread, null);
  assert.throws(() => classifyBriefingMail(input.mail[0].items[0], input.policy), /mail snapshot/);
  input.mail[0].items[0].before.unread = false;
  const changedRead = preview(input); assert.notEqual(first.judgments[0].reviewDigest, changedRead.judgments[0].reviewDigest);
  input.mail[0].items[0].context.threadDigest = 'b'.repeat(64);
  assert.notEqual(changedRead.judgments[0].reviewDigest, preview(input).judgments[0].reviewDigest);
  input.mail[0].items[0].context.threadDigest = null; assert.throws(() => preview(input), /thread attribution/);
});

test('preview cannot be laundered into strict preparation, journal seal, or declared effects', () => {
  const input = observationPlan(); assert.throws(() => preparePolicyBriefing(input), /version/);
  input.schemaVersion = 3; assert.throws(() => preparePolicyBriefing(input), /Plan members/);
  for (const field of ['mailOutcomes', 'learning']) {
    const draft = observationPlan(); draft[field] = field === 'mailOutcomes' ? [{ adapter: 'gmail', nativeId: 'message-1', action: 'trash', status: 'verified' }] : { history: [], entries: [] };
    assert.throws(() => preview(draft), /cannot carry/);
  }
  const fixture = morningFixture({ open: morningV3Open }); fixture.command('review', { items: [morningItem(), morningItem('outlook')] });
  const packet = morningV3Plan(fixture.run); packet.input.schemaVersion = 1;
  Object.assign(packet.input.mail[0], { observedAt: null, capturedAt: null, collectorObservation: { schemaVersion: 1, basis: 'original-read-start', startedAt: packet.input.asOf, endedAt: packet.input.asOf } });
  packet.result = executeBriefing({ action: 'preview', input: packet.input }, { now: packet.input.asOf });
  assert.throws(() => fixture.command('seal', { ...morningAssessments(), deterministic: packet }), /version/);
  assert.equal(fixture.run.sealed, null); assert.ok(fixture.run.items.every(item => item.attempts.length === 0));
});

test('fresh real CLI and materialized portable source produce exact same read-only preview', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'mail-observation-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const request = { action: 'preview', input: observationPlan() }; const file = join(directory, 'request.json'); await writeFile(file, JSON.stringify(request));
  const cli = spawnSync(process.execPath, [resolve('scripts/agent.mjs'), 'daily-briefing', '--file', file], { encoding: 'utf8' });
  assert.equal(cli.status, 3, cli.stdout + cli.stderr); assert.deepEqual(JSON.parse(cli.stdout).data, preview(request.input));
  const source = join(directory, 'source'); await mkdir(source); await cp(resolve('src'), join(source, 'src'), { recursive: true });
  const git = args => execFileSync('git', ['-C', source, ...args], { stdio: 'pipe' }).toString().trim();
  git(['init']); git(['add', 'src']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic source fixture']);
  const release = buildFoundation(source, git(['rev-parse', 'HEAD']), { portableOnly: true }); const pure = join(directory, 'pure'); await materializeFoundation(release, pure, 'pure');
  const code = `import {readFileSync} from 'node:fs'; import {executeBriefing} from ${JSON.stringify(pathToFileURL(join(pure, release.entries.pure)).href)}; console.log(JSON.stringify(executeBriefing(JSON.parse(readFileSync(process.argv[1])),{now:process.argv[2]})));`;
  const portable = execFileSync(process.execPath, ['--input-type=module', '-e', code, file, at]);
  assert.deepEqual(JSON.parse(portable), preview(request.input));
  assert.ok(release.portable.pure.includes('src/briefing-observation.mjs'));
});
