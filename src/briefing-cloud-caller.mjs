import { canonical, digest } from './records.mjs';
import { assessBriefingReporting } from './briefing-reporting.mjs';
import { validateBriefingPolicy } from './briefing-policy.mjs';
import { strictJson } from './bounded-json.mjs';
import { verifiedPriorBriefingFacts } from './morning.mjs';
import { randomUUID } from 'node:crypto';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => canonical(a) === canonical(b);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2000;
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export async function retainBriefingInvocation(request, adapters) {
  need(text(request?.runKey) && (request.providerInvocationId === null || text(request.providerInvocationId)) && typeof adapters.readInvocation === 'function' && typeof adapters.retainInvocation === 'function', 'Stable run key and durable invocation metadata adapter required');
  const validate = value => need(value && text(value.id) && ['provider', 'producer-generated'].includes(value.source) && (value.source !== 'producer-generated' || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.id)), 'Retained provider identity or labelled UUID required');
  const prior = await adapters.readInvocation(request.runKey);
  if (prior) { validate(prior); need(request.providerInvocationId === null || prior.source !== 'provider' || prior.id === request.providerInvocationId, 'Retained invocation crosses actual provider run'); return prior; }
  const candidate = { id: request.providerInvocationId ?? randomUUID(), source: request.providerInvocationId === null ? 'producer-generated' : 'provider' };
  const retained = await adapters.retainInvocation(request.runKey, candidate);
  validate(retained); need(request.providerInvocationId === null || retained.id === request.providerInvocationId, 'Concurrent retained invocation must be rediscovered before effects');
  return retained;
}
const extract = (object, path) => {
  need(typeof path === 'string' && (path === '' || path.startsWith('/')), 'Exact JSON extraction pointer required');
  let value = object;
  for (const key of path === '' ? [] : path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) { need(!['__proto__', 'constructor', 'prototype'].includes(key) && value && Object.hasOwn(value, key), 'Missing provider extraction field'); value = value[key]; }
  return value;
};
export function projectBriefingPage(payload, projection, metadata) {
  need(projection && ['gmail-readonly-page-v1', 'outlook-ui-page-v1'].includes(projection.contract), 'Supported source extraction contract required');
  const items = extract(payload, projection.itemsPointer); const cursor = extract(payload, projection.cursorPointer);
  need(Array.isArray(items) && (cursor === null || text(cursor)), 'Provider items and explicit terminal cursor required');
  const sourceClock = projection.observedAtPointer === null ? null : extract(payload, projection.observedAtPointer);
  const observedAt = sourceClock ?? metadata.startedAt;
  need(stamp(observedAt), 'Actual source clock or declared current read-start observation required');
  let unreadPreserved;
  if (projection.contract === 'gmail-readonly-page-v1') { need(metadata.role === 'gmail', 'Read-only Gmail contract cannot normalize another adapter'); unreadPreserved = true; }
  else { need(metadata.role === 'outlook', 'Outlook UI contract cannot normalize another adapter'); const before = extract(payload, projection.unreadBeforePointer); const after = extract(payload, projection.unreadAfterPointer); need(typeof before === 'boolean' && typeof after === 'boolean', 'Explicit boolean Outlook unread evidence required'); unreadPreserved = before === after; }
  const complete = projection.completePointer ? extract(payload, projection.completePointer) : payload.complete;
  need(typeof complete === 'boolean', 'Explicit provider coverage must be boolean');
  return { items, nextCursor: cursor, observedAt, observationBasis: sourceClock === null ? 'current-read-start' : 'original-provider-clock', complete, unreadPreserved };
}
async function retain(response, metadata, adapters) {
  need(response && (Buffer.isBuffer(response.raw) || typeof response.raw === 'string'), 'Caller must expose original serialized response bytes');
  const bytes = Buffer.from(response.raw);
  const kept = await adapters.retainRaw(bytes, { ...metadata, projection: response.projection ?? null, sha256: digest(bytes), byteCount: bytes.length });
  need(kept?.sha256 === digest(bytes) && kept.byteCount === bytes.length && text(kept.sourceRef), 'Raw retention must acknowledge exact bytes before parsing');
  try {
    const parsed = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    need(parsed?.isError !== true, 'Provider tool error cannot establish complete acquisition');
    let value = parsed;
    if (parsed.structuredContent !== undefined) value = parsed.structuredContent;
    else if (Array.isArray(parsed.content)) {
      need(parsed.content.length === 1 && parsed.content[0].type === 'text', 'Tool response needs one supported exact JSON payload');
      value = strictJson(parsed.content[0].text);
    }
    if (response.projection) value = projectBriefingPage(value, response.projection, metadata);
    need(response.value === undefined || same(response.value, value), 'Structured tool value differs from retained raw response');
    return { response: value, raw: kept };
  } catch (error) { error.retainedRaw = kept; throw error; }
}

