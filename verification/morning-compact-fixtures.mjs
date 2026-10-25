import { digest } from '../src/records.mjs';
import { assessBriefingDraft, renderBriefing } from '../src/briefing.mjs';
import { morningAssessments, morningAt } from './morning-fixtures.mjs';
export function compactAssessments(at = morningAt, window) {
  const base = morningAssessments(at, window); const guidance = { state: 'current', digest: digest('synthetic-guidance'), sourceCheckedAt: at };
  const rows = [
    { id: 'opaque-source-pending', label: 'Finish the assignment', effect: 'review', state: 'pending' },
    { id: 'opaque-source-done', label: 'Required quiz', effect: 'complete', state: 'complete' },
    { id: 'opaque-source-cancel', label: 'Research seminar', effect: 'cancelled', state: 'complete' }
  ];
  const input = { schemaVersion: 1, authoredUnder: guidance.digest, sources: rows.map(row => ({ id: row.id, scope: { subject: `private-native-${row.id}`, effect: row.effect }, reference: `https://example.test/${row.id}`, kind: 'native', retrievedAt: at, contentAt: at, availability: 'available', coverage: { complete: true, gaps: [] }, claim: row.state, attribution: 'attributed' })), coverage: { selection: 'Declared day sources only.', catalogListed: [], chatsRead: [], repositoriesInspected: [], otherSourcesRead: rows.map(row => row.id), gaps: [] }, correctionReadback: rows.map(row => ({ scope: { subject: `private-native-${row.id}`, effect: row.effect }, state: 'reported-readback', reference: `private-correction-${row.id}` })), entries: rows.map(row => ({ kind: 'status', label: row.label, scope: { subject: `private-native-${row.id}`, effect: row.effect }, state: row.state, sourceIds: [row.id] })) };
  const assessment = assessBriefingDraft(input, guidance, at); const body = renderBriefing(assessment);
  base.briefing.input = input; base.briefing.inputReceipt.sha256 = digest(JSON.stringify(input)); base.briefing.assessment.inputDigest = base.briefing.inputReceipt.sha256; base.briefing.assessment.bodyDigest = digest(body); base.briefing.assessment.status = assessment.status;
  base.briefing.result = { mode: 'draft', status: assessment.status, body, bodyDigest: digest(body), guidance };
  return { ...base, presentation: 'compact-v1' };
}
