import { planningBundle, planningContext, versionedNative, versionedApi, nextRule, nonTiming, at } from './fixtures.mjs';

export function planningCases() {
  const cases = [];
  const add = (name, mutate, expected, extra = {}) => { const bundle = planningBundle(); const context = planningContext(); mutate(bundle, context); cases.push({ name, caller: 'pure', bundle, context, expected, ...extra }); };
  for (const actual of [1, 29, 30, 31, 40, 59, 60, 61, 1439, 1440]) for (const scheduled of [29, 30, 60, 90, 1440]) {
    const expected = scheduled >= 30 && scheduled % 30 === 0 && scheduled === Math.floor((actual + 29) / 30) * 30;
    add(`round-${actual}-${scheduled}`, (_, context) => { Object.assign(context.timing, { actualDurationMinutes: actual, scheduledDurationMinutes: scheduled }); }, expected, { rounding: { actual, scheduled } });
  }
  add('unknown-applicable', bundle => { const extra = structuredClone(bundle.rules[0]); extra.id = 'unsupported'; extra.predicate = 'unimplemented'; bundle.rules.push(extra); }, false);
  add('unknown-outside-source', bundle => { const extra = structuredClone(bundle.rules[0]); extra.id = 'unsupported'; extra.predicate = 'unimplemented'; extra.scope.source = 'different-source'; bundle.rules.push(extra); }, true);
  add('unknown-outside-account', bundle => { const extra = structuredClone(bundle.rules[0]); extra.id = 'unsupported'; extra.predicate = 'unimplemented'; extra.scope.accountId = 'different@example.test'; bundle.rules.push(extra); }, true);
  add('unknown-outside-operation', bundle => { const extra = structuredClone(bundle.rules[0]); extra.id = 'unsupported'; extra.predicate = 'unimplemented'; extra.scope.operations = ['complete']; bundle.rules.push(extra); }, true);
  add('unknown-outside-window', bundle => { const extra = structuredClone(bundle.rules[0]); extra.id = 'unsupported'; extra.predicate = 'unimplemented'; extra.effectiveUntil = at; bundle.rules.push(extra); }, true);
  add('null-scope', bundle => { bundle.rules[0].scope = null; }, false);
  add('null-window', bundle => { bundle.rules[0].effectiveUntil = null; }, false);
  add('partial-window', bundle => { bundle.rules[0].effectiveUntil = '2026-10-27T00:30:00Z'; }, false);
  add('missing-timing', (_, context) => { delete context.timing; }, false);
  add('wrong-operation-evidence', (_, context) => { context.timingFieldsAbsent = true; context.timing = nonTiming(context); context.timing.operationId = 'other'; }, false);
  add('stale-nonapplicability', (_, context) => { context.timingFieldsAbsent = true; context.timing = nonTiming(context); context.timing.observedAt = '2026-10-26T23:58:59Z'; }, false);
  add('booking-through-undated-context', (_, context) => { context.timingFieldsAbsent = true; }, false);
  for (const operation of ['create', 'change', 'complete']) add(`nonapplicable-${operation}`, (_, context) => { context.operation = operation; context.timingFieldsAbsent = true; context.timing = nonTiming(context); }, true);
  add('supersession-valid', bundle => { nextRule(bundle); }, true, { revisions: [2] });
  add('supersession-wrong-digest', bundle => { nextRule(bundle).supersedes[0].digest = '0'.repeat(64); }, false);
  add('supersession-other-source', bundle => { nextRule(bundle, row => { row.scope.source = 'other'; }); }, true, { revisions: [1] });
  add('supersession-foreign-scope', bundle => { nextRule(bundle, row => { row.scope.accountId = 'different@example.test'; }); }, false);
  add('supersession-fork', bundle => { nextRule(bundle); const fork = structuredClone(bundle.rules[1]); fork.revision = 3; bundle.rules.push(fork); }, false);
  add('no-latest-wins', bundle => { const extra = structuredClone(bundle.rules[0]); extra.revision = 2; extra.parameters.minimumMinutes = 90; bundle.rules.push(extra); }, false);
  add('duplicate-immutable-version', bundle => { bundle.rules.push(structuredClone(bundle.rules[0])); }, false);
  add('hard-conflict', bundle => { const extra = structuredClone(bundle.rules[0]); extra.id = 'conflicting'; extra.parameters.minimumMinutes = 90; bundle.rules.push(extra); }, false);
  add('preference-cannot-override', bundle => { const extra = structuredClone(bundle.rules[0]); extra.id = 'preference'; extra.strength = 'preference'; extra.priority = 1000; extra.parameters.minimumMinutes = 90; bundle.rules.push(extra); }, true);
  add('estimate-cannot-grant', bundle => { bundle.rules[0].strength = 'estimate'; }, false);
  add('missing-attribution', bundle => { bundle.sources = []; }, false);
  add('invalid-effective-bound', bundle => { bundle.rules[0].effectiveUntil = '2026-02-30T00:00:00Z'; }, false);
  for (const caller of ['native', 'api']) for (const kind of ['ready', 'unsupported', 'conflict', 'missing-bundle', 'changed-baseline']) {
    const input = caller === 'native' ? versionedNative() : versionedApi();
    const policy = caller === 'native' ? input.request.policy : input.intent.policy;
    if (kind === 'unsupported') { const extra = structuredClone(policy.planning.rules[0]); extra.id = 'unsupported'; extra.predicate = 'unimplemented'; policy.planning.rules.push(extra); }
    if (kind === 'conflict') { const extra = structuredClone(policy.planning.rules[0]); extra.id = 'conflicting'; extra.parameters.minimumMinutes = 90; policy.planning.rules.push(extra); }
    if (kind === 'missing-bundle') delete policy.planning;
    if (kind !== 'changed-baseline') { if (caller === 'native') input.snapshot.policy = structuredClone(policy); else input.observation.policy = structuredClone(policy); }
    else policy.planning.revision++;
    cases.push({ name: `${caller}-${kind}`, caller, input, expected: kind === 'ready' });
  }
  return cases;
}

export function evaluateCase(modules, row) {
  if (row.caller === 'pure') { const result = modules.planning.assessPlanningPolicy(row.bundle, row.context); return { ready: result.findings.length === 0, resolution: result.resolution, booking: result.booking, result }; }
  if (row.caller === 'native') { const result = modules.native.assessCalendarRegister(row.input.snapshot, { ...row.input.request, snapshotDigest: modules.native.calendarSnapshotDigest(row.input.snapshot), visualReview: { ...row.input.request.visualReview, snapshotDigest: modules.native.calendarSnapshotDigest(row.input.snapshot) } }, row.input); return { ready: result.status === 'proposed', resolution: result.proposals[0].prepared.planningResolution, booking: result.proposals[0].sourceTiming, result }; }
  const result = modules.api.prepareAcademicOsTaskPlan(row.input.intent, row.input.observation, row.input);
  return { ready: result.status === 'api-plan-ready-reported', resolution: result.prepared?.planningResolution ?? null, booking: null, result };
}
