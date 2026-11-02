import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture, runRecord, evaluatedAt, bytesOf, sha256 } from '../../test/fixtures/reporting-capture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'automation-reporting-capture';
const closure = ['reporting-representation', 'bounded-json', 'reporting-privacy', 'improvement-report', 'automation-reporting-outcome', 'automation-reporting-expectations', 'automation-reporting', source];
const entry = value => value.capture.inventory.namespaces[0].listing.pages[0].entries[0];
const sourceBytes = await readFile(join(root, `src/${source}.mjs`), 'utf8');
const cases = [
  { name: 'wrong-parent', edit: v => { entry(v).parentId = 'wrong-parent'; }, mutations: [[source, 'entry.parentId === item.folderId', 'true']], wrong: r => r.scan.complete && r.runs[0].execution === 'completed' },
  { name: 'wrong-length', edit: v => { entry(v).size++; }, mutations: [[source, 'bytes.length === entry.size', 'true']], wrong: r => r.scan.complete },
  { name: 'wrong-raw-hash', edit: v => { entry(v).sha256 = '0'.repeat(64); }, mutations: [[source, 'hash(bytes) === entry.sha256', 'true']], wrong: r => r.scan.complete },
  { name: 'unapproved-automation', edit: v => { v.scope.namespaces[0].automationIds = ['other']; }, mutations: [[source, 'entry.approved.automationIds.includes(record.automationId)', 'true']], wrong: r => r.scan.complete && r.runs[0].automationId === 'daily' },
  { name: 'missing-object', edit: v => { v.capture.objects.pop(); }, mutations: [[source, 'if (objects.size !== listed.size) state.complete = false;', 'if (false) state.complete = false;']], wrong: r => r.scan.complete },
  { name: 'interrupted-generation', edit: v => { v.capture.inventory.root.afterGeneration = null; }, mutations: [[source, 'if (listing.afterGeneration !== listing.beforeGeneration) state.complete = false;', 'if (false) state.complete = false;']], wrong: r => r.scan.complete && r.runs[0].execution === 'completed' },
  { name: 'missing-final-page', edit: v => { const l = v.capture.inventory.root; l.totalPages = 2; l.pages[0].nextCursor = 'next'; l.pages[0].eof = false; }, mutations: [[source, 'if (!ended || listing.pages.length !== listing.totalPages || entries.length !== listing.totalEntries) state.complete = false;', 'if (false) state.complete = false;']], wrong: r => r.scan.complete },
  { name: 'skipped-cursor', edit: v => { v.capture.inventory.root.pages[0].cursor = 'skipped'; }, mutations: [[source, 'page.cursor === cursor', 'true']], wrong: r => r.scan.complete },
  { name: 'content-digest', edit: v => { entry(v).name = '0'.repeat(64) + '.json'; }, mutations: [[source, "recordDigest(record) + '.json' === entry.name", 'true']], wrong: r => r.scan.complete },
  { name: 'global-file-bound', setup: () => fixture(Array.from({ length: 5001 }, (_, index) => ({ ...runRecord('attempt-' + index), namespace: index < 3000 ? 'own' : 'other' }))), mutations: [[source, 'files: 5000', 'files: 5001']], wrong: r => r.scan.complete && r.counts.runs === 5001 },
  { name: 'future-envelope', setup: () => fixture([{ ...runRecord(), recordedAt: '2999-01-01T00:00:00Z' }]), mutations: [['automation-reporting', 'Date.parse(record.recordedAt) <= Date.parse(evaluatedAt)', 'true']], wrong: r => r.scan.complete && r.runs[0].execution === 'completed' },
  { name: 'missing-predecessor', setup: () => fixture([{ ...runRecord(), revision: 1, previous: 'a'.repeat(64) }]), diagnostic: true, mutations: [['automation-reporting', 'record.previous !== null && !predecessorOK(record, byDigest.get(record.previous))', 'false']], wrong: r => r.runs[0].execution === 'completed' },
  { name: 'conflicting-leaves', setup: () => { const first = runRecord(); const a = { ...first, revision: 1, previous: sha256(bytesOf(first).trim()), recordedAt: evaluatedAt }; const b = structuredClone(a); b.data.evidenceRefs = ['other']; return fixture([first, a, b]); }, diagnostic: true, mutations: [['automation-reporting', 'const conflict = leaves.length !== 1;', 'const conflict = false;']], wrong: r => r.runs.every(run => run.execution === 'completed') },
];
function corruptRaw(value, bytes) { value.capture.objects[0].bytesBase64 = bytes.toString('base64'); entry(value).size = bytes.length; entry(value).sha256 = sha256(bytes); }
const canonicalGate = [source, "need(bytes.equals(Buffer.from(canonical(record) + '\\n')), 'Record requires exact canonical JSON and final newline');", ''];
cases.push({ name: 'duplicate-json-key', edit: value => corruptRaw(value, Buffer.from(bytesOf(runRecord()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'))), mutations: [[source, 'return strictJson(new TextDecoder', 'return JSON.parse(new TextDecoder'], canonicalGate], wrong: r => r.scan.complete });
cases.push({ name: 'invalid-utf8', setup: () => fixture([{ ...runRecord(), key: 'attempt-\ufffd' }]), edit: value => { const bytes = Buffer.from(value.capture.objects[0].bytesBase64, 'base64'); const at = bytes.indexOf(Buffer.from('\ufffd')); corruptRaw(value, Buffer.concat([bytes.subarray(0, at), Buffer.from([255]), bytes.subarray(at + 3)])); }, mutations: [[source, '{ fatal: true, ignoreBOM: true }', '{ fatal: false, ignoreBOM: true }'], canonicalGate], wrong: r => r.scan.complete && r.runs[0].key === 'attempt-\ufffd' });
const closureSha256 = {};
for (const name of closure) closureSha256[`src/${name}.mjs`] = sha256(await readFile(join(root, `src/${name}.mjs`)));
const evidence = { closureSha256, schemaVersion: 1, kind: 'actual-source-capture-witnesses', sourceSha256: sha256(sourceBytes), evaluatedAt, witnesses: [], authority: 'synthetic-local-behavior-only', modelCoverage: 'outside-existing-TLC' };
const directory = await mkdtemp(join(await realpath(tmpdir()), 'emmy-capture-mutants-'));
const output = join(root, '.local/consumer-evidence/capture-mutations.json');
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
try {
  for (const variant of cases) {
    const value = variant.setup ? variant.setup() : fixture(); variant.edit?.(value);
    const results = {};
    for (const mode of ['baseline', 'mutant', 'restored']) {
      const selected = join(directory, variant.name + '-' + mode); await mkdir(selected);
      for (const name of closure) {
        let text = await readFile(join(root, `src/${name}.mjs`), 'utf8');
        if (mode === 'mutant') for (const [owner, anchor, replacement] of variant.mutations) if (owner === name) {
          assert.equal(text.split(anchor).length, 2, `Unique actual source anchor: ${variant.name}`); text = text.replace(anchor, replacement);
        }
        await writeFile(join(selected, name + '.mjs'), text);
      }
      const { consumeCapture } = await import(pathToFileURL(join(selected, source + '.mjs')).href);
      let result; let refusal;
      try { result = consumeCapture(bytesOf(value.scope), bytesOf(value.capture), { action: 'inspect', limit: 200 }, { evaluatedAt }); }
      catch (error) { refusal = error.message; }
      if (mode === 'mutant') { assert.equal(refusal, undefined, `Mutant must return its wrong concrete projection: ${variant.name}`); assert.ok(variant.wrong(result), `Wrong result witness: ${variant.name}`); }
      else if (variant.diagnostic) { assert.equal(refusal, undefined); assert.ok(result.runs.every(run => run.execution === 'unknown')); }
      else if (result) { assert.equal(result.scan.complete, false, `Incomplete baseline: ${variant.name}`); }
      else assert.ok(refusal, `Explicit baseline refusal: ${variant.name}`);
      results[mode] = result ? { scan: result.scan, counts: result.counts, runs: result.runs.map(run => ({ id: run.id, key: run.key, execution: run.execution, conflict: run.conflict })), resultSha256: result.resultSha256 } : { refused: true, reason: refusal };
    }
    evidence.witnesses.push({ name: variant.name, input: value, mutations: variant.mutations, results });
  }
  evidence.status = 'passed';
} catch (error) { evidence.status = 'failed'; evidence.failure = error.stack; throw error; }
finally { await writeFile(output, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 }); await rm(directory, { recursive: true, force: true }); }
console.log(JSON.stringify({ status: evidence.status, witnesses: evidence.witnesses.length, evidence: '.local/consumer-evidence/capture-mutations.json' }));
