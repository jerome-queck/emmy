import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MERGE_POLICY, considerPullRequest, createGitHub, evaluateEligibility, main,
  normalizeSnapshot, selectCandidates,
} from '../scripts/github-auto-merge.mjs';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const other = 'c'.repeat(40);

function snapshot() {
  return {
    repository: { name: MERGE_POLICY.repository },
    pr: {
      number: 7, state: 'open', draft: false, merged: false,
      headRepository: MERGE_POLICY.repository, headSha: head,
      baseRepository: MERGE_POLICY.repository, baseRef: 'main', baseSha: base,
    },
    expectedHead: head, expectedBase: base,
    branch: {
      name: 'main', sha: base, protected: true, enforcement: 'everyone',
      contexts: [MERGE_POLICY.ci, MERGE_POLICY.review],
    },
    checks: [{ id: 10, name: MERGE_POLICY.ci, sha: head, status: 'completed', conclusion: 'success', app: 'github-actions' }],
    statuses: [{
      id: 20, context: MERGE_POLICY.review, sha: head, state: 'success',
      creator: MERGE_POLICY.reviewer, creatorType: 'User',
    }],
  };
}

test('eligible requires every identity, revision, CI and independent-review gate', () => {
  assert.deepEqual(evaluateEligibility(snapshot()), { eligible: true, waiting: [] });
  const cases = [
    ['repository', s => { s.repository.name = 'unrelated/emmy'; }],
    ['repository', s => { s.pr.headRepository = 'fork/emmy'; }],
    ['repository', s => { s.pr.baseRepository = 'unrelated/emmy'; }],
    ['pullRequest', s => { s.pr.draft = true; }],
    ['pullRequest', s => { s.pr.state = 'closed'; }],
    ['pullRequest', s => { s.pr.merged = true; }],
    ['head', s => { s.pr.headSha = other; }],
    ['head', s => { s.expectedHead = ''; s.pr.headSha = ''; s.checks[0].sha = ''; s.statuses[0].sha = ''; }],
    ['base', s => { s.pr.baseRef = 'release'; }],
    ['base', s => { s.pr.baseSha = other; }],
    ['base', s => { s.branch.sha = other; }],
    ['protection', s => { s.branch.protected = false; }],
    ['protection', s => { s.branch.enforcement = 'non_admins'; }],
    ['protection', s => { s.branch.contexts = [MERGE_POLICY.ci]; }],
    ['ci', s => { s.checks = []; }],
    ['ci', s => { s.checks[0].sha = other; }],
    ['ci', s => { s.checks[0].app = 'pretend-actions'; }],
    ['ci', s => { s.checks[0].status = 'queued'; }],
    ['independentReview', s => { s.statuses = []; }],
    ['independentReview', s => { s.statuses[0].sha = other; }],
    ['independentReview', s => { s.statuses[0].creator = 'github-actions[bot]'; }],
    ['independentReview', s => { s.statuses[0].creatorType = 'Bot'; }],
  ];
  for (const [gate, change] of cases) {
    const state = snapshot();
    change(state);
    assert.deepEqual(evaluateEligibility(state), { eligible: false, waiting: [gate] }, gate);
  }
});

test('latest relevant status wins even when an older success appears first', () => {
  for (const state of ['pending', 'failure', 'error']) {
    const current = snapshot();
    current.statuses.push({ ...current.statuses[0], id: 30, state });
    assert.equal(evaluateEligibility(current).eligible, false, state);
    current.statuses.reverse();
    assert.equal(evaluateEligibility(current).eligible, false, `${state} reversed`);
  }
  const current = snapshot();
  current.statuses.unshift({ ...current.statuses[0], id: 1, state: 'failure' });
  assert.equal(evaluateEligibility(current).eligible, true);
});

test('latest CI attempt and colliding required contexts cannot hide failure', () => {
  for (const conclusion of ['failure', 'cancelled', 'neutral', 'skipped', 'timed_out', null]) {
    const current = snapshot();
    current.checks.unshift({ ...current.checks[0], id: 11, conclusion });
    assert.equal(evaluateEligibility(current).eligible, false, String(conclusion));
  }
  const collision = snapshot();
  collision.statuses.push({ id: 40, context: MERGE_POLICY.ci, sha: head, state: 'pending' });
  assert.deepEqual(evaluateEligibility(collision).waiting, ['ci']);
  collision.statuses.pop();
  collision.checks.push({ id: 50, name: MERGE_POLICY.review, sha: head, status: 'completed', conclusion: 'failure' });
  assert.deepEqual(evaluateEligibility(collision).waiting, ['independentReview']);
  collision.statuses = [];
  collision.checks[1].conclusion = 'success';
  assert.deepEqual(evaluateEligibility(collision).waiting, ['independentReview']);
});

