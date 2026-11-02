#!/usr/bin/env node
import { readHistoryRequest } from '../src/automation-reporting-history.mjs';
import { createHash } from 'node:crypto';
import { planUpkeep, applyUpkeep, readUpkeepPlan, writeUpkeepPlan } from '../src/automation-reporting-upkeep.mjs';
import { assertNoCredentials } from '../src/reporting-privacy.mjs';
const help = 'Usage: automation-reporting-upkeep plan --source-directory <validated-fallback> --directory <managed-primary> --namespace <owner> [--from-namespace <known-managed-alias>] [--to <private-plan-outside-stores>] | apply --file <plan.json> [--publication-file <private-history-request>]. Plan is read-only except explicit --to. Target namespace must already exist; upkeep never creates directories. Exit 0 repaired/noop, 2 blocked/invalid, 3 findings or proposed repairs. Trusted cooperating writer and immutable source bytes required.';
const reasons = new Set(['namespace-case-alias', 'filename-case-alias', 'target-case-alias', 'unknown-or-unsafe', 'vanished', 'unknown-bytes', 'missing', 'pending-retained', 'target-conflict', 'stale-missing', 'target-namespace-unavailable']);
function visible(value) {
  try { assertNoCredentials(value); return value; } catch { return 'withheld'; }
}
function findingsSummary(findings) {
  return findings.slice(0, 20).map(finding => {
    const prefix = finding.split(':', 1)[0];
    return { reason: reasons.has(prefix) ? prefix : 'attention-required', reference: createHash('sha256').update(finding).digest('hex') };
  });
}
try {
  const args = process.argv.slice(2); const action = args.shift();
  if (!action || ['--help', '-h', 'help'].includes(action)) process.stdout.write(JSON.stringify({ help }) + '\n');
  else {
    if (!['plan', 'apply'].includes(action)) throw new Error('Unknown action');
    const flags = action === 'apply' ? { '--file': 'file', '--publication-file': 'publicationFile' } : { '--source-directory': 'sourceDirectory', '--directory': 'directory', '--namespace': 'namespace', '--from-namespace': 'fromNamespace', '--to': 'to' };
    const request = {};
    while (args.length) {
      const flag = args.shift(); const key = flags[flag]; const value = args.shift();
      if (!key || Object.hasOwn(request, key) || value === undefined || value.startsWith('--')) throw new Error('Unknown, repeated or incomplete option');
      request[key] = value;
    }
    let result; let output;
    if (action === 'plan') {
      result = await planUpkeep(request);
      if (request.to) await writeUpkeepPlan(request.to, result.plan);
      output = { schemaVersion: 1, status: result.status, writes: false, namespace: visible(result.plan.namespace), expectedFingerprint: result.plan.fingerprint, mappingAvailable: result.plan.mappingAvailable, counts: { proposedRepairs: result.plan.moves.length, findings: result.plan.findings.length }, findings: findingsSummary(result.plan.findings), assumptions: result.assumptions };
      if (request.to) output.planFile = visible(request.to);
    } else {
      if (!request.file) throw new Error('--file required');
      const plan = await readUpkeepPlan(request.file);
      result = await applyUpkeep(plan, { publication: request.publicationFile ? await readHistoryRequest(request.publicationFile) : null });
      output = { schemaVersion: 1, status: result.status, writes: result.writes, namespace: visible(plan.namespace), expectedFingerprint: plan.fingerprint, repaired: result.repaired, ...(result.historyPublication ? { historyPublication: result.historyPublication } : {}), counts: { findings: result.findings.length }, findings: findingsSummary(result.findings), assumptions: result.assumptions };
    }
    process.stdout.write(JSON.stringify(output) + '\n');
    process.exitCode = result.status === 'needs-attention' ? 3 : 0;
  }
} catch (error) {
  const filesystem = typeof error.code === 'string' && /^E[A-Z0-9]+$/.test(error.code);
  process.stdout.write(JSON.stringify({ schemaVersion: 1, status: 'blocked', error: filesystem ? 'Filesystem operation refused' : 'Invalid or unsafe upkeep request', reason: filesystem ? 'filesystem-refusal' : 'invalid-or-unsafe-request' }) + '\n'); process.exitCode = 2;
}
