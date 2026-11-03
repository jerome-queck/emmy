import { operatingContract, briefingChecksV1 } from './operating-contract.mjs';
import { preparePolicyBriefing } from './briefing-plan.mjs';
import { assessBriefingReporting } from './briefing-reporting.mjs';
import { briefingPolicyDigest, assessBriefingLearning } from './briefing-policy.mjs';

export function executeBriefing(request, { now } = {}) {
  const need = (ok, message) => { if (!ok) throw new Error(message); };
  need(request && Object.keys(request).length === 2 && Object.hasOwn(request, 'action') && Object.hasOwn(request, 'input'), 'Exact action/input request required');
  if (request.action === 'foundation') {
    need(request.input && Object.keys(request.input).length === 0, 'Foundation query takes empty input');
    return { ...operatingContract, expectedReportRules: briefingChecksV1 };
  }
  if (request.action === 'prepare') {
    need(typeof now === 'string' && Number.isFinite(Date.parse(now)) && new Date(now).toISOString() === now, 'Explicit actual assessment clock required');
    need(request.input.asOf <= now, 'Assessment clock is future');
    return preparePolicyBriefing(request.input);
  }
  if (request.action === 'reporting') return assessBriefingReporting(request.input);
  if (request.action === 'learning') {
    need(request.input && Object.keys(request.input).length === 3 && ['policy', 'entry', 'history'].every(key => Object.hasOwn(request.input, key)), 'Exact learning input required');
    return assessBriefingLearning(request.input.policy, request.input.entry, request.input.history);
  }
  need(request.action === 'policy', 'Use prepare, reporting, policy or learning');
  return { policyDigest: briefingPolicyDigest(request.input), unboundExceptions: request.input.unboundExceptions.map(row => row.id), effectsAuthorized: false, deployment: 'held' };
}