export async function acquireBriefingSource(request, adapters) {
  need(request?.schemaVersion === 1 && ['gmail', 'outlook', 'calendar', 'tasks', 'reporting'].includes(request.role) && text(request.account) && request.environment === 'dot-cloud', 'Cloud-only exact source request required');
  need(request.surface === (request.role === 'outlook' ? 'browser' : request.role === 'reporting' ? 'bridge' : 'connector'), 'School Outlook must use cloud UI; reporting must use actual bridge');
  if (['gmail', 'outlook'].includes(request.role)) { validateBriefingPolicy(adapters.policy); need(request.account === adapters.policy.accounts[request.role].account, 'Source account differs from pinned primary mailbox'); }
  need(Number.isSafeInteger(request.maxReads) && request.maxReads > 0 && request.maxReads <= 100 && Number.isSafeInteger(request.maxBytes) && request.maxBytes > 0 && request.maxBytes <= 4194304, 'Finite read/byte budgets required');
  need(typeof adapters?.read === 'function' && typeof adapters.retainRaw === 'function' && typeof adapters.completeAcquisition === 'function', 'Supported caller read, raw retention and acquisition accounting required');
  if (request.role === 'reporting') {
    need(text(request.admission?.requestId) && request.admission.owner === 'LC1' && request.admission.sourceId === 'canonical-automation-report-records' && typeof adapters.claimAdmission === 'function', 'Only fresh canonical LC1 ticket admits reporting reads');
    const claimed = await adapters.claimAdmission(request.admission);
    const claim = claimed?.data ?? claimed; const ticket = claim.ticket;
    need(claim.outcome === 'admitted' && ticket && ticket.status === 'attempted' && text(ticket.ticket) && ticket.input?.id === request.admission.requestId && ticket.input.entityIds?.includes(request.admission.sourceId) && ticket.attemptReads === 0 && ticket.attemptBytes === 0 && stamp(ticket.deadline) && ticket.deadline >= adapters.now() && request.maxReads <= ticket.remainingReads && request.maxBytes <= ticket.remainingBytes, 'Null, replayed, expired, mismatched or insufficient canonical ticket forbids new reads');
    request = { ...request, admission: { ...request.admission, ticket: ticket.ticket, deadline: ticket.deadline } };
  }
  const responses = []; const cursors = new Set(); let cursor = null; let reads = 0; let bytes = 0; let complete = false; let pagesComplete = true; let failure = null; let awaitingRaw = false;
  try {
    while (reads < request.maxReads) {
      const startedAt = adapters.now(); need(stamp(startedAt), 'Actual source start clock required');
      need(!request.admission?.deadline || startedAt <= request.admission.deadline, 'Admitted read ticket expired');
      reads++; awaitingRaw = true; const response = await adapters.read({ ...request, cursor });
      need(response && (typeof response.raw === 'string' || Buffer.isBuffer(response.raw)), 'Missing actual raw response bytes');
      bytes += Buffer.byteLength(response.raw); awaitingRaw = false;
      const capturedAt = adapters.now(); need(stamp(capturedAt) && startedAt <= capturedAt, 'Actual raw acquisition clock required');
      const retained = await retain(response, { role: request.role, startedAt, capturedAt, requestId: request.admission?.requestId ?? null, ticket: request.admission?.ticket ?? null, cursor }, adapters);
      responses.push({ ...retained, startedAt, capturedAt });
      if (bytes > request.maxBytes) { failure = 'measured-byte-budget-overrun'; break; }
      const page = retained.response;
      if (request.purpose === 'check-progress') { need(request.role === 'reporting' && page.requestId === request.targetRequestId && page.attemptId === request.targetAttemptId, 'Progress read crossed the same admitted check'); complete = true; break; }
      need(page && stamp(page.observedAt) && page.observedAt <= capturedAt && typeof page.complete === 'boolean' && (page.nextCursor === null || text(page.nextCursor)), 'Provider page must retain original source clock, coverage and cursor');
      if (request.role === 'outlook' || request.role === 'gmail') need(page.unreadPreserved === true, 'Mail read did not establish original unread preservation');
      pagesComplete = pagesComplete && page.complete;
      if (page.nextCursor === null) { cursor = null; complete = pagesComplete; break; }
      need(!cursors.has(page.nextCursor), 'Repeated provider cursor'); cursors.add(page.nextCursor); cursor = page.nextCursor;
    }
    if (!complete && !failure) failure = reads === request.maxReads && cursor !== null ? 'read-budget-exhausted' : 'partial-provider-coverage';
  } catch (error) { failure = error.message; if (error.retainedRaw) responses.push({ response: null, raw: error.retainedRaw, parseFailure: error.message }); }
  const result = { schemaVersion: 1, role: request.role, account: request.account, environment: request.environment, surface: request.surface, requestId: request.admission?.requestId ?? null, ticket: request.admission?.ticket ?? null, reads, bytes: awaitingRaw ? null : bytes, knownBytesLowerBound: bytes, complete, failure, responses, delivery: 'unverified', sourceCompleteness: 'selected-request-only' };
  const accounting = await adapters.completeAcquisition(result);
  if (request.role === 'reporting') {
    const accepted = accounting?.data ?? accounting;
    if (accepted?.outcome !== 'completed' || !accepted.state?.jobs?.some(job => job.ticket === result.ticket && job.status === 'completed')) return { ...result, complete: false, failure: 'canonical-acquisition-not-completed', accountingOutcome: accepted?.outcome ?? null };
  }
  return result;
}

