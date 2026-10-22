import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const intendedRepository = 'jerome-queck/emmy';

export const MERGE_POLICY = Object.freeze({
  repository: intendedRepository,
  base: 'main',
  ci: 'emmy-check',
  review: 'emmy-independent-review',
  reviewer: intendedRepository.split('/')[0],
});

const shaPattern = /^[a-f0-9]{40}$/;

function latest(records, name, field) {
  return records.filter(record => record[field] === name)
    .reduce((found, record) => !found || record.id > found.id ? record : found, undefined);
}

function successfulCheck(check, sha) {
  return check?.sha === sha && check.status === 'completed' && check.conclusion === 'success';
}

function successfulStatus(status, sha) {
  return status?.sha === sha && status.state === 'success';
}

export function evaluateEligibility(snapshot) {
  const { repository, pr, expectedHead, expectedBase, branch, checks, statuses } = snapshot;
  const ciCheck = latest(checks, MERGE_POLICY.ci, 'name');
  const ciStatus = latest(statuses, MERGE_POLICY.ci, 'context');
  const reviewStatus = latest(statuses, MERGE_POLICY.review, 'context');
  const reviewCheck = latest(checks, MERGE_POLICY.review, 'name');
  const gates = {
    repository: repository.name === MERGE_POLICY.repository
      && pr.headRepository === MERGE_POLICY.repository && pr.baseRepository === MERGE_POLICY.repository,
    pullRequest: Number.isSafeInteger(pr.number) && pr.number > 0
      && pr.state === 'open' && pr.draft === false && pr.merged === false,
    head: shaPattern.test(expectedHead) && pr.headSha === expectedHead,
    base: pr.baseRef === MERGE_POLICY.base && branch.name === MERGE_POLICY.base
      && shaPattern.test(expectedBase) && pr.baseSha === expectedBase && branch.sha === expectedBase,
    protection: branch.protected === true && branch.enforcement === 'everyone'
      && [MERGE_POLICY.ci, MERGE_POLICY.review].every(name => branch.contexts.includes(name)),
    ci: successfulCheck(ciCheck, expectedHead) && ciCheck.app === 'github-actions'
      && (!ciStatus || successfulStatus(ciStatus, expectedHead)),
    independentReview: successfulStatus(reviewStatus, expectedHead)
      && reviewStatus.creator === MERGE_POLICY.reviewer && reviewStatus.creatorType === 'User'
      && (!reviewCheck || successfulCheck(reviewCheck, expectedHead)),
  };
  const waiting = Object.keys(gates).filter(name => !gates[name]);
  return { eligible: waiting.length === 0, waiting };
}

export function selectCandidates(eventName, event, pulls) {
  if (event.repository?.full_name !== MERGE_POLICY.repository) return [];
  if (eventName === 'pull_request_target') {
    const pr = event.pull_request;
    return pr && shaPattern.test(pr.head?.sha)
      ? [{ number: pr.number, expectedHead: pr.head.sha }] : [];
  }
  let sha;
  if (eventName === 'workflow_run') {
    const run = event.workflow_run;
    if (run?.name !== 'Emmy checks' || run.status !== 'completed' || run.conclusion !== 'success'
      || run.head_repository?.full_name !== MERGE_POLICY.repository) return [];
    sha = run.head_sha;
  } else if (eventName === 'status') {
    if (![MERGE_POLICY.ci, MERGE_POLICY.review].includes(event.context)) return [];
    sha = event.sha;
  } else if (eventName !== 'workflow_dispatch') {
    return [];
  }
  if (sha !== undefined && !shaPattern.test(sha)) return [];
  const requested = event.inputs?.pull_request;
  if (requested && !/^[1-9][0-9]*$/.test(requested)) return [];
  return pulls.filter(pr => (!sha || pr.head.sha === sha) && (!requested || pr.number === Number(requested)))
    .map(pr => ({ number: pr.number, expectedHead: sha ?? pr.head.sha }));
}

export function normalizeSnapshot({ repository, pr, branch, checks, statuses }, expectedHead, expectedBase) {
  return {
    repository: { name: repository.full_name },
    pr: {
      number: pr.number,
      state: pr.state,
      draft: pr.draft,
      merged: pr.merged,
      headRepository: pr.head?.repo?.full_name,
      headSha: pr.head?.sha,
      baseRepository: pr.base?.repo?.full_name,
      baseRef: pr.base?.ref,
      baseSha: pr.base?.sha,
    },
    expectedHead,
    expectedBase: expectedBase ?? branch.commit?.sha,
    branch: {
      name: branch.name,
      sha: branch.commit?.sha,
      protected: branch.protected,
      enforcement: branch.protection?.required_status_checks?.enforcement_level,
      contexts: branch.protection?.required_status_checks?.contexts ?? [],
    },
    checks: checks.map(check => ({
      id: check.id, name: check.name, sha: check.head_sha,
      status: check.status, conclusion: check.conclusion, app: check.app?.slug,
    })),
    statuses: statuses.map(status => ({
      id: status.id, context: status.context, sha: expectedHead, state: status.state,
      creator: status.creator?.login, creatorType: status.creator?.type,
    })),
  };
}

