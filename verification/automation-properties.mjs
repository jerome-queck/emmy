import { automationProcedureFixture as procedure, automationConfigurationFixture } from './automation-fixtures.mjs';
import { digest } from '../src/content.mjs';
export const automationBounds = { cases: 24, budgets: [-1, 0, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1], assumptions: 'Pure supplied JSON procedures/configuration and symbolic source pins. No source-release authenticity, native creation, scheduling, permission, executor budget enforcement, provider truth, publication or delivery is proved.' };
export function verifyAutomationContract(automation, check) {
  let cases = 0;
  const expect = (name, value) => { cases++; check('automation-contract', { case: name }, value, 'Generic staged plans bind their supplied source/configuration and cannot grant native effects.'); };
  const pins = { procedureRef: 'synthetic-procedure-reference', configurationRef: 'synthetic-configuration-reference', procedureSha256: digest('procedure'), configurationSha256: digest('config') };
  const config = automationConfigurationFixture(); const build = (value = config, p = procedure) => automation.planAutomation(p, value, pins);
  const rejects = action => { try { action(); return false; } catch { return true; } };
  const plan = build(); expect('no-effects', plan.effectsAuthorized === false && plan.nativeCreation === 'not-performed' && plan.deployment === 'held');
  expect('deterministic', digest(build()) === digest(build(Object.fromEntries(Object.entries(config).reverse()))));
  for (const key of ['reads', 'bytes']) for (const value of automationBounds.budgets) expect(`budget/${key}/${value}`, rejects(() => build({ ...config, budgets: { ...config.budgets, [key]: value } })) === (!Number.isSafeInteger(value) || value < 0));
  for (const key of ['effectOwner', 'environment', 'runner']) expect(`scope/${key}`, rejects(() => build({ ...config, [key]: '' })));
  expect('destination', rejects(() => build({ ...config, report: { ...config.report, destination: '' } })));
  expect('source-revision', rejects(() => build({ ...config, source: { ...config.source, revision: 'unknown' } })));
  expect('source-capsule', rejects(() => build({ ...config, source: { ...config.source, capsuleSha256: 'unknown' } })));
  expect('configuration-binding', rejects(() => build({ ...config, procedureDigest: digest('another procedure') })));
  const duplicate = { ...procedure, steps: [...procedure.steps, procedure.steps[0]] };
  expect('duplicate-stage', rejects(() => build({ ...config, procedureDigest: digest(duplicate) }, duplicate)));
  expect('unsupported-version', rejects(() => build({ ...config, schemaVersion: 2 })));
  for (const [name, value] of [['budget', { ...config, budgets: { ...config.budgets, reads: 3 } }], ['destination', { ...config, report: { ...config.report, destination: 'changed-parent' } }], ['parameter', { ...config, parameters: { threshold: 7 } }]]) expect(`change/${name}`, build(value).planDigest !== plan.planDigest);
  if (cases !== automationBounds.cases) throw new Error(`Automation domain changed ${cases}`);
  return { cases };
}
const mutation = (id, before, after, counterexample) => ({ id: `automation-${id}`, source: 'src/automation-plan.mjs', property: 'automation-contract', edits: [[before, after]], counterexample });
export const automationMutations = [
  mutation('grant-effects', 'effectsAuthorized: false', 'effectsAuthorized: true', 'no-effects'),
  mutation('wrong-procedure', 'configuration.procedureDigest === digest(procedure)', 'true', 'configuration-binding'),
  mutation('negative-budget', 'Number.isSafeInteger(value) && value >= 0', 'Number.isSafeInteger(value)', 'budget/reads/-1'),
  mutation('duplicate-stage', 'new Set(procedure.steps.map(step => step.id)).size === procedure.steps.length', 'true', 'duplicate-stage'),
  mutation('lost-parameters', "digest({ contract: 'automation-procedure-v1', procedure, configuration })", "digest({ contract: 'automation-procedure-v1', procedure, configuration: { ...configuration, parameters: {} } })", 'change/parameter')
];
