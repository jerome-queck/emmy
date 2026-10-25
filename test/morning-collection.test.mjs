import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectionBegin, collectionCollect, collectionFinish, utf8Bytes, validateCollection } from '../src/morning-collection.mjs';
import { morningFixture, morningAt } from '../verification/morning-fixtures.mjs';
const fixture = () => { const f = morningFixture({ cleanupMode: 'batched-v1' }); const directory = join(mkdtempSync(join(tmpdir(), 'emmy-collect-')), 'private'); const source = f.run.sources[1]; const config = { runId: f.run.id, sourceId: source.id, scope: source.capture.receipt.scope, ownerRef: f.run.ownerRef, provenance: 'ordinary-authorized', jobKey: null, ticket: null }; collectionBegin(directory, config); return { f, directory, config }; };
const capture = attempt => ({ attempt, observedAt: morningAt, capturedAt: morningAt, outcome: 'returned' });
const details = { attempts: 1, coverage: { complete: true, gaps: [] }, paginationComplete: true, cached: false, messageIds: ['outlook-one'], resourceIds: [], window: null };
test('portable UTF8 counter matches actual bytes including nonASCII and lone surrogates without TextEncoder', () => {
  for (const text of ['ASCII', '中文é🙂', '\ud800', 'a\udfffz', 'ᚠ𐍈']) assert.equal(utf8Bytes(text), Buffer.byteLength(text));
});
test('raw response survives malformed JSON and failure after persistence; duplicate attempt cannot erase it', () => {
  const { directory } = fixture(); const raw = join(directory, 'supplied'); writeFileSync(raw, 'not JSON 中文🙂'); const saved = collectionCollect(directory, capture(1), raw);
  assert.equal(readFileSync(join(directory, saved.rawPath), 'utf8'), 'not JSON 中文🙂'); assert.equal(saved.bytes, null); assert.equal(saved.artifactBytes, Buffer.byteLength('not JSON 中文🙂')); assert.ok(saved.counterFailure);
  assert.throws(() => collectionCollect(directory, capture(1), raw), /already retained/);
  assert.ok(collectionCollect(directory, { ...capture(2), outcome: 'lost' }, raw).counterFailure); assert.ok(existsSync(join(directory, '2.raw')));
});
test('ordinary intake continues same open run without fabricating completed ticket and retains prior acquisition', () => {
  const { directory, f } = fixture(); const raw = join(directory, 'supplied'); writeFileSync(raw, '{"messages":["selected"]}'); const saved = collectionCollect(directory, capture(1), raw); const result = collectionFinish(directory, details); const packet = JSON.parse(readFileSync(join(directory, 'packet.json')));
  validateCollection(packet, result.command, f.run, new Map([[saved.sha256, readFileSync(raw)]])); const prior = f.run.sources[1].capture; const spec = f.run.specification;
  f.command('source', Object.fromEntries(Object.entries(result.command).filter(([key]) => !['step','runId'].includes(key))));
  assert.equal(f.run.specification, spec); assert.equal(f.run.sources[1].capture.jobKey, null); assert.deepEqual(f.run.sources[1].captureHistory, [prior]); assert.equal(result.ticketCompleted, false); assert.equal(packet.usage.budgetCompliance, 'unverified');
  assert.throws(() => validateCollection({ ...packet, outcome: 'denied' }, result.command, f.run, new Map([[saved.sha256, readFileSync(raw)]])), /Denied/);
  assert.throws(() => validateCollection(packet, result.command, f.run, new Map()), /unretained/);
});
test('thirteen attempts retain lost first response and known78082 lower bound as UNKNOWN total', () => {
  const { directory } = fixture(); collectionCollect(directory, { ...capture(1), outcome: 'lost', reason: 'Counter threw before raw response was saved; worker ended.' });
  const raw = join(directory, 'supplied');
  for (let attempt = 2; attempt <= 13; attempt++) { writeFileSync(raw, JSON.stringify('A'.repeat((attempt === 13 ? 6494 : 6508) - 2))); collectionCollect(directory, capture(attempt), raw); }
  assert.throws(() => collectionFinish(directory, { ...details, attempts: 13 }), /cannot claim complete/);
  collectionFinish(directory, { ...details, attempts: 13, coverage: { complete: false, gaps: ['Lost first payload; only one category observed, Other and final count unobserved.'] }, paginationComplete: false });
  const packet = JSON.parse(readFileSync(join(directory, 'packet.json'))); assert.equal(packet.usage.reads, 13); assert.equal(packet.usage.bytes, null); assert.equal(packet.usage.knownBytesLowerBound, 78082); assert.equal(packet.outcome, 'unknown');
});
test('changed unsent context appends review history, preserves owner correction and missing inbox IDs remain held', async () => {
  const { morningItem } = await import('../verification/morning-fixtures.mjs'); const { compactAssessments } = await import('../verification/morning-compact-fixtures.mjs');
  const { f } = fixture(); const item = morningItem('outlook'); f.command('review', { items: [item] }); f.command('correct', { adapter: 'outlook', nativeId: item.before.nativeId, disposition: 'dismissed', sourceRef: 'owner', reason: 'Handled.' });
  const at = '2026-10-25T01:00:01.000Z'; const source = f.run.sources[1]; const next = { ...source.capture, jobKey: null, acquisition: { provenance: 'ordinary-authorized', ownerRef: f.run.ownerRef, collectionRef: 'private-capture' }, receipt: { ...source.capture.receipt, observedAt: at, capturedAt: at } };
  f.command('source', Object.fromEntries(Object.entries(next).filter(([key]) => !['step','runId'].includes(key))), at);
  f.command('review', { items: [{ ...item, receipt: next.receipt, context: { ...item.context, actionRequired: true } }] }, at);
  assert.equal(f.run.items[0].classification.action, 'keep'); assert.equal(f.run.items[0].correction.disposition, 'dismissed'); assert.equal(f.run.items[0].reviewHistory.length, 1);
  f.command('source', { ...Object.fromEntries(Object.entries(next).filter(([key]) => !['step','runId'].includes(key))), messageIds: [] }, at);
  f.command('seal', compactAssessments(at), at); assert.ok(f.run.sealed.gaps.some(gap => gap.includes('not in current mail inventory'))); assert.match(f.run.sealed.body, /dismissed/);
});

