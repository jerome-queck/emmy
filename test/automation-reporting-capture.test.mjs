import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { registrationFingerprint, registrationKey } from '../src/automation-reporting-expectations.mjs';
import { consumeCapture, CAPTURE_LIMITS } from '../src/automation-reporting-capture.mjs';
import { automationReporting, canonical, recordDigest, projectReadView } from '../src/automation-reporting.mjs';
import { evaluatedAt, sha256, bytesOf, runRecord, fixture } from './fixtures/reporting-capture.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const consume = (value, request = { action: 'inspect' }) => consumeCapture(bytesOf(value.scope), bytesOf(value.capture), request, { evaluatedAt });
const withoutProof = result => { const { capture, resultSha256, ...view } = result; return view; };

test('capture uses identical full-history filesystem projection for every read action and pagination', async () => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'emmy-capture-equivalence-'));
  const first = runRecord(); const second = { ...first, revision: 1, previous: recordDigest(first), recordedAt: evaluatedAt };
  const records = [first, second, runRecord('attempt-two'), { ...runRecord('other'), namespace: 'other' }];
  const value = fixture(records);
  try {
    for (const record of records) { await mkdir(join(directory, record.namespace), { recursive: true }); await writeFile(join(directory, record.namespace, recordDigest(record) + '.json'), bytesOf(record)); }
    for (const request of [{ action: 'status' }, { action: 'inspect' }, { action: 'inspect', namespace: 'own', automationId: 'daily', limit: 1 }, { action: 'list', query: 'attempt', limit: 1 }, { action: 'list', cursor: recordDigest(first), limit: 2 }, { action: 'get', id: recordDigest(first), namespace: 'own' }, { action: 'get', id: '0'.repeat(64) }, { action: 'status', maxAgeSeconds: 0, findingCursor: 'coverage', limit: 1 }]) {
      const local = await automationReporting({ ...request, directory }, { evaluatedAt });
      assert.deepEqual(withoutProof(consume(value, request)), local, JSON.stringify(request));
    }
    assert.equal(consume(value).runs.length, 3); // all attempts survive; superseded bytes stay get/list-readable
    const output = consume(value); assert.equal(output.capture.providerLatest, 'not-established'); assert.equal(output.capture.writes, false);
    assert.equal(output.resultSha256, consume(value).resultSha256);
    assert.notEqual(output.resultSha256, consume(value, { action: 'inspect', maxAgeSeconds: 0 }).resultSha256);
    assert.notEqual(output.resultSha256, consumeCapture(' ' + bytesOf(value.scope), bytesOf(value.capture), { action: 'inspect' }, { evaluatedAt }).resultSha256);
    assert.notEqual(output.resultSha256, consumeCapture(bytesOf(value.scope), bytesOf(value.capture), { action: 'inspect' }, { evaluatedAt: '2026-01-03T00:00:00Z' }).resultSha256);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('separate immutable full-history inventory pin and raw bytes, never binding snapshots', () => {
  const value = fixture([runRecord()], 'pinned');
  assert.deepEqual(withoutProof(consume(value)), withoutProof(consume(fixture())));
  for (const alter of [v => { v.capture.inventory.id = 'other'; }, v => { v.scope.inventory.sha256 = '0'.repeat(64); }, v => { v.capture.inventory.bytesBase64 = Buffer.from('{}\n').toString('base64'); }, v => { v.scope.inventory = { mode: 'pinned', id: 'immutable-inventory-one', sha256: sha256('{}\n') }; v.capture.inventory.bytesBase64 = Buffer.from('{}\n').toString('base64'); }]) { const bad = structuredClone(value); alter(bad); assert.throws(() => consume(bad)); }
});

test('incomplete acquisition, interrupted generation and missing pages retain diagnostics without usable outcomes', () => {
  for (const alter of [v => { v.capture.objects.pop(); }, v => { v.capture.inventory.root.afterGeneration = null; }, v => { v.capture.inventory.root.afterGeneration = 'changed'; }, v => { v.capture.inventory.namespaces[0].listing.totalPages = 2; v.capture.inventory.namespaces[0].listing.pages[0].nextCursor = 'next'; v.capture.inventory.namespaces[0].listing.pages[0].eof = false; }, v => { v.capture.inventory.namespaces[0].listing.totalEntries++; }, v => { v.capture.inventory.root.pages = []; }]) {
    const value = fixture([runRecord(), runRecord('attempt-two')]); alter(value); const result = consume(value);
    assert.equal(result.status, 'needs-attention'); assert.equal(result.scan.complete, false); assert.equal(result.capture.completeness, 'incomplete');
    assert.ok(result.runs.every(run => run.execution === 'unknown' && run.reportAvailability === 'conflict-or-incomplete'));
    assert.ok(result.runs.length > 0);
  }
});

test('malformed, duplicate, unsafe, unscoped and corrupt capture refuses acceptance', () => {
  const alterations = [
    v => { v.capture.inventory.complete = true; },
    v => { v.capture.inventory.root.mechanism = 'folder-fetch-100'; },
    v => { v.capture.inventory.root.beforeGeneration = 'different'; },
    v => { v.capture.inventory.root.pages[0].cursor = 'skipped'; },
    v => { const l = v.capture.inventory.root; l.totalPages = 2; l.pages[0].eof = false; l.pages[0].nextCursor = 'again'; l.pages.push({ ...structuredClone(l.pages[0]), cursor: null }); },
    v => { v.capture.inventory.root.pages[0].eof = false; },
    v => { v.capture.inventory.root.pages[0].entries[0].parentId = 'wrong'; },
    v => { v.capture.inventory.root.pages[0].entries[0].id = 'wrong'; },
    v => { v.capture.inventory.root.pages[0].entries.push(v.capture.inventory.root.pages[0].entries[0]); v.capture.inventory.root.totalEntries++; },
    v => { v.capture.inventory.namespaces[0].listing.pages[0].entries[0].parentId = 'wrong'; },
    v => { v.capture.inventory.namespaces[0].listing.pages[0].entries[0].size++; },
    v => { v.capture.inventory.namespaces[0].listing.pages[0].entries[0].sha256 = '0'.repeat(64); },
    v => { v.capture.inventory.namespaces[0].listing.pages[0].entries[0].name = '0'.repeat(64) + '.json'; },
    v => { v.capture.objects[0].bytesBase64 += '\n'; },
    v => { v.capture.objects.push(v.capture.objects[0]); },
    v => { v.capture.objects[0].id = 'unlisted'; },
    v => { v.capture.inventory.namespaces.push(v.capture.inventory.namespaces[0]); },
    v => { v.scope.namespaces.push({ namespace: 'OWN', folderId: 'alias-folder', automationIds: ['daily'] }); },
    v => { v.scope.controlAuthority = { namespace: 'foreign', automationId: 'daily' }; },
    v => { v.scope.namespaces[0].automationIds = ['foreign']; },
    v => { v.capture.objects = Array(5001).fill(v.capture.objects[0]); },
  ];
  for (const alter of alterations) { const value = fixture(); alter(value); assert.throws(() => consume(value), alter.toString()); }
  for (const bytes of [Buffer.from([0xff]), Buffer.from(bytesOf(runRecord()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')), Buffer.from(canonical(runRecord())), Buffer.from(' ' + bytesOf(runRecord()))]) {
    const value = fixture(); value.capture.objects[0].bytesBase64 = bytes.toString('base64'); const entry = value.capture.inventory.namespaces[0].listing.pages[0].entries[0]; entry.size = bytes.length; entry.sha256 = sha256(bytes); assert.throws(() => consume(value));
  }
  const value = fixture(); assert.throws(() => consume(value, { action: 'publish-own-record' })); assert.throws(() => consume(value, { action: 'status', query: 'x'.repeat(201) })); assert.throws(() => consume(value, { action: 'inspect', namespace: 'foreign' }));
  assert.throws(() => consumeCapture(Buffer.from([255]), bytesOf(value.capture), { action: 'status' }, { evaluatedAt }));
  assert.throws(() => consumeCapture(bytesOf(value.scope), '{"a":1,"a":2}', { action: 'status' }, { evaluatedAt }));
  assert.throws(() => consumeCapture(bytesOf(value.scope), ' '.repeat(CAPTURE_LIMITS.packetBytes + 1), { action: 'status' }, { evaluatedAt }));
});

test('history, conflicts, receipts and original clocks use canonical aggregation before filters', () => {
  const original = runRecord(); const missing = { ...original, revision: 2, previous: 'a'.repeat(64) };
  const result = consume(fixture([original, missing]), { action: 'inspect', namespace: 'own' });
  assert.ok(result.runs.every(run => run.execution === 'unknown'));
  const skipped = { ...original, revision: 2, previous: recordDigest(original) };
  assert.equal(consume(fixture([original, skipped])).runs[0].valid, false);
  const a = { ...original, revision: 1, previous: recordDigest(original), recordedAt: evaluatedAt };
  const b = structuredClone(a); b.data.evidenceRefs = ['other-leaf'];
  assert.equal(consume(fixture([original, a, b])).runs.length, 2); assert.ok(consume(fixture([original, a, b])).runs.every(run => run.conflict && run.execution === 'unknown'));
  const receipt = { ...original, kind: 'delivery', key: 'receipt', data: { subject: recordDigest(original), state: 'verified', evidenceRef: 'reported-only' } };
  assert.equal(consume(fixture([original, receipt])).runs[0].userDelivery, 'verified'); assert.equal(consume(fixture([original, receipt])).runs[0].assurance, 'reported');
  const cross = { ...receipt, namespace: 'other' }; assert.equal(consume(fixture([original, cross]), { action: 'inspect', namespace: 'own' }).runs[0].userDelivery, 'unknown');
  const future = { ...original, recordedAt: '2999-01-01T00:00:00Z' }; assert.throws(() => consume(fixture([future])));
  const stale = consume(fixture([original]), { action: 'inspect', maxAgeSeconds: 0 }); assert.equal(stale.runs[0].execution, 'completed'); assert.equal(stale.runs[0].stale, true); assert.equal(stale.runs[0].data.report, null);
  assert.deepEqual(withoutProof(stale), projectReadView({ action: 'inspect', maxAgeSeconds: 0 }, { records: [original], findings: [], complete: true }, { evaluatedAt }));
});

test('total file bound applies across namespaces, root bound never per namespace', () => {
  const records = Array.from({ length: 5001 }, (_, index) => ({ ...runRecord('attempt-' + index), namespace: index < 3000 ? 'own' : 'other' }));
  const value = fixture(records); value.capture.objects = [];
  assert.throws(() => consume(value), /Total file inventory/);
  const roots = fixture(); roots.scope.namespaces = Array.from({ length: 201 }, (_, index) => ({ namespace: 'scope' + index, folderId: 'folder' + index, automationIds: ['daily'] })); assert.throws(() => consume(roots), /namespace scope bound/);
});

test('supported frozen standalone consume runs outside repository and binds exact raw CLI inputs', async () => {
  const build = spawnSync(process.execPath, ['scripts/build-reporting-cloud.mjs'], { cwd: root, encoding: 'utf8' }); assert.equal(build.status, 0, build.stderr);
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'emmy-consume-'));
  try {
    const executable = join(directory, 'consumer.mjs'); await copyFile(join(root, '.local/reporting-cloud/automation-reporting-cloud-v2.mjs'), executable);
    const value = fixture([runRecord()], 'pinned'); const scopePath = join(directory, 'scope.json'); const capturePath = join(directory, 'capture.json');
    await writeFile(scopePath, bytesOf(value.scope)); await writeFile(capturePath, bytesOf(value.capture));
    const flags = ['consume', '--scope', scopePath, '--capture', capturePath, '--action', 'inspect', '--evaluated-at', evaluatedAt];
    const run = extra => spawnSync(process.execPath, [executable, ...flags, ...extra], { cwd: directory, encoding: 'utf8' });
    const result = run([]); assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), consume(value));
    assert.equal(run(['--action', 'get']).status, 1); assert.equal(run(['--limit', '1e2']).status, 1);
    const rawScope = '\n' + bytesOf(value.scope); await writeFile(scopePath, rawScope); const changed = JSON.parse(run([]).stdout); assert.equal(changed.capture.scopeSha256, sha256(rawScope)); assert.notEqual(changed.resultSha256, JSON.parse(result.stdout).resultSha256);
    const source = await readFile(executable, 'utf8'); assert.equal(/^import .*from ['"]\.\//m.test(source), false);
    const manifest = JSON.parse(await readFile(join(root, '.local/reporting-cloud/manifest.json'), 'utf8')); assert.equal(manifest.captureSchemas.length, 3); assert.ok(manifest.sources.some(item => item.path === 'src/automation-reporting-capture.mjs'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('explicit multi-page snapshot chains work; stale control never gates readable unbound source evidence', () => {
  const run = runRecord();
  run.data.report = { schemaVersion: 2, type: 'automation-outcome', runId: run.key, provenance: 'scheduled-unbound', scheduledFor: null, status: 'completed', coverage: 'partial', availability: 'available', summary: 'Historical completed attempt.', artifactLinks: [], sourceWindow: null, generatedAt: run.recordedAt, sourceEvidence: { observedAt: null, recordedAt: run.recordedAt }, generation: { mode: 'producer', attestedBy: 'synthetic-producer', basedOn: null } };
  const data = { actor: 'registration-control', targetNamespace: 'own', targetAutomationId: 'daily', nativeRef: 'synthetic-native', enabled: true, rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0', dtstart: null, timezone: 'UTC', timezoneSource: 'owner-explicit', sourceKind: 'cloud-definition', sourceRef: 'synthetic-old-source', observedAt: '2025-01-01T00:00:00Z', effectiveAt: '2025-01-01T00:00:00Z', observationGraceSeconds: 3600, sourceMaxAgeSeconds: 3600 };
  data.fingerprint = registrationFingerprint(data);
  const control = { schemaVersion: 2, namespace: 'control', automationId: 'control-owner', kind: 'registration', key: registrationKey('own', 'daily'), revision: 0, previous: null, recordedAt: data.observedAt, data };
  const value = fixture([run, control]); value.scope.controlAuthority = { namespace: control.namespace, automationId: control.automationId };
  const listing = value.capture.inventory.root; const old = listing.pages[0];
  listing.totalPages = 2;
  listing.pages = [{ ...old, entries: old.entries.slice(0, 1), nextCursor: 'second', eof: false }, { ...old, cursor: 'second', entries: old.entries.slice(1) }];
  const result = consume(value, { action: 'inspect', namespace: 'own', maxAgeSeconds: 0 });
  assert.equal(result.scan.complete, true); assert.equal(result.runs[0].execution, 'completed');
  assert.equal(result.runs[0].reportAvailability, 'available'); assert.equal(result.runs[0].sourceFreshness, 'stale');
  assert.equal(result.runs[0].data.report.summary, 'Historical completed attempt.'); assert.equal(result.runs[0].invocationProvenance, 'scheduled-unbound');
  assert.equal(result.runs[0].data.report.generatedAt, run.recordedAt); assert.equal(result.runs[0].data.report.sourceEvidence.recordedAt, run.recordedAt);
  assert.equal(result.registrations[0].stale, true);
  assert.deepEqual(withoutProof(result), projectReadView({ action: 'inspect', namespace: 'own', maxAgeSeconds: 0, controlAuthority: value.scope.controlAuthority }, { records: [run, control], findings: [], complete: true }, { evaluatedAt }));
});
