import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { briefingTransport } from './briefing-fixtures.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blobId = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

export async function driveBriefing({ sourceRoot, root, home, run, scenario, report, children }) {
  await run(['probe', '--nonce', 'synthetic-briefing-journal-control']);
  const journalBytes = async () => {
    const files = {};
    for (const directory of await readdir(join(home, 'records'), { withFileTypes: true })) {
      assert.equal(directory.isDirectory(), true);
      for (const name of await readdir(join(home, 'records', directory.name))) files[`${directory.name}/${name}`] = sha256(await readFile(join(home, 'records', directory.name, name)));
    }
    return files;
  };
  const journalBefore = await journalBytes(); assert.ok(Object.keys(journalBefore).length >= 2);
  const preload = join(root, 'bin/briefing-fetch.mjs'); await writeFile(preload, briefingTransport);
  const bundle = await readFile(join(sourceRoot, 'docs/briefing-guidance.json'));
  const transport = { commit: 'a'.repeat(40), tree: 'd'.repeat(40), blob: blobId(bundle), bytes: bundle.toString('base64'), requests: join(home, 'briefing-requests.jsonl') };
  const transportFile = join(home, 'inbox/briefing-transport.json'); await mkdir(join(home, 'inbox'), { recursive: true });
  const env = { NODE_OPTIONS: `--import=${preload}`, EMMY_VERIFY_BRIEFING_FIXTURE: transportFile };
  const invoke = async (draft = null, expected = 0, overrides = {}, selectedHome = home) => {
    await writeFile(transportFile, JSON.stringify({ ...transport, ...overrides }));
    const args = ['briefing'];
    if (draft) { const path = join(home, 'inbox/briefing-draft.json'); await writeFile(path, Buffer.isBuffer(draft) ? draft : JSON.stringify(draft)); args.push('--file', path); }
    return run(args, expected, selectedHome, env);
  };
  const guidance = await invoke(null, 0, { advance: true });
  assert.equal(guidance.mode, 'guidance'); assert.equal(guidance.guidance.state, 'current');
  assert.equal(Object.hasOwn(guidance, 'body'), false); assert.equal(Object.hasOwn(guidance, 'status'), false);
  assert.equal(guidance.guidance.commit, transport.commit); assert.match(guidance.guidance.text, /# Emmy's operating brief/); assert.match(guidance.guidance.text, /# Check a briefing/);
  assert.deepEqual(JSON.parse(await readFile(join(guidance.guidance.snapshot, 'bundle.json'), 'utf8')), JSON.parse(bundle));
  const requests = (await readFile(transport.requests, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(requests.map(value => value.url), [`https://api.github.com/repos/jerome-queck/emmy/commits/main`, `https://api.github.com/repos/jerome-queck/emmy/git/trees/${transport.tree}?recursive=1`, `https://api.github.com/repos/jerome-queck/emmy/git/blobs/${transport.blob}`]);
  const recovered = await invoke(null, 0, { transient: true });
  assert.equal(recovered.guidance.state, 'current', 'One temporary DNS failure must recover current canonical guidance');
  const retryRequests = (await readFile(transport.requests, 'utf8')).trim().split('\n').slice(requests.length).map(line => JSON.parse(line));
  assert.equal(retryRequests.length, 4);
  const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
  const readRequests = async () => (await readFile(transport.requests, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const acquire = async (overrides, expected = 0) => {
    const before = (await readRequests()).length;
    const result = await invoke(null, expected, overrides); const trace = await readJson(result.evidence.refresh);
    const requests = (await readRequests()).slice(before);
    assert.ok(requests.length <= 4); assert.ok(trace.attempts.length <= 4);
    assert.equal(trace.deadlineMs, 10000); assert.equal(trace.retryAllowance, 1);
    assert.doesNotMatch(JSON.stringify(trace), /private transport detail|private cause detail|private remote response|private invalid JSON|private publication detail/);
    assert.equal((await readJson(result.evidence.receipt)).refreshDigest, sha256(await readFile(result.evidence.refresh)));
    return { result, trace, requests };
  };
  const recoveredTrace = await readJson(recovered.evidence.refresh);
  assert.equal(recoveredTrace.result, 'recovered'); assert.deepEqual(recoveredTrace.attempts[0].failure.causeCodes, ['EAI_AGAIN']);
  assert.deepEqual(recoveredTrace.attempts[0].failure.retry, { kind: 'retry', delayMs: 0 }); assert.equal(recoveredTrace.attempts[1].outcome, 'accepted');
  const acquisitionControls = [{ kind: 'main-recovered', evidence: recovered.evidence.refresh }];
  for (const [stage, kind, code] of [['tree', 'transport', 'ECONNRESET'], ['blob', 'transport', 'UND_ERR_SOCKET'], ['tree', 'body', 'EPIPE'], ['blob', 'body', 'ETIMEDOUT']]) {
    const recovery = await acquire({ advance: true, faults: [{ stage, attempt: 1, kind, code }] });
    assert.equal(recovery.result.guidance.state, 'current'); assert.equal(recovery.trace.result, 'recovered');
    assert.equal(recovery.requests.length, 4); assert.equal(recovery.requests.filter(value => value.url.endsWith('/commits/main')).length, 1, 'Accepted main is never resolved again after a later-stage failure');
    assert.equal(recovery.requests.filter(value => value.url.includes(stage === 'tree' ? `/git/trees/${transport.tree}` : `/git/blobs/${transport.blob}`)).length, 2);
    assert.equal(recovery.trace.pin.commit, transport.commit); assert.equal(recovery.trace.pin.tree, transport.tree); assert.equal(recovery.trace.pin.blob, transport.blob);
    const failed = recovery.trace.attempts.find(value => value.outcome === 'failed'); assert.equal(failed.stage, stage); assert.equal(failed.phase, kind === 'body' ? 'read' : 'fetch'); assert.deepEqual(failed.failure.causeCodes, [code]);
    acquisitionControls.push({ kind: `${stage}-${kind}-recovered`, evidence: recovery.result.evidence.refresh });
  }
  for (const status of [502, 503, 504]) {
    const recovery = await acquire({ faults: [{ stage: 'tree', attempt: 1, kind: 'http', status, retryAfter: '0' }] });
    assert.equal(recovery.trace.result, 'recovered'); assert.equal(recovery.trace.attempts[1].failure.httpStatus, status); assert.equal(recovery.trace.attempts[1].failure.retryAfterMs, 0);
  }
  const datedRetry = await acquire({ faults: [{ stage: 'blob', attempt: 1, kind: 'http', status: 503, retryAfter: 'Wed, 21 Oct 2015 07:28:00 GMT' }] }); assert.equal(datedRetry.trace.result, 'recovered');
  const delayedRetry = await acquire({ faults: [{ stage: 'tree', attempt: 1, kind: 'http', status: 503, retryAfter: '1' }] });
  assert.equal(delayedRetry.trace.result, 'recovered'); assert.ok(delayedRetry.trace.elapsedMs >= 900, 'A valid positive Retry-After is honored within the original deadline');
  for (const [retryAfter, reason] of [['later', 'retry-after-invalid'], ['Mon, 31 Feb 2025 00:00:00 GMT', 'retry-after-invalid'], ['11', 'retry-after-too-long']]) {
    const refused = await acquire({ faults: [{ stage: 'main', attempt: 1, kind: 'http', status: 503, retryAfter }] }, 3);
    assert.equal(refused.requests.length, 1); assert.equal(refused.trace.terminalFailure.retry.reason, reason); assert.equal(refused.trace.terminalFailure.httpStatus, 503);
    acquisitionControls.push({ kind: reason, evidence: refused.result.evidence.refresh });
  }
  const exhausted = await acquire({ faults: [{ stage: 'tree', attempt: 1, kind: 'transport', code: 'ECONNRESET' }, { stage: 'blob', attempt: 1, kind: 'transport', code: 'EAI_AGAIN' }] }, 3);
  assert.equal(exhausted.requests.length, 4); assert.equal(exhausted.trace.terminalFailure.stage, 'blob'); assert.equal(exhausted.trace.terminalFailure.retry.reason, 'allowance-used');
  const repeated = await acquire({ faults: [1, 2].map(attempt => ({ stage: 'main', attempt, kind: 'transport', code: 'EAI_AGAIN' })) }, 3);
  assert.equal(repeated.requests.length, 2); assert.equal(repeated.trace.terminalFailure.retry.reason, 'allowance-used'); assert.equal(repeated.trace.pin, null);
  for (const fault of [
    { kind: 'transport' }, { kind: 'transport', code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }, { kind: 'transport', code: 'ECONNRESET', errorName: 'AbortError' }, { kind: 'json' },
    ...[302, 401, 403, 404, 429, 500].map(status => ({ kind: 'http', status }))
  ]) {
    const refused = await acquire({ faults: [{ stage: 'main', attempt: 1, ...fault }] }, 3);
    assert.equal(refused.requests.length, 1); assert.equal(refused.trace.terminalFailure.retry.reason, 'not-transient');
  }
  scenario('briefing-guidance', 'Actual guidance-only CLI validates pinned bytes, recovers one classified failed GET or body read at its original stage, retains successful-recovery diagnostics, never repins accepted main, and refuses exhausted, unknown, permanent and Retry-After failures within the shared bound.');
  const date = offset => new Date(Date.now() - offset).toISOString();
  const cedar = { subject: 'Cedar', effect: 'complete report' }; const maple = { subject: 'Maple', effect: 'complete report' };
  const source = (id, scope, claim, kind = 'chat', contentAt = date(60000)) => ({ id, scope, reference: `synthetic:${id}`, kind, contentAt, retrievedAt: date(1000), availability: 'available', coverage: { complete: true, gaps: [] }, claim, attribution: kind === 'user' ? 'reported' : 'attributed' });
  const draft = {
    schemaVersion: 1, authoredUnder: guidance.guidance.digest,
    sources: [source('cedar-old', cedar, 'pending', 'chat', date(172800000)), source('cedar-completion', cedar, 'complete', 'user'), source('maple-current', maple, 'pending')],
    coverage: { selection: 'Synthetic Cedar and Maple chats only', catalogListed: [], chatsRead: ['cedar-old', 'maple-current'], repositoriesInspected: [], otherSourcesRead: ['cedar-completion'], gaps: ['One catalog page remains unread'] },
    correctionReadback: [{ scope: cedar, state: 'reported-readback', reference: 'opaque-note:cedar', completionSourceId: 'cedar-completion' }, { scope: maple, state: 'reported-readback', reference: 'opaque-note:maple' }],
    entries: [{ kind: 'reminder', scope: cedar, label: 'Cedar report reminder', state: 'pending', sourceIds: ['cedar-old'] }, { kind: 'reminder', scope: maple, label: 'Maple report reminder', state: 'pending', sourceIds: ['maple-current'] }]
  };
  const checked = await invoke(draft);
  assert.equal(checked.status, 'checked'); assert.match(checked.body, /Cedar, complete report\. Complete, reported by the user/); assert.match(checked.body, /Older reminder suppressed/); assert.match(checked.body, /Maple, complete report\. pending, reported/);
  assert.match(checked.body, /Repositories inspected: none/); assert.match(checked.body, /One catalog page remains unread/);
  assert.doesNotMatch(checked.body, /Unverified label|opaque(?:\\)?-note:|native recovery unverified by this checker/, 'Normal briefing keeps useful status and coverage without opaque notes or routine checker prose');
  assert.equal(sha256(checked.body), checked.bodyDigest); assert.equal(await readFile(checked.evidence.body, 'utf8'), checked.body);
  assert.equal(JSON.parse(await readFile(checked.evidence.receipt, 'utf8')).bodyDigest, checked.bodyDigest);
  report.briefing = { guidance: guidance.evidence.directory, checked: checked.evidence.directory, bodyDigest: checked.bodyDigest, acquisitionControls, sourceTruth: 'reported', nativeInvocation: 'unverified' };
  scenario('briefing-draft', 'Actual structured Cedar/Maple CLI renders scoped user completion, suppresses only Cedar, preserves Maple and exact coverage, and independently verifies returned/retained Markdown bytes and digest.');
  const markdownDestinations = body => [...body.matchAll(/\[[^\]\r\n]+\]\((?:<([^>\r\n]+)>|([^\s()]+))\)/g)].map(match => match[1] ?? match[2]);
  const references = ['https://github.com/example/project-name/issues/42', 'http://source.example.invalid/project-name/updates'];
  const linkedDraft = structuredClone(draft); linkedDraft.sources[0].reference = references[0]; linkedDraft.sources[2].reference = references[1];
  const linked = await invoke(linkedDraft);
  const destinations = markdownDestinations(linked.body);
  for (const reference of references) assert.ok(destinations.includes(reference), `Source reference must be an exact valid Markdown link destination: ${reference}`);
  assert.equal(linked.body.split('\n').find(line => line.startsWith('- Cedar,')).includes(references[0]), false, 'An older pending source cannot be presented as support for the user completion');
  for (const reference of ['https://例え.example/path/δ/[a](b)?q=a%2Fb&part=2#fragment', 'https://source.example.invalid/a<b>"quote"(part)?query=[ok]&value=%20']) {
    const safe = structuredClone(draft); safe.sources[2].reference = reference;
    const result = await invoke(safe);
    assert.ok(markdownDestinations(result.body).includes(new URL(reference).href), 'URL serialization preserves its destination without text Markdown escaping');
    assert.doesNotMatch(result.body, /\]\(javascript:|<script|<b>/i);
  }
  for (const reference of ['javascript:alert(1)', 'file:///private/example', 'https://', 'https:source.example.invalid/path', 'https://source.example.invalid\\path', ' https://source.example.invalid/path ', 'https://source.example.invalid/%zz', 'https://source.example.invalid/> [bad](javascript:alert(1))']) {
    const hostile = structuredClone(draft); hostile.sources[2].reference = reference;
    const result = await invoke(hostile); assert.deepEqual(markdownDestinations(result.body), []); assert.equal(result.body.includes(reference), false);
    assert.match(result.body, /Web links unavailable/); assert.equal((await readJson(result.evidence.assessment)).sources[2].source.reference, reference);
  }
  const exactBody = async result => {
    assert.equal(sha256(result.body), result.bodyDigest); assert.equal(await readFile(result.evidence.body, 'utf8'), result.body);
    const receipt = await readJson(result.evidence.receipt); const assessment = await readJson(result.evidence.assessment);
    assert.equal(receipt.bodyDigest, result.bodyDigest); assert.equal(receipt.assessmentDigest, sha256(await readFile(result.evidence.assessment)));
    assert.equal(receipt.refreshDigest, sha256(await readFile(result.evidence.refresh)));
    assert.equal(assessment.bodyDigest, result.bodyDigest); assert.equal(assessment.inputDigest, sha256(await readFile(join(result.evidence.directory, 'draft.json'))));
    assert.equal(assessment.guidanceDigest, result.guidance.digest ?? null); assert.equal(assessment.checkedAt, receipt.checkedAt); assert.equal(assessment.status, result.status);
  };
  const revise = await invoke({ ...draft, authoredUnder: '0'.repeat(64) }, 3);
  assert.equal(revise.status, 'revise'); assert.equal(Object.hasOwn(revise, 'body'), false); assert.equal(Object.hasOwn(revise, 'bodyDigest'), false);
  assert.equal((await readdir(revise.evidence.directory)).includes('body.md'), false); assert.match(revise.findings.join(' '), /authoredUnder/); assert.match(revise.guidance.text, /Check a briefing/);
  assert.equal((await readJson(revise.evidence.assessment)).bodyDigest, null); assert.equal((await readJson(revise.evidence.assessment)).status, 'revise');
  const foreign = structuredClone(draft); foreign.sources[0].scope = { ...cedar, effect: 'different report' };
  assert.equal((await invoke(foreign, 3)).status, 'revise');
  const broken = structuredClone(draft); broken.entries[0].sourceIds = ['absent-source'];
  assert.match((await invoke(broken, 3)).findings.join(' '), /matching scoped/);
  const wrongCorrection = structuredClone(draft); wrongCorrection.correctionReadback[0].completionSourceId = 'maple-current';
  assert.match((await invoke(wrongCorrection, 3)).findings.join(' '), /exact user completion/);
  const uncoveredCorrection = structuredClone(draft); uncoveredCorrection.coverage.otherSourcesRead = [];
  assert.match((await invoke(uncoveredCorrection, 3)).findings.join(' '), /outside declared read coverage/);
  const credential = 'https://private-user:private-password@source.example.invalid/read';
  const credentialSource = structuredClone(draft); credentialSource.sources[0].reference = credential;
  const credentialCorrection = structuredClone(draft); credentialCorrection.correctionReadback[0].reference = credential;
  const credentialEndpoint = structuredClone(draft); credentialEndpoint.sources[0].scope.endpoint = credential;
  const invalidInputs = [
    { ...draft, body: 'Unchecked arbitrary complete body' },
    { ...draft, schemaVersion: 2 },
    { ...draft, sources: [...draft.sources, draft.sources[0]] },
    { ...draft, coverage: { ...draft.coverage, chatsRead: ['cedar-old', 'cedar-old'] } },
    { ...draft, sources: [{ ...draft.sources[0], contentAt: '2026-02-30T00:00:00Z' }] },
    { ...draft, entries: [{ ...draft.entries[0], label: 'Markdown\ninjection' }] }, credentialSource, credentialCorrection, credentialEndpoint,
    Buffer.from(`{"reference":"${credential}",]`)
  ];
  const requestsBeforeInvalid = await readFile(transport.requests, 'utf8');
  const runsBeforeInvalid = await readdir(join(home, 'briefing/runs'));
  for (const invalid of invalidInputs) { const rejected = await invoke(invalid, 2); assert.ok(rejected.error); assert.doesNotMatch(JSON.stringify(rejected), /private-user|private-password/); }
  assert.equal(await readFile(transport.requests, 'utf8'), requestsBeforeInvalid, 'Invalid boundary input cannot acquire guidance or run policy');
  assert.deepEqual(await readdir(join(home, 'briefing/runs')), runsBeforeInvalid, 'Credential and other invalid inputs are refused before retaining raw drafts');
  const historical = structuredClone(draft); delete historical.correctionReadback[0].completionSourceId;
  const old = await invoke(historical); assert.match(old.body, /Cedar, complete report\. Current state unknown/); assert.match(old.body, /historical content/); assert.equal(old.body.includes('Older reminder suppressed'), false, 'Earlier briefing evidence never becomes a correction source');
  const newerMetadata = structuredClone(historical); newerMetadata.sources[0].contentAt = date(60000); newerMetadata.sources[0].metadataAt = date(1000);
  assert.match((await invoke(newerMetadata)).body, /newer metadata; latest content unverified/);
  const future = structuredClone(historical); future.sources[0].contentAt = date(-3600000);
  assert.match((await invoke(future)).body, /future content/);
  const undated = structuredClone(historical); delete undated.sources[0].contentAt;
  assert.match((await invoke(undated)).body, /content date unknown/);
  for (const availability of ['unavailable', 'denied', 'unknown']) {
    const unavailable = structuredClone(draft); unavailable.sources[2].availability = availability;
    assert.match((await invoke(unavailable)).body, new RegExp(`source ${availability}`));
  }
  const catalogOnly = structuredClone(historical); catalogOnly.sources[0].kind = 'catalog'; catalogOnly.sources[0].contentAt = date(60000); catalogOnly.coverage.chatsRead = ['maple-current']; catalogOnly.coverage.catalogListed = ['cedar-old'];
  assert.match((await invoke(catalogOnly)).body, /catalog listing does not inspect current work/);
  const partial = structuredClone(draft); partial.sources[2].coverage = { complete: false, gaps: ['Unread Maple turns'] };
  assert.match((await invoke(partial)).body, /Maple, complete report\. Current state unknown/);
  const unvisited = structuredClone(draft); unvisited.coverage.chatsRead = ['cedar-old'];
  assert.match((await invoke(unvisited)).body, /source outside declared read coverage/);
  const agedCompletion = structuredClone(draft); agedCompletion.sources[0].contentAt = date(259200000); agedCompletion.sources[1].contentAt = date(172800000);
  const aged = await invoke(agedCompletion); assert.match(aged.body, /Older reminder suppressed/); assert.match(aged.body, /Maple, complete report\. pending, reported/);
  const contrary = structuredClone(draft); contrary.sources.push(source('cedar-contrary', cedar, 'pending', 'native', date(5000))); contrary.coverage.otherSourcesRead.push('cedar-contrary');
  const conflict = await invoke(contrary); assert.match(conflict.body, /Conflict\. User-reported complete/); assert.match(conflict.body, /Next check: read/); assert.equal(conflict.body.includes('Older reminder suppressed'), false);
  const conflictAssessment = await readJson(conflict.evidence.assessment); assert.deepEqual(conflictAssessment.entries[0].decision, { kind: 'conflict', completionSourceId: 'cedar-completion', contrarySourceIds: ['cedar-contrary'] });
  assert.ok(conflictAssessment.sources.some(value => value.source.reference === 'synthetic:cedar-completion')); assert.ok(conflictAssessment.sources.some(value => value.source.reference === 'synthetic:cedar-contrary'));
  const unrelated = structuredClone(draft); const invoiceScope = { ...cedar, effect: 'complete invoice' }; unrelated.sources.push(source('cedar-invoice', invoiceScope, 'pending')); unrelated.coverage.chatsRead.push('cedar-invoice'); unrelated.entries.push({ kind: 'reminder', scope: invoiceScope, label: 'Separate invoice', state: 'pending', sourceIds: ['cedar-invoice'] }); unrelated.correctionReadback.push({ scope: invoiceScope, state: 'reported-readback', reference: 'opaque-note:invoice' });
  assert.match((await invoke(unrelated)).body, /Cedar, complete invoice\. pending, reported/);
  const conversationOnly = structuredClone(draft); conversationOnly.correctionReadback[0].state = 'conversation-only'; delete conversationOnly.correctionReadback[0].reference;
  const conversation = await invoke(conversationOnly, 3); assert.equal(conversation.status, 'degraded'); assert.match(conversation.body, /Older reminder suppressed/); assert.match(conversation.body, /conversation-only; persistence unverified/);
  const unrecovered = structuredClone(draft); unrecovered.correctionReadback[0] = { scope: cedar, state: 'unavailable' };
  const recovery = await invoke(unrecovered, 3); assert.equal(recovery.status, 'degraded'); assert.match(recovery.body, /Correction recovery unavailable/);
  const scoped = structuredClone(draft);
  for (const [id, endpoint, operation, state] of [['remote', 'https://service.example.invalid', 'read', 'working'], ['loopback', 'http://127.0.0.1', 'diagnose', 'authentication-required'], ['untested', 'https://other.example.invalid', 'write', 'untested']]) {
    const capabilityScope = { subject: 'Synthetic service', effect: 'access', operation, executor: 'local-codex', host: 'Synthetic Mac', endpoint };
    scoped.sources.push(source(id, capabilityScope, state, 'native')); scoped.coverage.otherSourcesRead.push(id); scoped.entries.push({ kind: 'capability', scope: capabilityScope, label: id, state, sourceIds: [id] });
  }
  for (const [id, state, offset] of [['old-budget', 'notice', 172800000], ['current-alert', 'alert', 60000]]) {
    const budgetScope = { subject: id, effect: 'budget status' }; scoped.sources.push(source(id, budgetScope, state, 'budget', date(offset))); scoped.coverage.otherSourcesRead.push(id); scoped.entries.push({ kind: 'budget', scope: budgetScope, label: id, state, sourceIds: [id] });
  }
  const capabilities = await invoke(scoped); assert.match(capabilities.body, /operation read.*working, reported/); assert.match(capabilities.body, /operation diagnose.*Access blocked by authentication, reported/); assert.match(capabilities.body, /operation write.*Untested/); assert.match(capabilities.body, /old\\-budget.*Current state unknown/); assert.match(capabilities.body, /Current alert reported\. A notice or alert does not establish a spending stop/);
  const misleadingLabel = structuredClone(historical); misleadingLabel.entries[0].label = 'Current and complete, all projects verified';
  const misleading = await invoke(misleadingLabel); assert.match(misleading.body, /Cedar, complete report\. Current state unknown/); assert.doesNotMatch(misleading.body, /Current and complete|all projects verified/);
  assert.equal((await readJson(misleading.evidence.assessment)).entries[0].entry.label, misleadingLabel.entries[0].label);
  const seed = await invoke(draft); await exactBody(seed); assert.equal(seed.body, checked.body, 'Unchanged inputs render identical Markdown in a fresh process');
  const fallback = await invoke(draft, 3, { unavailable: true });
  assert.equal(fallback.status, 'degraded'); assert.equal(fallback.guidance.state, 'cached'); assert.equal(fallback.guidance.sourceCheckedAt, seed.guidance.sourceCheckedAt); assert.equal(fallback.guidance.snapshot, seed.guidance.snapshot); await exactBody(fallback);
  const firstRun = await invoke(draft, 3, { unavailable: true }, join(home, 'briefing/test-homes/first-run'));
  assert.equal(firstRun.guidance.state, 'unavailable'); assert.match(firstRun.body, /Current guidance is unavailable/); await exactBody(firstRun);
  const bundleOverride = mutate => {
    const value = JSON.parse(bundle); mutate(value); const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); return { blob: blobId(bytes), bytes: bytes.toString('base64') };
  };
  for (const [override, expectedError] of [
    [{ corruptBytes: true }, /byte\/identity mismatch/],
    [{ missing: true }, /does not contain/],
    [{ duplicatePath: true }, /Duplicate pinned tree path/],
    [{ oversized: true }, /exceeds 1048576/],
    [bundleOverride(value => { value.documents[0].text += 'Unexpected changed bytes'; }), /byte\/digest mismatch/],
    [bundleOverride(value => { value.documents[1].path = value.documents[0].path; }), /Duplicate or unexpected guidance path/]
  ]) {
    const control = await acquire(override, 3); const refused = control.result;
    assert.equal(refused.guidance.state, 'cached'); assert.match(refused.guidance.refreshError, expectedError); assert.equal(refused.guidance.snapshot, seed.guidance.snapshot);
    assert.equal(control.trace.terminalFailure.retry.reason, 'not-transient'); assert.equal(control.trace.attempts.every(value => value.attempt === 1), true, 'Integrity and size failures never retry');
  }
  const publication = await acquire({ publicationFailure: true }, 3);
  assert.equal(publication.requests.length, 3); assert.equal(publication.trace.terminalFailure.stage, 'publish'); assert.equal(publication.trace.terminalFailure.retry.reason, 'not-transient'); assert.deepEqual(publication.trace.terminalFailure.causeCodes, ['ENOSPC']);
  for (const key of ['schemaVersion', 'checkerVersion']) {
    const upgrade = await invoke(null, 3, bundleOverride(value => { value[key] = 2; })); assert.equal(upgrade.guidance.state, 'cached'); assert.equal(upgrade.guidance.upgradeRequired, true); assert.match(upgrade.guidance.refreshError, /checker upgrade/);
  }
  assert.equal((await invoke(null, 3, bundleOverride(value => { value.schemaVersion = 2; value.newSchemaField = true; }))).guidance.upgradeRequired, true);
  assert.match((await invoke(draft, 3, bundleOverride(value => { value.checkerVersion = 2; }))).body, /Upgrade the installed checker/);
  const duplicateBytes = Buffer.from(bundle.toString('utf8').replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,'));
  assert.match((await invoke(null, 3, { blob: blobId(duplicateBytes), bytes: duplicateBytes.toString('base64') })).guidance.refreshError, /duplicate fields/);
  const timed = await acquire({ timeout: true, timeoutStage: 'tree', faults: [{ stage: 'main', attempt: 1, kind: 'delay', delayMs: 6500 }] }, 3);
  const timeout = timed.result; assert.equal(timeout.guidance.state, 'cached'); assert.equal(timeout.guidance.sourceCheckedAt, seed.guidance.sourceCheckedAt);
  assert.equal(timed.requests.length, 2); assert.equal(timed.trace.terminalFailure.stage, 'tree'); assert.equal(timed.trace.terminalFailure.retry.reason, 'deadline'); assert.ok(timed.trace.elapsedMs >= 9000 && timed.trace.elapsedMs < 14000, 'Later stages share the original ten-second deadline');
  const checkpoint = join(home, 'briefing-interrupt.json');
  await writeFile(transportFile, JSON.stringify({ ...transport, commit: 'e'.repeat(40), interrupt: checkpoint }));
  const childArgs = [join(sourceRoot, 'scripts/agent.mjs'), 'briefing', '--root', root, '--home', home];
  const child = spawn(process.execPath, childArgs, { env: { ...process.env, ...env } }); children.add(child);
  const captured = { args: childArgs.slice(1), kind: 'briefing-cache-publication-cancellation', stdout: '', stderr: '' };
  child.stdout.on('data', bytes => { captured.stdout += bytes; }); child.stderr.on('data', bytes => { captured.stderr += bytes; });
  const completion = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code, signal) => { children.delete(child); resolve({ ...captured, code, signal }); }); });
  try {
    const deadline = Date.now() + 5000; let marker;
    while (!marker && Date.now() < deadline) {
      try { const bytes = await readFile(checkpoint, 'utf8'); if (bytes.endsWith('\n')) marker = JSON.parse(bytes); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!marker) await setTimeout(10);
    }
    assert.ok(marker, 'Actual cache publication reached its pre-rename checkpoint');
    assert.equal(blobId(await readFile(join(marker.source, 'bundle.json'))), transport.blob); await assert.rejects(readFile(join(marker.destination, 'bundle.json')), { code: 'ENOENT' });
    child.kill('SIGKILL'); const output = await completion; report.commands.push(output); assert.equal(output.signal, 'SIGKILL');
    const afterInterruption = await invoke(null, 3, { unavailable: true }); assert.equal(afterInterruption.guidance.snapshot, seed.guidance.snapshot); assert.equal(afterInterruption.guidance.sourceCheckedAt, seed.guidance.sourceCheckedAt);
    report.briefing.interruption = { marker, signal: output.signal, fallback: afterInterruption.guidance.snapshot };
  } finally { if (children.has(child)) { child.kill('SIGKILL'); await completion; } }
  const corruptSeed = await invoke(null); await writeFile(join(corruptSeed.guidance.snapshot, 'bundle.json'), 'corrupt cached bytes');
  const afterCorrupt = await invoke(null, 3, { unavailable: true }); assert.equal(afterCorrupt.guidance.snapshot, seed.guidance.snapshot); assert.equal(afterCorrupt.guidance.sourceCheckedAt, seed.guidance.sourceCheckedAt);
  const corruptHome = join(home, 'briefing/test-homes/corrupt-only'); const onlyCache = await invoke(null, 0, {}, corruptHome); await writeFile(join(onlyCache.guidance.snapshot, 'receipt.json'), '{}');
  assert.equal((await invoke(null, 3, { unavailable: true }, corruptHome)).guidance.state, 'unavailable');
  assert.deepEqual(await journalBytes(), journalBefore, 'Advisory command never changes responsibility record or retained evidence bytes');
  for (const result of [old, aged, conflict, conversation, recovery, capabilities, fallback]) await exactBody(result);
  report.briefing.negativeControls = { revise: revise.evidence.directory, historical: old.evidence.directory, conflict: conflict.evidence.directory, capabilities: capabilities.evidence.directory, cached: fallback.evidence.directory, firstRun: firstRun.evidence.directory, nativeExecution: 'not invoked', journalChanged: false };
  scenario('briefing-boundaries', 'Actual CLI controls reject wrong digest/references/schema and arbitrary bodies; qualify stale/future/partial/undated support and newer metadata; retain scoped completion across aging, conflict and capability distinctions; enforce blob/embedded integrity, upgrade refusal, byte/time limits, interrupted/corrupt cache fallback, first-run degradation and unchanged journal.');
}
