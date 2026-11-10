import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { evaluateEligibility, evaluateLocalEvidence } from '../scripts/github-auto-merge.mjs';
import { createLocalProvider, deliverLocal } from '../scripts/local-delivery.mjs';
import { localSpecimen, localSnapshot } from '../verification/delivery/fixtures.mjs';
import { driveDelivery } from '../verification/delivery/drive.mjs';
import { canonical, digest } from '../src/content.mjs';

test('explicit local mode accepts zero hosted jobs and refuses missing or conflicting evidence', () => {
  assert.deepEqual(evaluateEligibility(localSnapshot()), { eligible: true, waiting: [] });
  const changes = [
    s => { s.mode = 'pretend-local'; }, s => { delete s.local; },
    s => { s.local.assurance.status = 'refused'; }, s => { s.local.assurance.clean = false; },
    s => { s.local.assurance.head = 'f'.repeat(40); }, s => { s.local.assurance.base = 'f'.repeat(40); },
    s => { s.local.assurance.tree = 'f'.repeat(40); }, s => { s.local.assurance.contextDigest = ''; },
    s => { s.local.review.reviewer = s.local.review.author; }, s => { s.local.review.practical = false; },
    s => { s.local.review.receiptDigest = 'f'.repeat(64); }, s => { s.local.review.verdict = 'self-certified'; },
    s => { s.local.review.acceptanceRef = ''; }, s => { s.local.authorization.actions = ['publish']; },
    s => { s.local.authorization.expiresAt = new Date(s.local.now).toISOString(); },
    s => { s.local.authorization.notBefore = '2099-01-01T00:00:00Z'; },
    s => { s.local.authorization.branch = 'codex/other'; }, s => { s.local.binding.head = 'f'.repeat(40); },
    s => { s.local.binding.base = 'f'.repeat(40); }, s => { s.branch.strict = false; },
    s => { s.branch.contexts.push('emmy-check'); }, s => { s.statuses[0].creatorType = 'Bot'; },
    s => { s.statuses[0].state = 'failure'; }, s => { s.statuses[1].creator = 'fake-owner'; },
  ];
  for (const change of changes) { const s = localSnapshot(); change(s); assert.equal(evaluateEligibility(s).eligible, false, String(change)); }
  const s = localSnapshot(); delete s.mode;
  assert.equal(evaluateEligibility(s).eligible, false, 'Local statuses never satisfy historical github-actions gate');
});

function fakeProvider() {
  const effects = []; const observed = new Set();
  return {
    effects, observed, deny: false, timeoutAfterEffect: false, failReadback: false, drift: false,
    async discover(action) {
      if (this.failReadback && effects.length) { this.failReadback = false; throw new Error('read timeout'); }
      return { exact: true, confirmed: observed.has(action), absent: !observed.has(action), number: 7 };
    },
    async destination() { return { exact: !this.drift }; },
    async mergeEligibility(b, local) { return evaluateEligibility(localSnapshot(local)); },
    async effect(action) {
      effects.push(action);
      if (this.deny) { const error = new Error('denied'); error.status = 403; throw error; }
      observed.add(action);
      if (this.timeoutAfterEffect) throw new Error('lost result after provider effect');
    },
  };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'emmy-delivery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const local = localSpecimen(); const provider = fakeProvider();
  const request = { schemaVersion: 1, mode: 'local', binding: local.binding, action: 'publish', title: 'Synthetic delivery', body: 'Provider fake only.' };
  const run = action => { request.action = action; return deliverLocal(root, structuredClone(request), provider, async () => ({ ...local, action })); };
  return { root, local, provider, request, run };
}

test('provider-fake publication, PR, status and merge converge without duplicate effects', async t => {
  const { run, provider } = await fixture(t);
  for (const [action, phase] of [['publish', 'published'], ['open-pr', 'pr-open'], ['attest', 'pr-open'], ['merge', 'merged']]) {
    assert.equal((await run(action)).outcome, phase);
    assert.equal((await run(action)).outcome, phase);
  }
  assert.deepEqual(provider.effects, ['publish', 'open-pr', 'attest', 'merge']);
});

test('denial stays uncertain across restart and never blindly retries', async t => {
  const { run, provider } = await fixture(t); provider.deny = true;
  const first = await run('publish'); assert.equal(first.outcome, 'unknown');
  provider.deny = false;
  const second = await run('publish'); assert.equal(second.outcome, 'unknown'); assert.equal(second.rediscoveredOnly, true);
  assert.deepEqual(provider.effects, ['publish']);
  const checkpoint = JSON.parse(await readFile(first.checkpoint));
  assert.equal(checkpoint.history.find(row => row.kind === 'effect-error').status, 403);
});

test('lost result and lost readback recover actual effect before any next action', async t => {
  const { run, provider } = await fixture(t); provider.timeoutAfterEffect = true; provider.failReadback = true;
  assert.equal((await run('publish')).outcome, 'unknown');
  const recovered = await run('open-pr'); assert.equal(recovered.outcome, 'published'); assert.equal(recovered.rediscoveredOnly, true);
  assert.deepEqual(provider.effects, ['publish']);
  assert.equal((await run('open-pr')).outcome, 'pr-open');
  assert.deepEqual(provider.effects, ['publish', 'open-pr']);
});

