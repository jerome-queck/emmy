import { canonical, digest } from '../../src/content.mjs';
import { registerFixture, bindRegister } from '../calendar-register-fixtures.mjs';
import { academicOsPlanFixture } from '../academic-os-plan-fixtures.mjs';

export const hash = value => digest(canonical(value));
export const at = '2026-10-27T00:00:00.000Z';
export function planningBundle(now = at, source = '*') {
  const from = new Date(Date.parse(now) - 86400000).toISOString();
  const until = new Date(Date.parse(now) + 172800000).toISOString();
  return { schemaVersion: 1, policyId: 'synthetic-booking-policy', revision: 1, recordedAt: from, timeZone: 'UTC', sources: [{ id: 'owner-one', ownerRef: 'synthetic-owner', observedAt: from, evidenceRef: 'synthetic-scoped-owner-instruction' }], rules: [{ id: 'rounded-booking', revision: 1, sourceRefs: ['owner-one'], scope: { environment: 'synthetic', accountId: 'owner@example.test', source, operations: ['create', 'change', 'complete', 'replan'] }, strength: 'hard', predicate: 'booking-rounded-up', parameters: { minimumMinutes: 30, incrementMinutes: 30 }, effectiveFrom: from, effectiveUntil: until, supersedes: [], priority: 0 }] };
}
export function planningContext(now = at) {
  return { environment: 'synthetic', accountId: 'owner@example.test', source: 'synthetic-source-file', occurrenceId: 'source-one-occurrence-one', operationId: 'synthetic-operation', operation: 'change', evaluatedAt: now, maxEvidenceAgeMs: 60000, window: { start: now, end: new Date(Date.parse(now) + 3600000).toISOString() }, timingFieldsAbsent: false, timing: { kind: 'booking', actualDurationMinutes: 40, scheduledDurationMinutes: 60 } };
}
export function nonTiming(context, reason = context.operation === 'create' ? 'undated-create' : context.operation === 'complete' ? 'completion-only' : 'title-only') {
  return { kind: 'not-applicable', reason, operationId: context.operationId, occurrenceId: context.occurrenceId, environment: context.environment, accountId: context.accountId, observedAt: context.evaluatedAt, evidenceRef: 'synthetic-exact-operation-no-booking-intent' };
}
export function versionedNative(now = at) {
  const input = registerFixture(now);
  input.request.policy.schemaVersion = 2; input.request.policy.planning = planningBundle(now);
  input.snapshot.policy = structuredClone(input.request.policy);
  return bindRegister(input);
}
export function versionedApi(name = 'change', now = at, kind = 'module') {
  const input = academicOsPlanFixture(name, now, kind);
  input.intent.schemaVersion = 2; input.intent.policy.schemaVersion = 2; input.intent.policy.planning = planningBundle(now);
  input.intent.timing = nonTiming({ ...planningContext(now), operationId: input.intent.operationId, occurrenceId: input.intent.source.occurrenceId, operation: name });
  input.observation.policy = structuredClone(input.intent.policy);
  return input;
}
export function nextRule(bundle, mutate = () => {}) {
  const prior = bundle.rules[0];
  const next = structuredClone(prior); next.revision++; next.supersedes = [{ id: prior.id, revision: prior.revision, digest: hash(prior) }]; mutate(next);
  bundle.rules.push(next); return next;
}
