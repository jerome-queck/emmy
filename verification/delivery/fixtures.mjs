import { MERGE_POLICY } from '../../scripts/github-auto-merge.mjs';
import { canonical, digest } from '../../src/content.mjs';

export function localSpecimen() {
  const binding = { repository: MERGE_POLICY.repository, branch: 'codex/example', head: 'a'.repeat(40), base: 'b'.repeat(40), tree: 'c'.repeat(40), author: 'author-task' };
  const exact = { head: binding.head, base: binding.base, tree: binding.tree };
  const payloadDigest = digest(canonical({ title: 'Synthetic delivery', body: 'Provider fake only.', head: binding.branch, base: 'main', draft: false }));
  const assurance = { ...exact, status: 'current-local-reported', clean: true, receiptDigest: 'd'.repeat(64), contextDigest: 'e'.repeat(64) };
  const review = { ...exact, payloadDigest, verdict: 'PASS', practical: true, author: binding.author, reviewer: 'independent-task', acceptanceRef: 'owner-accepted-native-verdict', receiptDigest: assurance.receiptDigest, contextDigest: assurance.contextDigest };
  const authorization = { ...exact, payloadDigest, repository: binding.repository, branch: binding.branch, actions: ['publish', 'open-pr', 'attest', 'merge'], sourceRef: 'synthetic-scope', notBefore: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' };
  return { binding, payloadDigest, assurance, review, authorization, now: Date.now(), action: 'merge' };
}

export function localSnapshot(local = localSpecimen()) {
  const b = local.binding;
  return {
    mode: 'local', local, repository: { name: b.repository }, expectedHead: b.head, expectedBase: b.base,
    pr: { number: 7, state: 'open', draft: false, merged: false, headRepository: b.repository, baseRepository: b.repository, headSha: b.head, baseRef: 'main', baseSha: b.base },
    branch: { name: 'main', sha: b.base, protected: true, strict: true, enforcement: 'everyone', contexts: [MERGE_POLICY.local, MERGE_POLICY.review] },
    checks: [], statuses: [MERGE_POLICY.local, MERGE_POLICY.review].map((context, id) => ({ id, context, sha: b.head, state: 'success', creator: MERGE_POLICY.reviewer, creatorType: 'User' })),
  };
}