test('candidate discovery pins event head and never selects unrelated repositories', () => {
  const repository = { full_name: MERGE_POLICY.repository };
  const pulls = [{ number: 7, head: { sha: head } }, { number: 8, head: { sha: other } }];
  assert.deepEqual(selectCandidates('status', { repository, sha: head, context: MERGE_POLICY.review }, pulls), [
    { number: 7, expectedHead: head },
  ]);
  assert.deepEqual(selectCandidates('status', { repository, sha: head, context: 'unrelated' }, pulls), []);
  assert.deepEqual(selectCandidates('status', { repository: { full_name: 'other/emmy' }, sha: head }, pulls), []);
  assert.deepEqual(selectCandidates('pull_request_target', {
    repository, pull_request: { number: 7, head: { sha: other } },
  }, pulls), [{ number: 7, expectedHead: other }]);
  assert.deepEqual(selectCandidates('workflow_dispatch', { repository, inputs: { pull_request: '8' } }, pulls), [
    { number: 8, expectedHead: other },
  ]);
  assert.deepEqual(selectCandidates('workflow_dispatch', {
    repository, inputs: { pull_request: '7; touch /tmp/injected' },
  }, pulls), []);
  const workflow_run = {
    name: 'Emmy checks', status: 'completed', conclusion: 'success', head_sha: head,
    head_repository: repository,
  };
  assert.deepEqual(selectCandidates('workflow_run', { repository, workflow_run }, pulls), [{ number: 7, expectedHead: head }]);
  workflow_run.head_repository = { full_name: 'fork/emmy' };
  assert.deepEqual(selectCandidates('workflow_run', { repository, workflow_run }, pulls), []);
});

test('metadata normalization binds review status to the SHA queried at the API boundary', () => {
  const result = normalizeSnapshot({
    repository: { full_name: MERGE_POLICY.repository, allow_auto_merge: true },
    pr: { number: 7, head: { repo: { full_name: MERGE_POLICY.repository }, sha: head }, base: { sha: base, ref: 'main' } },
    branch: { name: 'main', commit: { sha: base } }, checks: [],
    statuses: [{ id: 20, context: MERGE_POLICY.review, state: 'success', creator: { login: MERGE_POLICY.reviewer, type: 'User' } }],
  }, head);
  assert.equal(result.statuses[0].sha, head);
  assert.equal(result.expectedBase, base);
  assert.equal(result.branch.protected, undefined);
  assert.equal(evaluateEligibility(result).eligible, false);
});

function fakeGitHub({ change = () => {}, receipt = {}, rejectRequest = false } = {}) {
  const calls = [];
  let snapshots = 0;
  return {
    calls,
    async snapshot(candidate) {
      calls.push({ method: 'snapshot', candidate });
      const current = snapshot();
      if (++snapshots === 2) change(current);
      return current;
    },
    async requestMerge(candidate) {
      calls.push({ method: 'requestMerge', candidate });
      if (rejectRequest) throw new Error('head changed');
    },
    async receipt() {
      calls.push({ method: 'receipt' });
      return { headRefOid: head, baseRefName: 'main', merged: false, ...receipt };
    },
  };
}

test('fresh metadata gate prevents merge after a head, base, CI or review change', async () => {
  for (const [gate, change] of [
    ['head', s => { s.pr.headSha = other; }],
    ['base', s => { s.branch.sha = other; }],
    ['ci', s => { s.checks[0].conclusion = 'failure'; }],
    ['independentReview', s => { s.statuses[0].state = 'pending'; }],
  ]) {
    const github = fakeGitHub({ change });
    const result = await considerPullRequest({ number: 7, expectedHead: head }, github);
    assert.equal(result.outcome, 'skipped');
    assert.deepEqual(result.waiting, [gate]);
    assert.equal(github.calls.some(call => call.method === 'requestMerge'), false);
    assert.equal(github.calls[1].candidate.expectedBase, base);
  }
});

