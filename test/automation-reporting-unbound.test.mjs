import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { aggregate, automationReporting, canonical, recordDigest, validateRecord } from '../src/automation-reporting.mjs';
import { validateOutcomeReport } from '../src/automation-reporting-outcome.mjs';
import { sanitizeRecords } from '../src/automation-reporting-transport.mjs';
import { exportOutcome } from '../src/automation-reporting-export.mjs';
import { reconcileExpectations } from '../src/automation-reporting-control.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = '2020-01-02T04:20:00.000Z';
const envelope = (kind, key, data, recordedAt, extra = {}) => ({ schemaVersion: 1, namespace: 'fixture', automationId: 'daily', kind, key, revision: 0, previous: null, recordedAt, data, ...extra });
const automation = envelope('automation', 'definition', { name: 'Synthetic daily', enabled: true, schedule: 'daily declared', environment: 'local', nativeRef: 'synthetic-native', model: 'declared', destination: 'private', freshChat: true, archiveOnSuccess: null, sourceRef: 'synthetic-source', observedAt: '2020-01-02T04:00:00.000Z' }, '2020-01-02T04:00:00.000Z');
const start = envelope('run', 'synthetic-invocation', { occurrenceKey: null, execution: 'running', coverage: 'unavailable', report: null, evidenceRefs: [] }, '2020-01-02T04:06:08.000Z');
const terminal = envelope('run', start.key, { occurrenceKey: null, execution: 'completed', coverage: 'complete', report: null, evidenceRefs: [] }, '2020-01-02T04:11:30.000Z', { revision: 1, previous: recordDigest(start) });
const outcome = () => ({ schemaVersion: 2, type: 'automation-outcome', runId: start.key, provenance: 'scheduled-unbound', scheduledFor: null, status: 'completed', coverage: 'complete', availability: 'available', summary: 'Synthetic daily completed, 420/700. Retained evidence, no extra workload.', artifactLinks: [], sourceWindow: null, generatedAt: at, sourceEvidence: { observedAt: null, recordedAt: terminal.recordedAt }, generation: { mode: 'retrospective', attestedBy: 'authorized-report-compiler', basedOn: recordDigest(terminal) } });
const successor = () => envelope('run', start.key, { ...structuredClone(terminal.data), report: outcome(), evidenceRefs: ['retained-artifact-sha256:' + 'a'.repeat(64)] }, at, { revision: 2, previous: recordDigest(terminal) });
const history = () => [automation, start, terminal, successor()];
const view = (records, extra = {}) => aggregate(records, { evaluatedAt: at, ...extra });