export async function awaitBriefingChecks(initial, adapters, { signal } = {}) {
  let results = structuredClone(initial);
  for (;;) {
    const assessed = assessBriefingReporting({ action: 'checks', asOf: adapters.now(), results });
    if (assessed.readyForBriefing) return assessed;
    if (assessed.follow.length === 0) return { ...assessed, acquisitionRequired: assessed.acquisitionRequired, completeBriefingAllowed: false };
    if (signal?.aborted) return { ...assessed, interrupted: true, completeBriefingAllowed: false };
    for (const follow of assessed.follow) {
      await adapters.pace(follow);
      if (signal?.aborted) return { ...assessed, interrupted: true, completeBriefingAllowed: false };
      need(typeof adapters.checkRequest === 'function', 'Pending progress requires an existing LC1 bounded acquisition request');
      const request = await adapters.checkRequest(follow);
      if (!request) return { ...assessed, awaitingAdmission: true, completeBriefingAllowed: false };
      need(request.role === 'reporting' && request.purpose === 'check-progress' && request.targetRequestId === follow.requestId && request.targetAttemptId === follow.attemptId && request.maxReads === 1, 'Progress must follow same check through one bounded canonical read');
      const acquired = await acquireBriefingSource(request, adapters);
      if (!acquired.complete) return { ...assessed, acquisition: acquired, completeBriefingAllowed: false };
      const next = acquired.responses[0].response;
      need(next.requestId === follow.requestId && next.attemptId === follow.attemptId, 'Check continuation crossed admitted request');
      const previous = results.find(row => row.attemptId === follow.attemptId);
      need(previous && next.kind === previous.kind && next.scheduledFor === previous.scheduledFor, 'Check continuation changed occurrence identity');
      results = results.map(row => row.attemptId === next.attemptId ? next : row);
    }
  }
}