test('ordinary40capture bound and serialized UTF8 bytes differ honestly from pretty artifact bytes', () => {
  const { directory } = fixture(); const raw = join(directory, 'supplied'); writeFileSync(raw, JSON.stringify({ text: '你好😀' }, null, 2) + '\n');
  for (let attempt = 1; attempt <= 40; attempt++) collectionCollect(directory, capture(attempt), raw);
  collectionFinish(directory, { ...details, attempts: 40 }); const packet = JSON.parse(readFileSync(join(directory, 'packet.json')));
  assert.equal(packet.usage.reads, 40); assert.equal(packet.captures[0].bytes, Buffer.byteLength(JSON.stringify({ text: '你好😀' }))); assert.ok(packet.captures[0].artifactBytes > packet.captures[0].bytes);
});
test('receiving finish emits hashed evidence and directly usable existing-journal envelope', () => {
  const { directory, f } = fixture(); const raw = join(directory, 'supplied'); writeFileSync(raw, JSON.stringify({ text: 'é' }, null, 2)); collectionCollect(directory, capture(1), raw);
  const owner = join(directory, 'owner.json'); writeFileSync(owner, '{"authority":"existing"}');
  const result = collectionFinish(directory, { ...details, envelope: { responsibilityId: 'existing-responsibility', expectedHead: 'a'.repeat(64), authorityEvidence: [{ sourceRef: f.run.ownerRef, path: owner }] } });
  assert.equal(result.input.action.operation, 'morning'); assert.equal(result.input.action.command.runId, f.run.id); assert.equal(result.input.expectedHead, 'a'.repeat(64)); assert.ok(result.input.evidence.every(ref => /^[a-f0-9]{64}$/.test(ref.sha256))); assert.deepEqual(JSON.parse(readFileSync(result.envelopePath)), result.input);
});
test('tool errors are counted and retained, never complete acquisition or invented denial', () => {
  const { directory } = fixture(); const raw = join(directory, 'supplied'); const value = { isError: true, content: [{ type: 'text', text: 'Stale tab; select the existing authorized tab.' }] }; writeFileSync(raw, JSON.stringify(value));
  const saved = collectionCollect(directory, capture(1), raw); assert.equal(saved.outcome, 'tool-error'); assert.equal(saved.bytes, Buffer.byteLength(JSON.stringify(value))); assert.equal(saved.requestedOutcome, 'returned');
  assert.throws(() => collectionFinish(directory, details), /cannot claim complete/);
  const result = collectionFinish(directory, { ...details, coverage: { complete: false, gaps: ['Stale tab response; source not acquired.'] }, paginationComplete: false }); assert.equal(result.command, null); assert.match(result.intakeHeld, /error|unknown/i);
});
test('strict raw parsing preserves invalid UTF8 and duplicate keys as unknown, with original metadata retained', () => {
  for (const bytes of [Buffer.from([123,34,120,34,58,34,0xff,34,125]), Buffer.from('{"readOnly":false,"readOnly":true}')]) {
    const { directory } = fixture(); const raw = join(directory, 'supplied'); writeFileSync(raw, bytes); const saved = collectionCollect(directory, capture(1), raw);
    assert.equal(saved.bytes, null); assert.ok(saved.counterFailure); assert.ok(existsSync(join(directory, '1.input.json'))); assert.deepEqual(readFileSync(join(directory, '1.raw')), bytes);
    const result = collectionFinish(directory, { ...details, coverage: { complete: false, gaps: ['Raw capture cannot be interpreted.'] }, paginationComplete: false }); assert.equal(result.command, null);
  }
});
test('lost capture allows unknown source time, persists metadata, and finishes held without fake fresh receipt', () => {
  const { directory } = fixture(); const saved = collectionCollect(directory, { ...capture(1), observedAt: null, outcome: 'lost', reason: 'Original response and source time unavailable.' });
  assert.equal(saved.observedAt, null); assert.ok(existsSync(join(directory, '1.input.json')));
  const result = collectionFinish(directory, { ...details, coverage: { complete: false, gaps: ['Original source time unknown.'] }, paginationComplete: false }); assert.equal(result.command, null); assert.match(result.intakeHeld, /unknown/);
  const packet = JSON.parse(readFileSync(join(directory, 'packet.json'))); assert.equal(packet.captures[0].observedAt, null);
});
test('ordinary intake rechecks actual raw error/parsing/accounting even for externally constructed packets', () => {
  const { directory, f } = fixture(); const raw = join(directory, 'supplied'); writeFileSync(raw, '{"data":"header"}'); const saved = collectionCollect(directory, capture(1), raw); const result = collectionFinish(directory, details); const packet = JSON.parse(readFileSync(join(directory, 'packet.json')));
  assert.throws(() => validateCollection({ ...packet, captures: [{ ...packet.captures[0], bytes: saved.bytes + 1 }] }, result.command, f.run, new Map([[saved.sha256, readFileSync(raw)]])), /accounting/);
  for (const bytes of [Buffer.from('{"isError":true}'), Buffer.from('{"x":1,"x":2}'), Buffer.from([123,34,120,34,58,34,255,34,125])]) {
    const external = { ...packet, captures: [{ ...packet.captures[0], artifactBytes: bytes.length, bytes: bytes.length }] };
    assert.throws(() => validateCollection(external, result.command, f.run, new Map([[saved.sha256, bytes]])));
  }
});
test('measurable lost/error wrapper does not become successful source acquisition', () => {
  const { directory } = fixture(); const raw = join(directory, 'supplied'); writeFileSync(raw, '{"diagnostic":"response lost"}'); const saved = collectionCollect(directory, { ...capture(1), outcome: 'lost', reason: 'Original source response lost; diagnostic wrapper only.' }, raw);
  assert.ok(saved.bytes > 0); assert.equal(saved.outcome, 'lost'); assert.throws(() => collectionFinish(directory, details), /cannot claim complete/);
  const result = collectionFinish(directory, { ...details, coverage: { complete: false, gaps: ['Original response lost.'] }, paginationComplete: false }); assert.equal(result.command, null);
});