test('fresh evidence, current base and exact action grants gate every effect', async t => {
  const { run, provider, local } = await fixture(t);
  local.review.reviewer = local.review.author;
  assert.deepEqual((await run('publish')).waiting, ['localReview']); assert.equal(provider.effects.length, 0);
  local.review.reviewer = 'independent-task'; provider.drift = true;
  assert.deepEqual((await run('publish')).waiting, ['current-base-or-protection']); assert.equal(provider.effects.length, 0);
  assert.equal(evaluateLocalEvidence({ ...local, action: 'unknown' }).eligible, false);
});

test('changed source binding cannot discard retained uncertain intent', async t => {
  const { root, request, run, provider, local } = await fixture(t); provider.deny = true;
  await run('publish'); request.binding = { ...request.binding, head: 'f'.repeat(40) };
  await assert.rejects(deliverLocal(root, request, provider, async () => local), /different binding/);
  assert.deepEqual(provider.effects, ['publish']);
});

test('real adapter mutation demonstrates why unknown intent must force rediscovery', async t => {
  const sourceFile = fileURLToPath(new URL('../scripts/local-delivery.mjs', import.meta.url));
  const source = await readFile(sourceFile, 'utf8');
  const anchor = "if (state.delivery.phase === 'unknown') {";
  assert.equal(source.split(anchor).length, 2);
  const copied = source.replace(anchor, 'if (false) {').replace(/from '(\.{1,2}\/[^']+)'/g, (_, path) => `from '${pathToFileURL(resolve(dirname(sourceFile), path)).href}'`);
  const mutant = await import(`data:text/javascript;base64,${Buffer.from(copied).toString('base64')}`);
  const { root, request, provider, local, run } = await fixture(t); provider.deny = true;
  assert.equal((await run('publish')).outcome, 'unknown');
  assert.equal((await run('publish')).outcome, 'unknown'); assert.deepEqual(provider.effects, ['publish']);
  await mutant.deliverLocal(root, request, provider, async () => ({ ...local, action: 'publish' }));
  assert.deepEqual(provider.effects, ['publish', 'publish'], 'Removing actual rediscovery guard repeats a denied uncertain effect');
});

test('actual adapter keeps guarded branch push separate and merge uses exact head', async () => {
  const calls = []; const local = localSpecimen();
  const provider = createLocalProvider('synthetic-token', '/not-used', async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, json: async () => ({ merged: true, sha: 'f'.repeat(40) }) };
  });
  await provider.effect('open-pr', { binding: local.binding, title: 'Exact title', body: 'Exact body' }, {}, local);
  await provider.effect('merge', { binding: local.binding }, { number: 7 }, local);
  assert.deepEqual(calls[0].body, { title: 'Exact title', body: 'Exact body', head: local.binding.branch, base: 'main', draft: false });
  assert.deepEqual(calls[1].body, { sha: local.binding.head, merge_method: 'merge' });
  assert.equal(calls.some(call => /protection/.test(call.url)), false, 'Adapter has no protection mutation');
});

test('selected fresh absence resolution permits one exact authorized retry per action', async t => {
  for (const action of ['publish', 'open-pr', 'attest', 'merge']) {
    const { root, request, run, provider, local } = await fixture(t);
    for (const before of ['publish', 'open-pr', 'attest', 'merge']) { if (before === action) break; await run(before); }
    provider.deny = true; const denied = await run(action);
    const original = JSON.parse(await readFile(denied.checkpoint)); const pending = original.pending;
    const resolution = { decision: 'confirmed-absence', attemptId: pending.id, requestDigest: pending.requestDigest, payloadDigest: pending.payloadDigest, action, bindingDigest: original.bindingDigest, observedAt: new Date().toISOString(), sourceRef: 'synthetic-owner-resolution' };
    const select = async value => { const file = join(root, 'resolution.json'); const bytes = canonical(value); await writeFile(file, bytes); request.resolution = { file, sha256: digest(bytes) }; };
    local.authorization.actions.push('resolve-absence'); local.authorization.resolveAttemptId = pending.id; local.authorization.resolveRequestDigest = pending.requestDigest;
    const resolve = () => deliverLocal(root, request, provider, async () => ({ ...local, action }));
    for (const bad of [{ ...resolution, attemptId: 'wrong' }, { ...resolution, observedAt: '2000-01-01T00:00:00Z' }, { ...resolution, bindingDigest: 'f'.repeat(64) }]) {
      await select(bad); assert.equal((await resolve()).outcome, 'unknown');
    }
    await select(resolution); local.authorization.resolveAttemptId = 'wrong'; assert.equal((await resolve()).outcome, 'unknown'); local.authorization.resolveAttemptId = pending.id;
    assert.equal((await resolve()).outcome, 'retry-ready');
    assert.equal(provider.effects.filter(row => row === action).length, 1, 'Resolution performs no provider effect');
    delete request.resolution; provider.deny = false;
    await run(action); await run(action);
    assert.equal(provider.effects.filter(row => row === action).length, 2, 'Only one authorized retry occurs');
    const final = JSON.parse(await readFile(denied.checkpoint));
    assert.equal(final.history.filter(row => row.kind === 'intent' && row.action === action).length, 2);
    assert.equal(final.history.find(row => row.kind === 'intent' && row.action === action).id, pending.id);
  }
});