export async function considerPullRequest(candidate, github) {
  const first = await github.snapshot(candidate);
  const initial = evaluateEligibility(first);
  if (!initial.eligible) return { ...candidate, outcome: 'skipped', waiting: initial.waiting };

  const current = await github.snapshot({ ...candidate, expectedBase: first.expectedBase });
  const final = evaluateEligibility(current);
  if (!final.eligible) return { ...candidate, outcome: 'skipped', waiting: final.waiting };

  let failure;
  try {
    await github.requestMerge(candidate);
  } catch (error) {
    failure = error;
  }
  const receipt = await github.receipt(candidate.number);
  if (receipt.headRefOid !== candidate.expectedHead || receipt.baseRefName !== MERGE_POLICY.base) {
    return { ...candidate, outcome: receipt.merged ? 'unverified' : 'skipped', waiting: ['changed-after-request'] };
  }
  if (receipt.merged) {
    const mergeCommit = receipt.mergeCommit?.oid;
    if (typeof mergeCommit !== 'string' || !shaPattern.test(mergeCommit)) {
      return { ...candidate, outcome: 'unverified', waiting: ['no-confirmed-merge-commit'] };
    }
    return { ...candidate, outcome: 'merged', mergeCommit };
  }
  if (receipt.isInMergeQueue) return { ...candidate, outcome: 'queued', observedOnly: true };
  if (receipt.autoMergeRequest) return { ...candidate, outcome: 'enabled', observedOnly: true };
  if ([405, 409].includes(failure?.status)) {
    return { ...candidate, outcome: 'skipped', waiting: ['provider-not-ready'] };
  }
  return { ...candidate, outcome: failure ? 'failed' : 'skipped', waiting: ['no-confirmed-merge-state'] };
}

export function createGitHub(token, fetcher = fetch) {
  async function request(path, body, method = body ? 'POST' : 'GET') {
    const response = await fetcher(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const error = new Error(`GitHub request failed with HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    if (data.errors?.length) throw new Error('GitHub GraphQL metadata request failed');
    return data;
  }

  const prefix = `/repos/${MERGE_POLICY.repository}`;
  async function pages(path, key) {
    const records = [];
    for (let page = 1; ; page += 1) {
      const data = await request(`${prefix}${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const batch = key ? data[key] : data;
      if (!Array.isArray(batch)) throw new Error('GitHub returned invalid metadata');
      records.push(...batch);
      if (batch.length < 100) return records;
    }
  }

  return {
    pulls: () => pages(`/pulls?state=open&base=${MERGE_POLICY.base}`),
    async snapshot({ number, expectedHead, expectedBase }) {
      if (!Number.isSafeInteger(number) || number < 1 || !shaPattern.test(expectedHead)) {
        throw new Error('Invalid pull request identity');
      }
      const [repository, pr, branch, checks, statuses] = await Promise.all([
        request(prefix), request(`${prefix}/pulls/${number}`), request(`${prefix}/branches/${MERGE_POLICY.base}`),
        pages(`/commits/${expectedHead}/check-runs?filter=all`, 'check_runs'),
        pages(`/commits/${expectedHead}/statuses`),
      ]);
      return normalizeSnapshot({ repository, pr, branch, checks, statuses }, expectedHead, expectedBase);
    },
    requestMerge({ number, expectedHead }) {
      return request(`${prefix}/pulls/${number}/merge`, { sha: expectedHead, merge_method: 'merge' }, 'PUT');
    },
    async receipt(number) {
      const data = await request('/graphql', {
        query: `query Receipt($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) { pullRequest(number: $number) {
            headRefOid baseRefName merged mergeCommit { oid } isInMergeQueue autoMergeRequest { enabledAt }
          } }
        }`,
        variables: {
          owner: MERGE_POLICY.repository.split('/')[0],
          name: MERGE_POLICY.repository.split('/')[1], number,
        },
      });
      if (!data.data?.repository?.pullRequest) throw new Error('GitHub returned no merge receipt');
      return data.data.repository.pullRequest;
    },
  };
}

export async function main(env = process.env) {
  if (env.GITHUB_REPOSITORY !== MERGE_POLICY.repository) {
    return [{ outcome: 'skipped', waiting: ['repository'] }];
  }
  if (!env.GITHUB_TOKEN || !env.GITHUB_EVENT_PATH) throw new Error('GitHub workflow environment is required');
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  const github = createGitHub(env.GITHUB_TOKEN);
  const pulls = await github.pulls();
  const candidates = selectCandidates(env.GITHUB_EVENT_NAME, event, pulls);
  const results = [];
  for (const candidate of candidates) results.push(await considerPullRequest(candidate, github));
  return results.length ? results : [{ outcome: 'skipped', waiting: ['no-current-candidate'] }];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(results => {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    if (results.some(result => ['failed', 'unverified'].includes(result.outcome))) process.exitCode = 1;
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