test('missing initial review status skips without requesting a merge or a receipt', async () => {
  const github = {
    async snapshot() {
      const current = snapshot();
      current.statuses = [];
      return current;
    },
    async requestMerge() { assert.fail('missing review must never request a merge'); },
    async receipt() { assert.fail('missing review needs no merge receipt'); },
  };
  assert.deepEqual(await considerPullRequest({ number: 7, expectedHead: head }, github), {
    number: 7, expectedHead: head, outcome: 'skipped', waiting: ['independentReview'],
  });
});

test('merge receipts distinguish enabled, queued, merged, failed and changed states', async () => {
  for (const [outcome, receipt, rejectRequest] of [
    ['enabled', { autoMergeRequest: { enabledAt: '2026-10-22T00:00:00Z' } }, false],
    ['queued', { isInMergeQueue: true }, false],
    ['merged', { merged: true, mergeCommit: { oid: other } }, false],
    ['merged', { merged: true, mergeCommit: { oid: other } }, true],
    ['skipped', {}, false],
    ['failed', {}, true],
    ['skipped', { headRefOid: other }, false],
    ['skipped', { baseRefName: 'release' }, false],
    ['unverified', { merged: true, headRefOid: other }, false],
  ]) {
    const github = fakeGitHub({ receipt, rejectRequest });
    const result = await considerPullRequest({ number: 7, expectedHead: head }, github);
    assert.equal(result.outcome, outcome);
    assert.equal(github.calls.filter(call => call.method === 'requestMerge').length, 1);
  }
});

test('GitHub adapter paginates status history and checks every run at the exact head', async () => {
  const urls = [];
  const first = Array.from({ length: 100 }, (_, id) => ({ id, context: 'other', state: 'pending' }));
  const github = createGitHub('test-token', async url => {
    urls.push(url);
    let body = [];
    if (url.includes('/statuses')) body = url.endsWith('page=1') ? first : [{ id: 101, context: MERGE_POLICY.review, state: 'success' }];
    else if (url.includes('/check-runs')) body = { check_runs: [] };
    else if (url.includes('/pulls/')) body = { number: 7, head: { sha: head }, base: { sha: base } };
    else if (url.includes('/branches/')) body = { name: 'main', commit: { sha: base } };
    else body = { full_name: MERGE_POLICY.repository, allow_auto_merge: true };
    return { ok: true, json: async () => body };
  });
  const result = await github.snapshot({ number: 7, expectedHead: head });
  assert.equal(result.statuses.length, 101);
  assert.equal(urls.some(url => url.includes(`/commits/${head}/statuses?per_page=100&page=2`)), true);
  assert.equal(urls.some(url => url.includes(`/commits/${head}/check-runs?filter=all`)), true);
});

test('merge API uses an immediate exact-head request without deferred authorization or rule bypass', async () => {
  let call;
  const github = createGitHub('test-token', async (...args) => {
    call = args;
    return { ok: true, json: async () => ({ merged: true, sha: other }) };
  });
  await github.requestMerge({ number: 7, expectedHead: head });
  assert.equal(call[0], `https://api.github.com/repos/${MERGE_POLICY.repository}/pulls/7/merge`);
  assert.equal(call[1].method, 'PUT');
  assert.deepEqual(JSON.parse(call[1].body), { sha: head, merge_method: 'squash' });
  assert.equal(call[1].headers.Authorization, 'Bearer test-token');
});

test('provider refusal leaves a clear skipped result without arming a later merge', async () => {
  const github = fakeGitHub();
  github.requestMerge = async () => {
    const error = new Error('merge is not ready');
    error.status = 405;
    throw error;
  };
  assert.deepEqual(await considerPullRequest({ number: 7, expectedHead: head }, github), {
    number: 7, expectedHead: head, outcome: 'skipped', waiting: ['provider-not-ready'],
  });
});

test('wrong-repository entry point skips before reading event files or tokens', async () => {
  assert.deepEqual(await main({ GITHUB_REPOSITORY: 'other/emmy' }), [{ outcome: 'skipped', waiting: ['repository'] }]);
});

test('privileged workflow checks out only main and does not interpolate event data into a shell', async () => {
  const workflow = await readFile(new URL('../.github/workflows/auto-merge.yml', import.meta.url), 'utf8');
  assert.match(workflow, /ref: main\n/);
  assert.doesNotMatch(workflow, /pull_request\.head|workflow_run\.head/);
  assert.match(workflow, /run: node scripts\/github-auto-merge\.mjs/);
  assert.doesNotMatch(workflow, /statuses: write|checks: write|--admin/);
  assert.match(workflow, /github\.event\.repository\.fork == false/);
});