test('a denied authorized retry cannot authorize a third attempt', async t => {
  const { root, request, run, provider, local } = await fixture(t); provider.deny = true;
  const denied = await run('publish');
  const resolve = async () => {
    const state = JSON.parse(await readFile(denied.checkpoint)); const pending = state.pending;
    const resolution = { decision: 'confirmed-absence', attemptId: pending.id, requestDigest: pending.requestDigest, payloadDigest: pending.payloadDigest, action: 'publish', bindingDigest: state.bindingDigest, observedAt: new Date().toISOString(), sourceRef: 'synthetic-explicit-resolution' };
    const bytes = canonical(resolution); const file = join(root, 'retry-resolution.json'); await writeFile(file, bytes); request.resolution = { file, sha256: digest(bytes) };
    local.authorization.actions = ['publish', 'resolve-absence']; local.authorization.resolveAttemptId = pending.id; local.authorization.resolveRequestDigest = pending.requestDigest;
    return deliverLocal(root, request, provider, async () => ({ ...local, action: 'publish' }));
  };
  assert.equal((await resolve()).outcome, 'retry-ready'); delete request.resolution;
  assert.equal((await run('publish')).outcome, 'unknown');
  assert.equal((await resolve()).outcome, 'unknown'); assert.deepEqual(provider.effects, ['publish', 'publish']);
});

test('actual adapter source control refuses changed evidence before absence resolution advances', async t => {
  const { root, request, run, provider, local } = await fixture(t); provider.deny = true;
  request.review = { file: 'original-review.json', sha256: 'a'.repeat(64) };
  const denied = await run('publish'); const initial = JSON.parse(await readFile(denied.checkpoint)); const pending = initial.pending;
  const resolution = { decision: 'confirmed-absence', attemptId: pending.id, requestDigest: pending.requestDigest, payloadDigest: pending.payloadDigest, action: 'publish', bindingDigest: initial.bindingDigest, observedAt: new Date().toISOString(), sourceRef: 'synthetic-owner-resolution' };
  const file = join(root, 'resolution.json'); const bytes = canonical(resolution); await writeFile(file, bytes);
  request.resolution = { file, sha256: digest(bytes) }; request.review = { file: 'changed-review.json', sha256: 'b'.repeat(64) };
  local.authorization.actions = ['publish', 'resolve-absence']; local.authorization.resolveAttemptId = pending.id; local.authorization.resolveRequestDigest = pending.requestDigest;
  const acquire = async () => ({ ...local, action: 'publish' });
  const original = await deliverLocal(root, request, provider, acquire); const held = JSON.parse(await readFile(denied.checkpoint));
  assert.equal(original.outcome, 'unknown'); assert.deepEqual(held.pending, pending); assert.deepEqual(held.delivery.retryUsed, []);
  const sourceFile = fileURLToPath(new URL('../scripts/local-delivery.mjs', import.meta.url)); const source = await readFile(sourceFile, 'utf8');
  const anchor = 'scopeDigest(request) === state.pending?.scopeDigest && ';
  assert.equal(source.split(anchor).length, 2);
  const copied = source.replace(anchor, '').replace(/from '(\.{1,2}\/[^']+)'/g, (_, path) => `from '${pathToFileURL(resolve(dirname(sourceFile), path)).href}'`);
  const mutant = await import(`data:text/javascript;base64,${Buffer.from(copied).toString('base64')}`);
  const mutated = await mutant.deliverLocal(root, request, provider, acquire); const advanced = JSON.parse(await readFile(denied.checkpoint));
  assert.equal(mutated.outcome, 'retry-ready'); assert.deepEqual(advanced.delivery.retryUsed, ['publish']); assert.deepEqual(provider.effects, ['publish']);
  const evidence = join(process.cwd(), '.local/verification/delivery-adapter-scope'); await mkdir(evidence, { recursive: true }); const output = await mkdtemp(join(evidence, 'run-'));
  await writeFile(join(output, 'mutant.mjs'), copied); await writeFile(join(output, 'witness.json'), JSON.stringify({ status: 'intended-counterexample', original, held, mutated, advanced, providerEffects: provider.effects, intendedHarm: 'Changed evidence consumes original retry credit and clears uncertainty before original-scope comparison.' }, null, 2));
});

test('fresh CLI processes enforce actual receipts and recover provider-fake effects', async () => {
  const report = await driveDelivery();
  assert.equal(report.status, 'passed');
  assert.ok(report.commands.length >= 20);
  assert.ok(report.cases.includes('lost-result-rediscovered-on-restart'));
});
