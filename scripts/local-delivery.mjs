import { execFileSync, spawnSync } from 'node:child_process';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, digest } from '../src/content.mjs';
import { boundedFile, strictJson } from '../src/bounded-json.mjs';
import { assessAssurance, observeAssurance } from '../src/local-assurance.mjs';
import { beginDelivery, createGitHub, deliveryTransition, evaluateAbsenceResolution, evaluateEligibility, evaluateLocalEvidence, MERGE_POLICY } from './github-auto-merge.mjs';

const need = (condition, message) => { if (!condition) throw new Error(message); };
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const hash = value => digest(canonical(value));
export function prPayload(request) {
  need(typeof request.title === 'string' && request.title.trim().length > 0 && typeof request.body === 'string', 'Exact PR title and body required');
  return { title: request.title, body: request.body, head: request.binding.branch, base: 'main', draft: false };
}
const scopeDigest = ({ authorization, resolution, ...request }) => hash(request);
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function selected(selection) {
  need(selection && typeof selection.file === 'string' && /^[a-f0-9]{64}$/.test(selection.sha256), 'Exact selected evidence file and SHA-256 required');
  need((await lstat(selection.file)).isFile(), 'Evidence must be an ordinary file');
  const bytes = await boundedFile(selection.file, 16 * 1024 * 1024);
  need(digest(bytes) === selection.sha256, 'Selected evidence digest mismatch');
  return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function acquireLocalEvidence(root, request) {
  const assessment = await assessAssurance(root, request.assurance);
  const observation = await observeAssurance(root, request.baseRef);
  const source = observation.context.source;
  const review = await selected(request.review);
  const authorization = await selected(request.authorization);
  const initial = (await selected({ file: request.assurance.receiptFile, sha256: request.assurance.receiptDigest })).initial;
  return {
    binding: request.binding, action: request.action, payloadDigest: hash(prPayload(request)), now: Date.now(), review, authorization,
    assurance: {
      status: assessment.status, head: source.head, base: source.base, tree: source.workingTree,
      clean: source.workingTree === git(root, ['rev-parse', 'HEAD^{tree}'])
        && source.baseRef === request.baseRef && observation.contextDigest === initial.contextDigest,
      contextDigest: observation.contextDigest, receiptDigest: request.assurance.receiptDigest,
    },
  };
}

export function createLocalProvider(token, root, fetcher = fetch) {
  const legacy = createGitHub(token, fetcher);
  const prefix = `/repos/${MERGE_POLICY.repository}`;
  async function api(path, body, method = body ? 'POST' : 'GET') {
    const response = await fetcher(`https://api.github.com${path}`, {
      method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) { const error = new Error(`GitHub local delivery HTTP ${response.status}`); error.status = response.status; throw error; }
    return response.json();
  }
  const optional = async path => { try { return await api(path); } catch (error) { if (error.status === 404) return null; throw error; } };
  const pages = async path => {
    const rows = [];
    for (let page = 1; page <= 100; page++) {
      const batch = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      need(Array.isArray(batch), 'Invalid complete provider listing'); rows.push(...batch);
      if (batch.length < 100) return rows;
    }
    throw new Error('Provider listing bound exceeded');
  };
  const branchPath = b => `${prefix}/git/ref/heads/${encodeURIComponent(b.branch)}`;
  const pulls = b => pages(`${prefix}/pulls?state=all&base=main&head=${encodeURIComponent(`${MERGE_POLICY.reviewer}:${b.branch}`)}`);
  const exactPr = (pr, b, request) => pr.head?.sha === b.head && pr.head?.repo?.full_name === b.repository
    && pr.base?.ref === 'main' && pr.base?.repo?.full_name === b.repository
    && pr.title === request.title && pr.body === request.body;
  return {
    async destination(b) {
      const [branch, protection] = await Promise.all([api(`${prefix}/branches/main`), api(`${prefix}/branches/main/protection`)]);
      return { exact: branch.commit?.sha === b.base && branch.protected === true
        && protection.enforce_admins?.enabled === true && protection.required_status_checks?.strict === true };
    },
    async discover(action, b, request) {
      const ref = await optional(branchPath(b));
      if (ref && ref.object?.sha !== b.head) return { exact: false, confirmed: false, conflict: 'remote-branch-drift' };
      if (action === 'publish') return { exact: !ref || ref.object?.sha === b.head, confirmed: Boolean(ref), absent: !ref };
      if (!ref) return { exact: false, confirmed: false, conflict: 'remote-branch-missing' };
      const found = await pulls(b);
      if (found.length > 1 || found.some(pr => !exactPr(pr, b, request))) return { exact: false, confirmed: false, conflict: 'pull-request-conflict' };
      const pr = found[0];
      if (action === 'open-pr') return { exact: !pr || pr.state === 'open' && pr.draft === false, confirmed: Boolean(pr && pr.state === 'open' && !pr.draft), absent: !pr, number: pr?.number ?? null };
      if (!pr || pr.state !== 'open' && !pr.merged_at) return { exact: false, confirmed: false, conflict: 'pull-request-unavailable' };
      if (action === 'merge') {
        const receipt = await legacy.receipt(pr.number);
        const confirmed = receipt.merged === true && receipt.headRefOid === b.head && receipt.baseRefName === 'main' && oid(receipt.mergeCommit?.oid);
        let inHistory = false;
        if (confirmed) {
          const compare = await api(`${prefix}/compare/${receipt.mergeCommit.oid}...main`);
          inHistory = ['ahead', 'identical'].includes(compare.status);
        }
        return { exact: receipt.headRefOid === b.head && receipt.baseRefName === 'main', confirmed: confirmed && inHistory,
          number: pr.number, mergeCommit: confirmed && inHistory ? receipt.mergeCommit.oid : null,
          absent: receipt.merged === false && pr.state === 'open' && !receipt.autoMergeRequest && !receipt.isInMergeQueue,
          pending: Boolean(receipt.autoMergeRequest || receipt.isInMergeQueue) };
      }
      const statuses = await pages(`${prefix}/commits/${b.head}/statuses`);
      const normalized = statuses.map(row => ({ id: row.id, context: row.context, sha: b.head, state: row.state, creator: row.creator?.login, creatorType: row.creator?.type }));
      const success = context => {
        const latest = normalized.filter(row => row.context === context).sort((a, z) => z.id - a.id)[0];
        return latest?.state === 'success' && latest.creator === MERGE_POLICY.reviewer && latest.creatorType === 'User';
      };
      return { exact: true, confirmed: [MERGE_POLICY.local, MERGE_POLICY.review].every(success),
        absent: !normalized.some(row => [MERGE_POLICY.local, MERGE_POLICY.review].includes(row.context)), number: pr.number };
    },
    async mergeEligibility(b, local, number) {
      const snapshot = await legacy.snapshot({ number, expectedHead: b.head, expectedBase: b.base });
      const protection = await api(`${prefix}/branches/main/protection`);
      snapshot.branch.strict = protection.required_status_checks?.strict;
      snapshot.branch.contexts = protection.required_status_checks?.contexts ?? [];
      if (protection.enforce_admins?.enabled !== true) snapshot.branch.enforcement = 'non_admins';
      return evaluateEligibility({ ...snapshot, mode: 'local', local });
    },
    async effect(action, request, discovered, local) {
      const b = request.binding;
      if (action === 'publish') {
        need(git(root, ['remote', 'get-url', 'origin']) === `https://github.com/${b.repository}.git`, 'Exact canonical publication remote required');
        const result = spawnSync('git', ['-C', root, 'push', '--porcelain', `--force-with-lease=refs/heads/${b.branch}:`, 'origin', `${b.head}:refs/heads/${b.branch}`], { encoding: 'utf8', timeout: 60_000 });
        need(result.status === 0 && !result.signal && !result.error, 'Branch publication unconfirmed; rediscover retained intent');
      } else if (action === 'open-pr') {
        need(typeof request.title === 'string' && request.title.trim() && typeof request.body === 'string', 'Exact reviewed PR title and body required');
        await api(`${prefix}/pulls`, prPayload(request));
      } else if (action === 'attest') {
        for (const context of [MERGE_POLICY.local, MERGE_POLICY.review]) {
          need(evaluateLocalEvidence({ ...local, now: Date.now() }).eligible, 'Action scope expired during attestation; rediscover retained intent');
          await api(`${prefix}/statuses/${b.head}`, { state: 'success', context, description: `Supplied local evidence ${local.assurance.contextDigest}` });
        }
      } else await legacy.requestMerge({ number: discovered.number, expectedHead: b.head });
    },
  };
}

export async function deliverLocal(root, request, provider, acquire = acquireLocalEvidence) {
  need(request?.schemaVersion === 1 && request.mode === 'local', 'Explicit local delivery request required');
  const b = request.binding;
  need(b?.repository === MERGE_POLICY.repository && /^codex\/[a-z0-9][a-z0-9/-]*$/.test(b.branch) && oid(b.head) && oid(b.base) && oid(b.tree), 'Exact delivery binding required');
  need(['publish', 'open-pr', 'attest', 'merge'].includes(request.action), 'Explicit scoped action required');
  const payload = prPayload(request); const payloadDigest = hash(payload);
  const directory = join(root, '.local/verified-delivery', hash({ repository: b.repository, branch: b.branch }));
  await mkdir(directory, { recursive: true });
  const lock = join(directory, 'lock');
  await mkdir(lock);
  const checkpoint = join(directory, 'checkpoint.json');
  let state;
  const retain = async () => {
    const temporary = join(directory, `${randomUUID()}.tmp`);
    await writeFile(temporary, `${canonical(state)}\n`, { flag: 'wx' }); await rename(temporary, checkpoint);
  };
  try {
    try { state = strictJson(await readFile(checkpoint, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (state) need(state.bindingDigest === hash(b), 'Existing branch intent has a different binding; reconcile before a new generation');
    else state = { schemaVersion: 2, bindingDigest: hash(b), delivery: beginDelivery(), history: [] };
    if (state.payloadDigest && state.payloadDigest !== payloadDigest) return { outcome: 'held', waiting: ['changed-pr-payload'], checkpoint };
    const action = state.delivery.phase === 'unknown' ? state.delivery.active : request.action;
    const discovered = await provider.discover(action, b, state.delivery.phase === 'unknown' && state.pending ? state.pending.request : request);
    state.history.push({ kind: 'discovery', at: new Date().toISOString(), action, result: discovered });
    if (state.delivery.phase === 'unknown') {
      if (request.resolution) {
        const resolution = await selected(request.resolution);
        const local = await acquire(root, request);
        const fresh = await provider.discover(action, b, state.pending?.request ?? request);
        const destination = await provider.destination(b);
        const now = Date.now();
        const valid = request.action === action && scopeDigest(request) === state.pending?.scopeDigest && local.payloadDigest === payloadDigest
          && evaluateLocalEvidence({ ...local, now }).eligible && destination.exact === true
          && evaluateAbsenceResolution({ pending: state.pending, resolution, authorization: local.authorization, discovered: fresh, bindingDigest: state.bindingDigest, now });
        const next = deliveryTransition(state.delivery, { kind: 'resolve-absence', action, valid, exact: fresh.exact, absent: fresh.absent, attemptMatches: valid });
        state.history.push({ kind: 'absence-resolution', at: new Date().toISOString(), valid, resolution, selection: request.resolution, result: fresh, originalAttemptId: state.pending?.id ?? null });
        if (next.phase !== 'unknown') {
          state.retryScopeDigest = state.pending.scopeDigest; state.retryOf = state.pending.id;
          state.delivery = next; await retain(); return { outcome: 'retry-ready', checkpoint, originalAttemptId: state.pending.id };
        }
        await retain(); return { outcome: 'unknown', waiting: ['absence-resolution-unverified'], checkpoint };
      }
      state.delivery = deliveryTransition(state.delivery, { kind: 'observe', action, ...discovered });
      await retain();
      return { outcome: state.delivery.phase, rediscoveredOnly: true, checkpoint, discovered };
    }
    if (request.resolution) return { outcome: 'held', waiting: ['no-pending-attempt'], checkpoint };
    if (state.retryScopeDigest && state.retryScopeDigest !== scopeDigest(request)) return { outcome: 'held', waiting: ['changed-original-action-request'], checkpoint };
    if (discovered.conflict || !discovered.exact || discovered.pending) { await retain(); return { outcome: 'held', waiting: [discovered.conflict ?? 'provider-state-uncertain'], checkpoint }; }
    if (discovered.confirmed) {
      const phases = { publish: 'published', 'open-pr': 'pr-open', attest: 'pr-open', merge: 'merged' };
      state.delivery = { ...state.delivery, phase: phases[action], active: null, completed: [...new Set([...state.delivery.completed, action])] }; await retain();
      return { outcome: phases[action], observedOnly: true, checkpoint, discovered };
    }
    let local = await acquire(root, request);
    need(local.payloadDigest === payloadDigest, 'Acquired evidence must describe the exact requested PR payload');
    const admission = evaluateLocalEvidence(local);
    if (!admission.eligible) { await retain(); return { outcome: 'held', waiting: admission.waiting, checkpoint }; }
    if (!(await provider.destination(b)).exact) { state.delivery = deliveryTransition(state.delivery, { kind: 'drift' }); await retain(); return { outcome: 'held', waiting: ['current-base-or-protection'], checkpoint }; }
    if (request.action === 'publish' && state.delivery.phase === 'draft') {
      for (const event of [{ kind: 'check-start' }, { kind: 'check-result', valid: true }, { kind: 'review', valid: true }, { kind: 'ready', valid: true }]) state.delivery = deliveryTransition(state.delivery, event);
    }
    if (request.action === 'merge') {
      const eligible = await provider.mergeEligibility(b, local, discovered.number);
      if (!eligible.eligible) { await retain(); return { outcome: 'held', waiting: eligible.waiting, checkpoint }; }
      state.delivery = deliveryTransition(state.delivery, { kind: 'authorize-merge', valid: true });
    }
    local = await acquire(root, request);
    need(local.payloadDigest === payloadDigest, 'Acquired evidence must describe the exact requested PR payload');
    const final = evaluateLocalEvidence(local);
    if (!final.eligible || !(await provider.destination(b)).exact) { await retain(); return { outcome: 'held', waiting: final.eligible ? ['current-base-or-protection'] : final.waiting, checkpoint }; }
    if (request.action === 'merge') {
      const eligible = await provider.mergeEligibility(b, local, discovered.number);
      if (!eligible.eligible) { await retain(); return { outcome: 'held', waiting: eligible.waiting, checkpoint }; }
    }
    const next = deliveryTransition(state.delivery, { kind: 'intent', action, valid: true });
    if (next.phase !== 'unknown') { await retain(); return { outcome: 'held', waiting: ['delivery-order'], checkpoint }; }
    state.delivery = next;
    state.payloadDigest = payloadDigest;
    state.pending = { id: randomUUID(), action, requestDigest: hash(request), scopeDigest: scopeDigest(request), payloadDigest, payload, request, retryOf: state.retryOf ?? null };
    state.retryScopeDigest = null; state.retryOf = null;
    state.history.push({ kind: 'intent', action, at: new Date().toISOString(), ...state.pending });
    await retain();
    if (!evaluateLocalEvidence({ ...local, now: Date.now() }).eligible) return { outcome: 'unknown', waiting: ['authorization-expired-before-call'], checkpoint };
    try { await provider.effect(action, request, discovered, local); }
    catch (error) { state.history.push({ kind: 'effect-error', action, at: new Date().toISOString(), status: error.status ?? null, message: error.message }); }
    try {
      const receipt = await provider.discover(action, b, state.pending.request);
      state.history.push({ kind: 'readback', action, at: new Date().toISOString(), result: receipt });
      state.delivery = deliveryTransition(state.delivery, { kind: 'observe', action, ...receipt });
    } catch (error) { state.history.push({ kind: 'readback-error', action, message: error.message }); }
    await retain();
    return { outcome: state.delivery.phase, checkpoint, assurance: 'supplied-byte-consistency-and-provider-observation' };
  } finally { await rm(lock, { recursive: true }); }
}

export async function localMain(args, env = process.env) {
  need(args.length === 1, 'Use node scripts/github-auto-merge.mjs --local <exact-request.json>');
  need(env.GITHUB_TOKEN, 'Explicit GitHub token environment required; no credential acquisition is performed');
  const request = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(await boundedFile(resolve(args[0]), 1024 * 1024)));
  return deliverLocal(process.cwd(), request, createLocalProvider(env.GITHUB_TOKEN, process.cwd()));
}
