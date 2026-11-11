import { automationProcedureFixture as procedure, automationConfigurationFixture, automationOutcomeFixture } from './automation-fixtures.mjs';
import { digest } from '../src/content.mjs';
export const automationBounds = { cases: 34, budgets: [-1, 0, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1], assumptions: 'Pure supplied JSON procedures/configuration and symbolic source pins. No source-release authenticity, native creation, scheduling, permission, executor budget enforcement, provider truth, publication or delivery is proved.' };
export function verifyAutomationContract(automation, check, reporting) {
  let cases = 0;
  const expect = (name, value) => { cases++; check('automation-contract', { case: name }, value, 'Generic plans bind supplied configuration; canonical run ingestion validates report state and metadata without granting native effects.'); };
  const pins = { procedureRef: 'synthetic-procedure-reference', configurationRef: 'synthetic-configuration-reference', procedureSha256: digest('procedure'), configurationSha256: digest('config') };
  const config = automationConfigurationFixture(); const build = (value = config, p = procedure) => automation.planAutomation(p, value, pins);
  const rejects = action => { try { action(); return false; } catch { return true; } };
  const plan = build(); expect('no-effects', plan.effectsAuthorized === false && plan.nativeCreation === 'not-performed' && plan.deployment === 'held');
  expect('deterministic', digest(build()) === digest(build(Object.fromEntries(Object.entries(config).reverse()))));
  for (const key of ['reads', 'bytes']) for (const value of automationBounds.budgets) expect(`budget/${key}/${value}`, rejects(() => build({ ...config, budgets: { ...config.budgets, [key]: value } })) === (!Number.isSafeInteger(value) || value < 0));
  for (const key of ['effectOwner', 'environment', 'runner']) expect(`scope/${key}`, rejects(() => build({ ...config, [key]: '' })));
  expect('destination', rejects(() => build({ ...config, report: { ...config.report, destination: '' } })));
  expect('source-revision', rejects(() => build({ ...config, source: { ...config.source, revision: 'unknown' } })));
  expect('source-revision-type', rejects(() => build({ ...config, source: { ...config.source, revision: [config.source.revision] } })));
  expect('source-capsule', rejects(() => build({ ...config, source: { ...config.source, capsuleSha256: 'unknown' } })));
  expect('configuration-binding', rejects(() => build({ ...config, procedureDigest: digest('another procedure') })));
  const duplicate = { ...procedure, steps: [...procedure.steps, procedure.steps[0]] };
  expect('duplicate-stage', rejects(() => build({ ...config, procedureDigest: digest(duplicate) }, duplicate)));
  expect('unsupported-version', rejects(() => build({ ...config, schemaVersion: 2 })));
  for (const [name, value] of [['budget', { ...config, budgets: { ...config.budgets, reads: 3 } }], ['destination', { ...config, report: { ...config.report, destination: 'changed-parent' } }], ['parameter', { ...config, parameters: { threshold: 7 } }]]) expect(`change/${name}`, build(value).planDigest !== plan.planDigest);
  const at = '2026-11-03T01:00:00.000Z';
  const producer = automationOutcomeFixture([], at);
  const record = reporting.assessBriefingReporting(producer).artifacts[0].record;
  const publication = value => reporting.assessBriefingReporting({ action: 'publication', parentId: 'synthetic-parent', artifact: { id: digest(reporting.reportingCanonical(value)), bytes: `${reporting.reportingCanonical(value)}\n` }, attempt: { state: 'not-started', nativeId: null }, readback: null });
  for (const execution of ['running', 'unknown', 'blocked', 'pending-approval']) {
    const invalid = structuredClone(record); invalid.data.execution = execution; invalid.data.report.status = execution;
    expect(`report/nonterminal/${execution}`, rejects(() => publication(invalid)));
  }
  const invalidTelemetry = structuredClone(record); invalidTelemetry.data.telemetry = { runtimeMs: -1, inputTokens: null, outputTokens: null, sourceRef: 'synthetic-meter' };
  expect('report/negative-telemetry', rejects(() => publication(invalidTelemetry)));
  const timing = { startedAt: '2026-11-03T00:00:00.000Z', lastHeartbeatAt: null, endedAt: at, observedAt: at, sourceRef: 'synthetic-clock' };
  const futureTiming = structuredClone(record); futureTiming.data.timing = { ...timing, observedAt: '2026-11-03T01:00:00.001Z' };
  expect('report/future-timing', rejects(() => publication(futureTiming)));
  const reversedTiming = structuredClone(record); reversedTiming.data.timing = { ...timing, startedAt: at, endedAt: '2026-11-03T00:00:00.000Z' };
  expect('report/reversed-timing', rejects(() => publication(reversedTiming)));
  const valid = structuredClone(record); valid.data.timing = timing; valid.data.telemetry = { runtimeMs: 0, inputTokens: null, outputTokens: Number.MAX_SAFE_INTEGER, sourceRef: 'synthetic-meter' };
  expect('report/valid-metadata', publication(valid).state === 'prepared-only');
  const scheduledFor = '2026-11-03T02:00:00.000Z';
  const binding = { scheduledFor, occurrenceKey: `slot-${digest(reporting.reportingCanonical([producer.namespace, producer.automationId, scheduledFor]))}`, observationDueAt: '2026-11-03T03:00:00.000Z', nominalSlotEvidenceRef: 'synthetic-slot', observedAt: at, validThrough: '2026-11-04T00:00:00.000Z' };
  const early = reporting.assessBriefingReporting({ ...producer, origin: 'scheduled', binding }).artifacts.at(-1).record;
  expect('report/terminal-null', publication(early).state === 'prepared-only');
  if (cases !== automationBounds.cases) throw new Error(`Automation domain changed ${cases}`);
  return { cases };
}
const mutation = (id, before, after, counterexample) => ({ id: `automation-${id}`, source: 'src/automation-plan.mjs', property: 'automation-contract', edits: [[before, after]], counterexample });
export const automationMutations = [
  mutation('grant-effects', 'effectsAuthorized: false', 'effectsAuthorized: true', 'no-effects'),
  mutation('revision-type', "typeof configuration.source.revision === 'string' && ", '', 'source-revision-type'),
  mutation('wrong-procedure', 'configuration.procedureDigest === digest(procedure)', 'true', 'configuration-binding'),
  mutation('negative-budget', 'Number.isSafeInteger(value) && value >= 0', 'Number.isSafeInteger(value)', 'budget/reads/-1'),
  mutation('duplicate-stage', 'new Set(procedure.steps.map(step => step.id)).size === procedure.steps.length', 'true', 'duplicate-stage'),
  mutation('lost-parameters', "digest({ contract: 'automation-procedure-v1', procedure, configuration })", "digest({ contract: 'automation-procedure-v1', procedure, configuration: { ...configuration, parameters: {} } })", 'change/parameter'),
  { id: 'automation-nonterminal-report', source: 'src/automation-producer.mjs', property: 'automation-contract', edits: [["need(terminal.includes(data.execution), 'Non-null report requires terminal execution');", '']], counterexample: 'report/nonterminal/running' },
  { id: 'automation-artifact-timing', source: 'src/automation-producer.mjs', property: 'automation-contract', edits: [["if (Object.hasOwn(data, 'timing')) timingEvidence(data.timing, record.recordedAt);", '']], counterexample: 'report/future-timing' },
  { id: 'automation-artifact-telemetry', source: 'src/automation-producer.mjs', property: 'automation-contract', edits: [["if (Object.hasOwn(data, 'telemetry')) measuredTelemetry(data.telemetry);", '']], counterexample: 'report/negative-telemetry' }
];
