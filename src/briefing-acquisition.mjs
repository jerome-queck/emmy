import { canonical, digest } from './content.mjs';
import { assessBriefingReporting } from './briefing-reporting.mjs';
import { validateBriefingPolicy } from './briefing-policy.mjs';
import { parseBriefingToolBytes, normalizeBriefingSource, projectBriefingPage } from './briefing-source-normalization.mjs';
import { randomUUID } from 'node:crypto';
import { calendarObservationClock } from './briefing-observation.mjs';

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
export async function retainBriefingResponse(response, metadata, adapters) {
  need(response && (Buffer.isBuffer(response.raw) || typeof response.raw === 'string'), 'Caller must expose original serialized response bytes');
  const bytes = Buffer.from(response.raw);
  const kept = await adapters.retainRaw(bytes, { ...metadata, projection: response.projection ?? null, sha256: digest(bytes), byteCount: bytes.length });
  need(kept?.sha256 === digest(bytes) && kept.byteCount === bytes.length && text(kept.sourceRef), 'Raw retention must acknowledge exact bytes before parsing');
  try {
    let value = parseBriefingToolBytes(bytes);
    if (response.projection) value = projectBriefingPage(value, response.projection, metadata);
    need(response.value === undefined || same(response.value, value), 'Structured tool value differs from retained raw response');
    return { response: value, raw: kept };
  } catch (error) { error.retainedRaw = kept; throw error; }
}

export async function acquireBriefingSource(request, adapters) {
  need(request?.schemaVersion === 1 && ['gmail', 'outlook', 'calendar', 'tasks', 'reporting'].includes(request.role) && text(request.account) && request.environment === 'dot-cloud', 'Cloud-only exact source request required');
  need((request.role === 'tasks' ? ['browser', 'connector'] : [request.role === 'outlook' ? 'browser' : request.role === 'reporting' ? 'bridge' : 'connector']).includes(request.surface), 'School Outlook must use cloud UI; reporting must use actual bridge');
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
      const retained = await retainBriefingResponse(response, { role: request.role, sourceRequest: request, startedAt, capturedAt, requestId: request.admission?.requestId ?? null, ticket: request.admission?.ticket ?? null, cursor }, adapters);
      responses.push({ ...retained, startedAt, capturedAt });
      if (bytes > request.maxBytes) { failure = 'measured-byte-budget-overrun'; break; }
      const page = retained.response;
      if (request.purpose === 'check-progress') { need(request.role === 'reporting' && page.requestId === request.targetRequestId && page.attemptId === request.targetAttemptId, 'Progress read crossed the same admitted check'); complete = true; break; }
      const pageClock = request.role === 'calendar' && Object.hasOwn(page ?? {}, 'collectorObservation') ? calendarObservationClock(page, capturedAt) : page?.observedAt;
      need(page && stamp(pageClock) && pageClock <= capturedAt && typeof page.complete === 'boolean' && (page.nextCursor === null || text(page.nextCursor)), 'Provider page must retain original source clock or explicit collector observation, coverage and cursor');
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

export async function acquireBriefingPlanSource(request, adapters) {
  need(['gmail', 'outlook', 'calendar', 'tasks'].includes(request?.role) && typeof adapters?.readRaw === 'function', 'Compiler source acquisition requires exact retained-byte readback');
  const acquisition = await acquireBriefingSource(request, adapters);
  const rawPages = [];
  for (const page of acquisition.responses) rawPages.push(await adapters.readRaw(page.raw));
  return { acquisition, source: normalizeBriefingSource(acquisition, rawPages) };
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
