import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNoCredentials, assertExportSafe, validateArtifactLinks } from '../src/reporting-privacy.mjs';
import { exportOutcome } from '../src/automation-reporting-export.mjs';
import { validateRecord } from '../src/automation-reporting.mjs';
const record = { schemaVersion: 1, namespace: 'fixture', automationId: 'review', kind: 'run', key: 'attempt', revision: 0, previous: null, recordedAt: '2026-10-31T00:00:00Z', data: { occurrenceKey: null, execution: 'completed', coverage: 'partial', report: null, evidenceRefs: ['/Users/example/private/source.json'] } };
const evaluatedAt='2026-11-01T00:00:00Z';
test('known credentials and credential URL forms refuse publication', () => {
  for (const text of ['sk-proj-'+'x'.repeat(30),'Bearer '+'x'.repeat(20),'AKIA'+'X'.repeat(16),'-----BEGIN PRIVATE KEY-----','https://example.invalid/?access_token=opaque','https://user:password@example.invalid/file']) {
    assert.throws(() => assertNoCredentials({ summary: text }), /refused/);
    assert.throws(() => validateRecord({ ...record, data: { ...record.data, evidenceRefs: [text] } }, evaluatedAt), /refused/);
  }
});
test('private local refs remain local; explicit cloud selector excludes them', () => {
  assert.doesNotThrow(() => validateRecord(record, evaluatedAt));
  const outcome=exportOutcome(record); assert.equal(outcome.execution,'completed'); assert.equal(outcome.evidenceCoverage,'partial');
  assert.equal(outcome.actualTiming,null); assert.equal(JSON.stringify(outcome).includes('/Users/'),false); assert.equal('evidenceRefs' in outcome,false);
});
test('cloud policy refuses private paths, account addresses, raw headers and unsafe links', () => {
  for (const text of ['/Volumes/Main/private.txt','owner@example.invalid','Message-ID: <mail>','Authorization: header']) assert.throws(() => assertExportSafe({summary:text}), /refused/);
  for (const url of ['file:///Users/x','http://example.invalid','https://localhost/file','https://example.invalid/?api_key=secret']) assert.throws(() => validateArtifactLinks([{label:'artifact',url}]));
  assert.deepEqual(validateArtifactLinks([{label:'Artifact',url:'https://drive.google.com/file/d/opaque/view'}]),[{label:'Artifact',url:'https://drive.google.com/file/d/opaque/view'}]);
});
