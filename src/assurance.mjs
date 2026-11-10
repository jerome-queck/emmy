import { canonical, digest } from './content.mjs';

export const assurancePlan = Object.freeze([
  { id: 'markdown-links', args: ['scripts/check-markdown-links.mjs', '--tree', '@source-tree'] },
  { id: 'markdown-tests', args: ['--test', 'test/markdown-links.test.mjs'] },
  { id: 'generated-references', args: ['scripts/agent.mjs', 'maintain', '--check'] },
  { id: 'kernel-incarnation', args: ['--test', 'test/process-incarnation.test.mjs', 'test/cloud-migration.test.mjs'] },
  { id: 'fleet-morning', args: ['--test', 'test/fleet.test.mjs', 'test/fleet-history.test.mjs', 'test/morning.test.mjs', 'test/morning-compact.test.mjs', 'test/morning-collection.test.mjs'] },
  { id: 'behavior', args: ['scripts/verify-behavior.mjs'] },
  { id: 'merge-tests', args: ['--test', 'test/github-auto-merge.test.mjs'] },
  { id: 'coordination-formal', args: ['scripts/verify-formal.mjs'] },
  { id: 'merge-formal', args: ['verification/merge-policy.mjs'] },
  { id: 'publication-formal', args: ['scripts/verify-publication.mjs'] },
  { id: 'local-assurance-tests', args: ['--test', 'test/local-assurance.test.mjs'] },
  { id: 'local-assurance-formal', args: ['verification/local-assurance/check.mjs'] },
].map(row => Object.freeze({ ...row, args: Object.freeze(row.args) })));
export const assurancePlanDigest = digest(canonical(assurancePlan));

export const beginAssurance = contextDigest => ({ phase: 'prepared', contextDigest, completed: 0, active: null, reason: null });
export function assuranceTransition(state, event) {
  const plan = assurancePlan;
  if (state.phase === 'refused') return state;
  const refuse = reason => ({ ...state, phase: 'refused', reason });
  if (event.contextDigest !== state.contextDigest) return refuse('context-changed');
  if (event.kind === 'inspect') return state;
  if (event.kind === 'start') {
    if (state.phase !== 'prepared' || event.id !== plan[state.completed]?.id) return refuse('unexpected-suite');
    return { ...state, phase: 'running', active: event.id };
  }
  if (event.kind === 'finish') {
    if (state.phase !== 'running' || event.id !== state.active) return refuse('unmatched-result');
    if (event.code !== 0 || event.signal !== null || event.error !== null) return refuse('suite-failed');
    if (event.evidenceValid !== true) return refuse('output-unverified');
    const completed = state.completed + 1;
    return { ...state, phase: completed === plan.length ? 'passed' : 'prepared', completed, active: null };
  }
  return refuse('unexpected-event');
}