export async function executeBriefingEffect(request, adapters) {
  const envelope = request?.envelope; const command = envelope?.action?.command;
  need(request?.schemaVersion === 1 && envelope?.action?.operation === 'morning' && ['send-intent', 'edit-intent', 'action-intent'].includes(command?.step), 'Exact existing morning effect intent required');
  need(request.pilotAuthority?.accepted === true && text(request.pilotAuthority.sourceRef) && request.pilotAuthority.environment === 'dot-cloud', 'Parent-supervised pilot authority required; implementation grants none');
  need(typeof adapters?.fleet === 'function' && typeof adapters.retainRaw === 'function', 'Actual existing fleet CLI/bridge adapter and durable raw sink required');
  if (command.step === 'action-intent' && command.action === 'archive' && typeof adapters.chatgpt?.edit !== 'function') {
    const status = await adapters.fleet({ schemaVersion: 1, responsibilityId: envelope.responsibilityId, expectedHead: envelope.expectedHead, action: { operation: 'status' }, evidence: [] });
    const view = status?.data ?? status; const run = view.state?.morningRuns?.find(row => row.id === command.runId); const item = run?.items.find(row => row.adapter === command.adapter && row.before.nativeId === command.nativeId);
    if (!run || !item || !verifiedPriorBriefingFacts(view.state, run, item)) return { status: 'deferred', effects: 0, reason: 'Same-message edits unavailable; new archive facts remain pending until a later run verifies exact prior delivery' };
  }
  const committed = await adapters.fleet(envelope);
  const state = committed?.data ?? committed;
  if (state.outcome !== 'morning-retained' || !/^[a-f0-9]{64}$/.test(envelope.expectedHead ?? '') || !/^[a-f0-9]{64}$/.test(state.headHash ?? '') || state.headHash === envelope.expectedHead) return { status: 'rediscover-only', effects: 0, reason: 'Repeated or unresolved journal publication never grants another effect' };
  const run = state.state?.morningRuns?.find(row => row.id === command.runId);
  need(run?.policyVersion === 3 && state.state.morningMigration && run.policy && same(run.deliveryTarget, run.policy.delivery), 'Accepted v3 migration and sole existing journal owner required');
  const scope = run.deliveryTarget.scope;
  need(scope.service === 'chatgpt' && scope.environment === 'dot-cloud' && scope.surface === 'native', 'Only configured ChatGPT room is authorized');
  let tool; let parameters;
  if (command.step === 'send-intent') {
    need(run.delivery?.status === 'uncertain' && run.delivery.sendRef === command.sendRef && run.sealed.bodyDigest === command.bodyDigest && digest(run.sealed.body) === command.bodyDigest, 'Committed exact send intent required');
    tool = adapters.chatgpt?.send; parameters = { channel: 'chatgpt', room: scope.resource, body: run.sealed.body, sendRef: command.sendRef };
  } else if (command.step === 'edit-intent') {
    need(run.summary?.delivery?.status === 'uncertain' && run.summary.delivery.editRef === command.editRef && run.delivery?.nativeId === command.nativeId && run.summary.bodyDigest === command.bodyDigest, 'Committed exact same-message edit intent required');
    tool = adapters.chatgpt?.edit; parameters = { channel: 'chatgpt', room: scope.resource, nativeId: command.nativeId, body: run.summary.body, editRef: command.editRef };
  } else {
    const item = run.items.find(row => row.adapter === command.adapter && row.before.nativeId === command.nativeId); const intent = item?.attempts.at(-1);
    need(intent?.status === 'uncertain' && same(intent.before, command.before) && intent.action === command.action && same(intent.destination, command.destination), 'Committed exact mail intent required');
    need(command.adapter !== 'outlook' || run.accounts.outlook && item.receipt.scope.environment === 'dot-cloud' && item.receipt.scope.surface === 'browser', 'School mail effects require cloud Outlook UI');
    tool = command.adapter === 'gmail' ? adapters.gmail?.move : adapters.outlookUI?.move;
    parameters = { account: run.accounts[command.adapter].account, nativeId: command.nativeId, before: command.before, action: command.action, destination: command.destination, preserveUnread: command.before.unread };
  }
  if (typeof tool !== 'function') return { status: 'unavailable', effects: 0, intent: 'uncertain', next: 'Reconcile exact intent before any retry; supported adapter unavailable' };
  try {
    const called = await tool(parameters);
    const retained = await retain(called, { kind: command.step, runId: run.id, capturedAt: adapters.now() }, adapters);
    return { status: 'accepted-unverified', effects: 1, intent: 'uncertain', raw: retained.raw, response: retained.response, next: 'Independently reopen same exact native ID, retain raw bytes and acknowledge through existing fleet command' };
  } catch (error) {
    return { status: 'uncertain', effects: 'unknown', intent: 'uncertain', reason: error.message, next: 'Rediscover same retained identity; never repeat send or move' };
  }
}
