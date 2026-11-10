import { digest } from '../src/content.mjs';
export const automationProcedureFixture = {
  schemaVersion: 1, id: 'bounded-procedure', version: 1,
  steps: [{ id: 'inspect', kind: 'cli', operation: 'Read the explicitly named source.', acceptance: 'Retain exact source identity, original clocks and coverage.' }, { id: 'report', kind: 'judgment', operation: 'Prepare canonical outcome artifacts.', acceptance: 'Retain failures and unknowns; publication and delivery need separate readbacks.' }]
};
export function automationConfigurationFixture(extra = {}) {
  return { schemaVersion: 1, id: 'synthetic-data-check', version: 1, procedureDigest: digest(automationProcedureFixture), objective: 'Synthetic non-briefing source quality check.', environment: 'isolated-local-fixture', runner: 'scripts/agent.mjs', source: { revision: 'a'.repeat(40), capsuleSha256: 'b'.repeat(64) }, effectOwner: 'existing-synthetic-owner', sources: [{ id: 'input', reference: 'synthetic-source-only' }], report: { namespace: 'synthetic-quality', automationId: 'synthetic-data-check', destination: 'synthetic-record-parent' }, budgets: { reads: 2, bytes: 8192 }, parameters: { threshold: 3 }, ...extra };
}
export function automationOutcomeFixture(evidenceRefs, at) {
  return { action: 'producer', namespace: 'synthetic-quality', automationId: 'synthetic-data-check', invocation: { id: 'synthetic-run', source: 'producer-generated' }, origin: 'manual', binding: null, predecessorChain: [], at, execution: 'completed', coverage: 'complete', availability: 'available', summary: 'Synthetic bounded check completed.', artifactLinks: [], sourceWindow: null, sourceEvidence: { observedAt: null, recordedAt: null }, timing: null, telemetry: null, evidenceRefs };
}
