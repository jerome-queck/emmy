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
  for (const text of ['/Volumes/fixture-volume/private.txt','owner@example.invalid','Message-ID: <mail>','Authorization: header']) assert.throws(() => assertExportSafe({summary:text}), /refused/);
  for (const url of ['file:///Users/x','http://example.invalid','https://localhost/file','https://example.invalid/?api_key=secret']) assert.throws(() => validateArtifactLinks([{label:'artifact',url}]));
  assert.deepEqual(validateArtifactLinks([{label:'Artifact',url:'https://drive.google.com/file/d/opaque/view'}]),[{label:'Artifact',url:'https://drive.google.com/file/d/opaque/view'}]);
});
test('default CLI diagnostics do not reflect credential-like names, keys or arguments', async () => {
  const {mkdtemp,realpath,writeFile,mkdir,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
  const directory=await mkdtemp(join(await realpath(tmpdir()),'reporting-private-names-'));const secret='sk-proj-'+'x'.repeat(32);
  const cli=(await import('node:url')).fileURLToPath(new URL('../scripts/automation-reporting.mjs',import.meta.url));
  const execute=args=>{const child=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal((child.stdout+child.stderr).includes(secret),false);return child;};
  try{
    await mkdir(join(directory,'fixture'));await writeFile(join(directory,secret),'unknown');await writeFile(join(directory,'fixture',secret+'.json'),'{}');
    const status=execute(['diagnose','--directory',directory]);assert.equal(status.status,3);assert.ok(JSON.parse(status.stdout).data.findings.filter(value=>value.includes('entry')||value.includes('record')).every(value=>value.includes('sha256:')));
    assert.equal(execute(['status','--directory',directory,'--'+secret]).status,2);
    const agent=(await import('node:url')).fileURLToPath(new URL('../scripts/agent.mjs',import.meta.url));
    for (const args of [[secret],['reporting','--'+secret]]) { const child=spawnSync(process.execPath,[agent,...args],{encoding:'utf8'}); assert.equal(child.status,2); assert.equal((child.stdout+child.stderr).includes(secret),false); }
    const transport=(await import('node:url')).fileURLToPath(new URL('../scripts/automation-reporting-transport.mjs',import.meta.url)); const missing=spawnSync(process.execPath,[transport,'--source-directory',join(directory,secret+'-missing'),'--directory',directory,'--namespace','fixture'],{encoding:'utf8'}); assert.equal(missing.status,2); assert.equal((missing.stdout+missing.stderr).includes(secret),false);
    assert.equal(execute(['status','--directory',join(directory,secret+'-missing')]).status,2);
    const input=join(directory,'input.json');await writeFile(input,JSON.stringify({...record,key:secret}));assert.equal(execute(['validate','--directory',directory,'--namespace','fixture','--file',input]).status,2);
  }finally{await rm(directory,{recursive:true,force:true});}
});