async function fixture(fn) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'emmy-unbound-'));
  try { await fn(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('retrospective same-invocation content is readable without an invented nominal slot', () => {
  const original = canonical(terminal); const result = view(history()); const run = result.runs[0];
  assert.equal(run.execution, 'completed'); assert.equal(run.reportAvailability, 'available');
  assert.equal(run.data.report.summary, outcome().summary); assert.equal(run.invocationProvenance, 'scheduled-unbound');
  assert.equal(run.nominalSlot, null); assert.equal(run.data.occurrenceKey, null); assert.equal(run.data.report.scheduledFor, null);
  assert.equal(run.sourceClockBasis, 'original-record'); assert.equal(run.data.report.sourceEvidence.observedAt, null);
  assert.deepEqual(run.actualTiming, { startedAt: null, lastHeartbeatAt: null, endedAt: null, observedAt: null, sourceRef: null });
  assert.equal(canonical(terminal), original); assert.equal(result.publications.length, 0); assert.equal(result.deliveries.length, 0);
  assert.ok(result.findings.some(value => value.startsWith('scheduled-unbound:')));
  const exported = exportOutcome(successor());
  assert.equal(exported.schemaVersion, 2); assert.equal(exported.invocation.provenance, 'scheduled-unbound');
  assert.deepEqual(exported.generation, outcome().generation); assert.deepEqual(exported.sourceEvidence, outcome().sourceEvidence);
  assert.equal(exported.userDelivery, 'pending');
});

test('new content is an explicit version, with strict unknown-slot and generation shapes', () => {
  assert.equal(validateOutcomeReport(outcome()).schemaVersion, 2);
  for (const change of [{ provenance: 'manual' }, { provenance: 'scheduled' }, { scheduledFor: '2020-01-02T04:10:00.000Z' }, { schemaVersion: 3 }, { extra: true }, { sourceEvidence: { observedAt: at, recordedAt: terminal.recordedAt } }, { generation: { mode: 'retrospective', attestedBy: 'compiler', basedOn: null } }]) assert.throws(() => validateOutcomeReport({ ...outcome(), ...change }));
  const bound = successor(); bound.data.occurrenceKey = 'guessed-slot'; assert.throws(() => validateRecord(bound, at), /cannot name an occurrence/);
  const rootClaim = successor(); rootClaim.revision = 0; rootClaim.previous = null; assert.throws(() => validateRecord(rootClaim, at), /existing run predecessor/);
  for (const basedOn of [['a'.repeat(64)], { digest: 'a'.repeat(64) }, 1, true]) assert.throws(() => validateOutcomeReport({ ...outcome(), generation: { ...outcome().generation, basedOn } }), /retrospective evidence basis/);
});

test('retrospective attachment pins its exact completed source and preserves execution metadata', () => {
  const mutations = [
    value => { value.data.report.generation.basedOn = 'b'.repeat(64); },
    value => { value.data.report.sourceEvidence.recordedAt = '2020-01-02T04:12:30.000Z'; },
    value => { value.data.report.sourceEvidence.observedAt = '2020-01-02T04:12:30.000Z'; value.data.report.sourceEvidence.recordedAt = at; },
    value => { value.data.timing = { startedAt: null, lastHeartbeatAt: null, endedAt: null, observedAt: at, sourceRef: 'new-wrapper' }; },
    value => { value.data.telemetry = { runtimeMs: 1, inputTokens: null, outputTokens: null, sourceRef: 'new-wrapper' }; },
    value => { value.data.report.sourceWindow = { start: '2020-01-02T04:06:08.000Z', end: '2020-01-02T04:12:30.000Z' }; },
    value => { value.data.execution = 'failed'; value.data.report.status = 'failed'; },
  ];
  for (const mutate of mutations) {
    const value = successor(); mutate(value);
    const result = view([automation, start, terminal, value]); assert.equal(result.runs[0].valid, false);
  }
  const first = successor(); const carried = { ...structuredClone(first), revision: 3, previous: recordDigest(first), recordedAt: '2020-01-02T04:21:00.000Z' };
  assert.equal(view([...history(), carried], { evaluatedAt: carried.recordedAt }).runs[0].valid, true);
  carried.data.report.generatedAt = carried.recordedAt;
  assert.equal(view([...history(), carried], { evaluatedAt: carried.recordedAt }).runs[0].valid, false);
  const competing = successor(); competing.data.report.summary = 'Different retained interpretation.';
  assert.equal(view([...history(), competing]).runs.every(value => value.reportAvailability === 'conflict-or-incomplete'), true);
});

test('new generation does not rejuvenate original evidence and unknown source age stays unknown', () => {
  const equality = '2020-01-02T04:21:30.000Z';
  assert.equal(view(history(), { evaluatedAt: equality, maxAgeSeconds: 600 }).runs[0].sourceFreshness, 'within-configured-age');
  const late = view(history(), { evaluatedAt: '2020-01-02T04:21:30.001Z', maxAgeSeconds: 600 }).runs[0];
  assert.equal(late.stale, true); assert.equal(late.sourceFreshness, 'stale'); assert.equal(late.reportAvailability, 'available');
  const producer = successor(); producer.revision = 0; producer.previous = null;
  producer.data.report.generation = { mode: 'producer', attestedBy: 'producer', basedOn: null };
  producer.data.report.sourceEvidence = { observedAt: null, recordedAt: null };
  const unknown = view([automation, producer]); assert.equal(unknown.runs[0].sourceFreshness, 'unknown');
  assert.ok(unknown.findings.some(value => value.startsWith('source-age-unknown:')));
});

test('readable completed unbound outcome cannot satisfy an independent configured slot', async () => fixture(async directory => {
  const authority = { namespace: 'control', automationId: 'control' };
  const plan = await reconcileExpectations({ directory, ...authority, evaluatedAt: automation.recordedAt, captures: [{ actor: 'registration-control', targetNamespace: 'fixture', targetAutomationId: 'daily', nativeRef: 'synthetic-job', enabled: true, rrule: 'FREQ=DAILY;BYHOUR=4;BYMINUTE=10', dtstart: null, timezone: 'UTC', timezoneSource: 'explicit-owner-zone', sourceKind: 'cloud-definition', sourceRef: 'synthetic-selected-capture', observedAt: automation.recordedAt }] });
  const result = view([...plan.records, ...history()], { controlAuthority: authority });
  const expected = result.expectations.find(value => value.data.scheduledFor === '2020-01-02T04:10:00.000Z');
  assert.equal(expected.state, 'expected'); assert.deepEqual(expected.runIds, []); assert.equal(expected.execution, 'not-inferred');
}));

test('transport preserves legacy bytes and remaps the retrospective basis without downgrading', () => {
  const old = sanitizeRecords([automation, start, terminal], { namespace: 'fixture', evaluatedAt: at });
  const next = sanitizeRecords(history(), { namespace: 'fixture', evaluatedAt: at });
  for (const record of old.records) assert.ok(next.records.some(value => canonical(value) === canonical(record)));
  const mapped = next.records.find(value => value.revision === 2);
  const basis = next.mapping.find(value => value.sourceDigest === recordDigest(terminal)).targetDigest;
  assert.equal(mapped.previous, basis); assert.equal(mapped.data.report.generation.basedOn, basis);
  assert.equal(mapped.data.report.schemaVersion, 2); assert.equal(mapped.data.report.provenance, 'scheduled-unbound');
  assert.deepEqual(mapped.data.report.sourceEvidence, outcome().sourceEvidence);
  assert.equal(aggregate(next.records, { evaluatedAt: at }).runs[0].valid, true);
  assert.deepEqual(sanitizeRecords(history(), { namespace: 'fixture', evaluatedAt: at }), next);
});

test('real CLI retains old history, exposes new content and preserves conflicting attachments', async () => fixture(async directory => {
  const input = join(directory, 'record.json'); const store = join(directory, 'store'); await mkdir(store);
  const cli = args => spawnSync(process.execPath, ['scripts/automation-reporting.mjs', ...args], { cwd: root, encoding: 'utf8' });
  for (const record of history()) {
    await writeFile(input, JSON.stringify(record));
    const result = cli(['publish-own-record', '--directory', store, '--namespace', 'fixture', '--file', input]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  }
  const old = await readFile(join(store, 'fixture', recordDigest(terminal) + '.json'));
  const result = cli(['inspect', '--directory', store, '--namespace', 'fixture', '--as-of', at]);
  assert.equal(JSON.parse(result.stdout).data.runs[0].data.report.summary, outcome().summary);
  const competing = successor(); competing.data.report.summary = 'A conflicting late attachment.'; await writeFile(input, JSON.stringify(competing));
  const retained = cli(['publish-own-record', '--directory', store, '--namespace', 'fixture', '--file', input]); assert.equal(retained.status, 0);
  const conflicted = cli(['inspect', '--directory', store, '--namespace', 'fixture', '--as-of', at]);
  assert.equal(JSON.parse(conflicted.stdout).data.runs.every(value => value.conflict && value.reportAvailability === 'conflict-or-incomplete'), true);
  const invalid = successor(); invalid.data.report.generation.basedOn = 'c'.repeat(64); await writeFile(input, JSON.stringify(invalid));
  assert.equal(cli(['publish-own-record', '--directory', store, '--namespace', 'fixture', '--file', input]).status, 2);
  assert.deepEqual(await readFile(join(store, 'fixture', recordDigest(terminal) + '.json')), old);
}));

test('legacy validator deliberately refuses new content while its records remain readable', async () => fixture(async directory => {
  for (const name of ['automation-reporting-outcome', 'reporting-privacy']) await writeFile(join(directory, name + '.mjs'), execFileSync('git', ['show', '0034c1887a33b056e1337130796fe840da9dd31a:src/' + name + '.mjs'], { cwd: root }));
  const legacy = await import(pathToFileURL(join(directory, 'automation-reporting-outcome.mjs')).href);
  assert.throws(() => legacy.validateOutcomeReport(outcome()), /Invalid generic/);
  assert.equal(view([automation, start, terminal]).runs[0].execution, 'completed');
  const schema = JSON.parse(await readFile(join(root, 'schemas/automation-reporting-v3.schema.json')));
  assert.equal(schema.$defs.unboundReport.properties.schemaVersion.const, 2);
  for (const version of [1, 2]) assert.deepEqual(await readFile(join(root, `schemas/automation-reporting-v${version}.schema.json`)), execFileSync('git', ['show', `0034c1887a33b056e1337130796fe840da9dd31a:schemas/automation-reporting-v${version}.schema.json`], { cwd: root }));
}));
