import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MERGE_POLICY, evaluateEligibility } from '../scripts/github-auto-merge.mjs';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const other = 'c'.repeat(40);

function specimen(bits = 0, ci = 'success', review = 'success') {
  const valid = index => !(bits & (1 << index));
  return {
    repository: { name: valid(0) ? MERGE_POLICY.repository : 'other/emmy' },
    pr: {
      number: 7, state: valid(2) ? 'open' : 'closed', draft: !valid(3), merged: !valid(1),
      headRepository: valid(4) ? MERGE_POLICY.repository : 'fork/emmy',
      baseRepository: MERGE_POLICY.repository, headSha: valid(5) ? head : other,
      baseRef: valid(6) ? 'main' : 'release', baseSha: valid(7) ? base : other,
    },
    expectedHead: head, expectedBase: base,
    branch: {
      name: 'main', sha: valid(8) ? base : other, protected: true,
      enforcement: valid(9) ? 'everyone' : 'non_admins',
      contexts: [MERGE_POLICY.ci, MERGE_POLICY.review],
    },
    checks: ci === 'absent' ? [] : [{
      id: 10, name: MERGE_POLICY.ci, sha: head, status: ci === 'pending' ? 'queued' : 'completed',
      conclusion: ci, app: 'github-actions',
    }],
    statuses: review === 'absent' ? [] : [{
      id: 20, context: MERGE_POLICY.review, sha: head, state: review,
      creator: MERGE_POLICY.reviewer, creatorType: 'User',
    }],
  };
}

export async function verifyMergePolicy() {
  const coverage = JSON.parse(await readFile(new URL('merge-coverage.json', import.meta.url), 'utf8'));
  assert.match(coverage.sourceCommit, /^[a-f0-9]{40}$/);
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const [path, expected] of Object.entries(coverage.files)) {
    const actual = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
    assert.equal(actual, expected, `${path} changed after formal review`);
    const reviewed = execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root });
    assert.equal(createHash('sha256').update(reviewed).digest('hex'), expected, `${path} differs from reviewed commit`);
  }
  const ciStates = ['success', 'failure', 'pending', 'skipped', 'neutral', 'absent'];
  const reviewStates = ['success', 'failure', 'error', 'pending', 'absent'];
  let checked = 0;
  for (let bits = 0; bits < 2 ** 10; bits += 1) {
    for (const ci of ciStates) {
      for (const review of reviewStates) {
        const expected = bits === 0 && ci === 'success' && review === 'success';
        const actual = evaluateEligibility(specimen(bits, ci, review)).eligible;
        assert.equal(actual, expected, JSON.stringify({ bits, ci, review }));
        checked += 1;
      }
    }
  }

  const source = await readFile(new URL('../scripts/github-auto-merge.mjs', import.meta.url), 'utf8');
  const controls = [
    { gate: 'head', make: () => specimen(1 << 5) },
    { gate: 'base', make: () => specimen(1 << 6) },
    { gate: 'ci', make: () => specimen(0, 'failure') },
    { gate: 'independentReview', make: () => specimen(0, 'success', 'pending') },
  ];
  const mutations = [];
  for (const { gate, make } of controls) {
    const pattern = new RegExp(`    ${gate}: [\\s\\S]*?(?=\\n    [a-zA-Z]+:|\\n  };)`);
    const mutatedSource = source.replace(pattern, `    ${gate}: true,`);
    assert.notEqual(mutatedSource, source, `mutation must change ${gate}`);
    const mutant = await import(`data:text/javascript;base64,${Buffer.from(mutatedSource).toString('base64')}#${gate}`);
    assert.equal(mutant.evaluateEligibility(specimen()).eligible, true, `${gate} mutant must execute the eligible case`);
    const counterexample = make();
    const original = evaluateEligibility(counterexample);
    const mutated = mutant.evaluateEligibility(counterexample);
    assert.equal(original.eligible, false, `${gate} counterexample must fail original`);
    assert.deepEqual(original.waiting, [gate], `${gate} must be the intended original disagreement`);
    assert.equal(mutated.eligible, true, `${gate} removal must permit the forbidden merge`);
    mutations.push({ gate, counterexample, original: original.waiting, mutantEligible: mutated.eligible, killed: true });
  }
  assert.equal(checked, coverage.bounds.cases, 'Review the coverage bounds after changing the enumerator');
  assert.deepEqual(mutations.map(value => value.gate), coverage.mapping[0].mutations, 'Coverage must name every mutation');
  const result = {
    kind: 'bounded-exhaustive-merge-policy', checked,
    sourceCommit: coverage.sourceCommit,
    domain: { binaryDimensions: 10, ciStates, reviewStates },
    mutations,
    limits: ['Finite metadata domain only.', 'No GitHub execution, token permissions, branch-rule enforcement, or actual reviewer independence proof.'],
  };
  await mkdir('.local/verification', { recursive: true });
  await writeFile('.local/verification/merge-policy.json', `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyMergePolicy().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
}
