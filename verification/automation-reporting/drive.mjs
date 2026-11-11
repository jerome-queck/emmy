import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const save = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const evaluatedAt = '2026-11-01T00:00:00Z';
const base = { schemaVersion: 1, namespace: 'synthetic', automationId: 'review', kind: 'run', key: 'run-one', revision: 0, previous: null, recordedAt: evaluatedAt, data: { occurrenceKey: null, execution: 'completed', coverage: 'partial', report: null, evidenceRefs: ['synthetic:evidence'] } };
function replace(source, before, after) { assert.equal(source.split(before).length, 2, `Expected one actual-source mutation anchor: ${before}`); return source.replace(before, after); }
export async function driveAutomationReporting(root, evidence) {
  await mkdir(evidence, { recursive: true });
  const source = await readFile(join(root, 'src/automation-reporting.mjs'), 'utf8');
  const prepare = async (name, mutation) => {
    const directory = join(evidence, name); await mkdir(directory, { recursive: true });
    let candidate = source;
    if (mutation === 'partial') candidate = replace(candidate, 'const temporary = join(namespace, `.pending-${randomUUID()}`);', 'const temporary = join(namespace, `${hash}.json`);');
    if (mutation === 'accept') candidate = replace(candidate, 'const usable = record => complete && record.valid && !record.conflict;', 'const usable = record => true;');
    if (mutation === 'stale') candidate = replace(candidate, 'const stale = sourceTimes.some(time => Date.parse(evaluatedAt) - Date.parse(time) > maxAgeSeconds * 1000);', 'const stale = false;');
    if (mutation === 'terminal') candidate = replace(candidate, 'return executionStable && receiptStable && controlStable &&', 'return receiptStable && controlStable &&');
    if (mutation === 'receipt') candidate = replace(candidate, 'return executionStable && receiptStable && controlStable &&', 'return executionStable && controlStable &&');
    if (mutation === 'missing') candidate = replace(candidate, "state, runIds: observed.map(run => run.id), execution: 'not-inferred'", "state, runIds: observed.map(run => run.id), execution: 'completed'");
    if (mutation === 'authority') candidate = replace(candidate, "assurance: 'reported', publication: 'pending'", "assurance: 'authenticated', publication: 'pending'");
    const checkpointSource = `const handle = await open(temporary, 'wx', 0o600);
  if (process.env.EMMY_REPORT_MODEL_MARKER) {
    setInterval(() => { void handle.fd; }, 1000);
    if (typeof global.gc !== 'function') throw new Error('Checkpoint GC stress requires --expose-gc');
    global.gc();
    await import('node:fs/promises').then(fs => fs.writeFile(process.env.EMMY_REPORT_MODEL_MARKER, JSON.stringify({ temporary, hash, pid: process.pid, gcStressed: true, fd: handle.fd }) + '\\n'));
    await new Promise(() => {});
  }`;
    candidate = replace(candidate, "const handle = await open(temporary, 'wx', 0o600);", checkpointSource);
    const path = join(directory, 'automation-reporting.mjs'); await writeFile(path, candidate);
    for (const dependency of ['bounded-json.mjs', 'strict-json.mjs', 'immutable-slot.mjs', 'improvement-report.mjs', 'reporting-privacy.mjs', 'automation-reporting-outcome.mjs', 'automation-reporting-expectations.mjs']) await writeFile(join(directory, dependency), await readFile(join(root, 'src', dependency)));
    const api = await import(pathToFileURL(path));
    const home = join(directory, 'home'); await mkdir(home);
    return { directory, path, api, home };
  };
  const publication = async (name, mutation) => {
    const trial = await prepare(name, mutation); const marker = join(trial.directory, 'marker.json'); const input = join(trial.directory, 'input.json');
    await save(input, { source: trial.path, marker, evaluatedAt, request: { action: 'publish-own-record', directory: trial.home, namespace: base.namespace, record: base } });
    const child = spawn(process.execPath, ['--expose-gc', join(root, 'verification/automation-reporting/worker.mjs'), input]);
    let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
    const completion = new Promise(resolve => { child.on('error', error => resolve({ code: null, signal: null, output, spawnError: error.message })); child.on('close', (code, signal) => resolve({ code, signal, output })); });
    let witness; let primaryError; let cleanupError; let stopped;
    try {
      let checkpoint;
      for (let i = 0; i < 500; i++) {
        const bytes = await readFile(marker, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
        if (bytes.endsWith('\n')) { checkpoint = JSON.parse(bytes); break; }
        assert.equal(child.exitCode, null, output); await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(checkpoint, 'Writer must reach actual open-before-write boundary');
      assert.equal(checkpoint.pid, child.pid);
      assert.equal(checkpoint.gcStressed, true); assert.ok(Number.isInteger(checkpoint.fd) && checkpoint.fd >= 0, 'The opened handle must survive forced GC at the checkpoint');
      const canonical = join(trial.home, base.namespace, `${trial.api.recordDigest(base)}.json`);
      const bytes = await readFile(canonical).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      witness = { property: 'PublishedComplete', checkpoint, canonicalPresent: bytes !== null, canonicalBytes: bytes?.length ?? null };
      assert.equal(witness.canonicalPresent, mutation === 'partial'); if (mutation) assert.equal(bytes.length, 0);
      await save(join(trial.directory, 'witness.json'), witness);
    } catch (error) { primaryError = error; }
    finally {
      try {
        const killRequested = child.kill('SIGKILL'); stopped = { ...await completion, killRequested, pid: child.pid ?? null };
        await save(join(trial.directory, 'process.json'), stopped);
        assert.equal(stopped.signal, 'SIGKILL', 'Owned stopped writer must end by SIGKILL; an unrelated child exception is not a mutant witness');
      } catch (error) { cleanupError = error; }
    }
    if (primaryError || cleanupError) {
      const describe = error => error ? { name: error.name, message: error.message, stack: error.stack } : null;
      let retentionError;
      try { await save(join(trial.directory, 'failure.json'), { primary: describe(primaryError), cleanup: describe(cleanupError), process: stopped ?? null }); }
      catch (error) { retentionError = error; }
      throw new AggregateError([primaryError, cleanupError, retentionError].filter(Boolean), [primaryError && `Primary failure: ${primaryError.message}`, cleanupError && `Cleanup failure: ${cleanupError.message}`, retentionError && `Evidence retention failure: ${retentionError.message}`].filter(Boolean).join('; '));
    }
    if (!mutation) {
      const request = { action: 'publish-own-record', directory: trial.home, namespace: base.namespace, record: base };
      const published = await trial.api.automationReporting(request, { evaluatedAt });
      const retry = await trial.api.automationReporting(request, { evaluatedAt });
      assert.equal(published.status, 'published'); assert.equal(retry.status, 'identical');
      assert.equal(await readFile(join(trial.home, base.namespace, `${published.id}.json`), 'utf8'), `${trial.api.canonical(base)}\n`);
      await save(join(trial.directory, 'restart-retry.json'), { published, retry });
    }
    return witness;
  };
  const projection = async (name, mutation) => {
    const trial = await prepare(name, mutation);
    const previous = trial.api.recordDigest(base);
    const b = { ...base, revision: 1, previous, data: { ...base.data, execution: 'completed' } };
    const c = { ...b, data: { ...b.data, evidenceRefs: ['synthetic:conflicting-evidence'] } };
    const receipt = { ...base, kind: 'delivery', key: 'receipt', data: { subject: previous, state: 'verified', evidenceRef: 'synthetic:delivery-claim' } };
    const incomplete = trial.api.aggregate([base], { evaluatedAt, complete: false });
    const conflict = trial.api.aggregate([base, b, c], { evaluatedAt });
    const missing = trial.api.aggregate([b], { evaluatedAt });
    assert.equal(missing.runs[0].execution, mutation === 'accept' ? 'completed' : 'unknown');
    assert.ok(missing.findings.some(f => f.startsWith('missing-or-invalid-predecessor:')));
    await trial.api.automationReporting({ action: 'publish-own-record', directory: trial.home, namespace: base.namespace, record: base }, { evaluatedAt });
    await writeFile(join(trial.home, base.namespace, `${'d'.repeat(64)}.json`), '{broken');
    const corrupt = await trial.api.automationReporting({ action: 'inspect', directory: trial.home }, { evaluatedAt });
    assert.equal(corrupt.scan.complete, false);
    assert.equal(corrupt.runs[0].execution, mutation === 'accept' ? 'completed' : 'unknown');
    const claims = trial.api.aggregate([base, receipt], { evaluatedAt });
    const automation = { ...base, kind: 'automation', key: 'configuration', data: { name: 'Synthetic', enabled: true, schedule: 'synthetic', environment: 'local', nativeRef: 'synthetic:native', model: 'supplied', destination: 'synthetic:destination', freshChat: true, archiveOnSuccess: true, sourceRef: 'synthetic:source', observedAt: '2026-10-29T00:00:00Z' } };
    const oldReport = { schemaVersion: 1, kind: 'maintenance', scheduledFor: evaluatedAt, runId: base.key, provenance: 'manual', status: 'completed', coverage: 'partial', summary: 'Synthetic', findings: 0, evidenceRefs: ['synthetic:evidence'], sourceWindow: { start: '2026-10-28T00:00:00Z', end: '2026-10-29T00:00:00Z' }, generatedAt: evaluatedAt };
    const sourceAge = trial.api.aggregate([automation, { ...base, data: { ...base.data, report: oldReport } }], { evaluatedAt });
    assert.equal(sourceAge.automations[0].stale, mutation !== 'stale');
    assert.equal(sourceAge.runs[0].stale, mutation !== 'stale');
    const generic = { schemaVersion: 1, type: 'automation-outcome', runId: base.key, provenance: 'manual', scheduledFor: null, status: 'completed', coverage: 'partial', availability: 'unavailable', summary: 'Synthetic generic outcome', artifactLinks: [], sourceWindow: null, generatedAt: evaluatedAt };
    const genericState = trial.api.aggregate([{ ...base, data: { ...base.data, report: generic } }], { evaluatedAt });
    assert.equal(genericState.runs[0].reportAvailability, 'unavailable');
    assert.equal(genericState.runs[0].assurance, mutation === 'authority' ? 'authenticated' : 'reported');
    const timing = { startedAt: null, lastHeartbeatAt: null, endedAt: null, observedAt: '2026-10-29T00:00:00Z', sourceRef: 'synthetic:timing-observation' };
    const timingAge = trial.api.aggregate([{ ...base, data: { ...base.data, timing } }], { evaluatedAt });
    assert.equal(timingAge.runs[0].stale, mutation !== 'stale');
    assert.deepEqual(timingAge.runs[0].actualTiming, timing);
    assert.deepEqual(claims.runs[0].actualTiming, { startedAt: null, lastHeartbeatAt: null, endedAt: null, observedAt: null, sourceRef: null });
    const stale = trial.api.aggregate([base], { evaluatedAt: '2026-11-03T00:00:00Z' });
    assert.equal(stale.runs[0].stale, mutation !== 'stale');
    assert.equal(stale.findings.some(f => f.startsWith('stale:')), mutation !== 'stale');
    const witness = { missingExecution: missing.runs[0].execution, corruptExecution: corrupt.runs[0].execution, stale: stale.runs[0].stale, property: mutation === 'authority' ? 'NoFalseAuthority' : 'AcceptedSafe', incompleteExecution: incomplete.runs[0].execution, conflictExecutions: conflict.runs.map(r => r.execution), assurance: claims.runs[0].assurance, deliveryClaim: claims.runs[0].userDelivery };
    if (mutation === 'accept') { assert.equal(witness.incompleteExecution, 'completed'); assert.ok(witness.conflictExecutions.every(s => s === 'completed')); }
    else { assert.equal(witness.incompleteExecution, 'unknown'); assert.ok(witness.conflictExecutions.every(s => s === 'unknown')); }
    assert.equal(witness.assurance, mutation === 'authority' ? 'authenticated' : 'reported'); assert.equal(witness.deliveryClaim, 'verified');
    await save(join(trial.directory, 'witness.json'), { ...witness, incomplete, conflict, missing, corrupt, stale, sourceAge, timingAge, genericState, claims }); return witness;
  };
  const transitions = async (name, mutation) => {
    const trial = await prepare(name, mutation);
    const run = { ...base, revision: 1, previous: trial.api.recordDigest(base), data: { ...base.data, execution: 'running' } };
    const receipt = { ...base, kind: 'delivery', key: 'receipt', data: { subject: trial.api.recordDigest(base), state: 'verified', evidenceRef: 'synthetic:delivery' } };
    const regression = { ...receipt, revision: 1, previous: trial.api.recordDigest(receipt), data: { ...receipt.data, state: 'failed' } };
    const occurrence = { ...base, kind: 'occurrence', key: 'expected-only', data: { scheduledFor: evaluatedAt, expiresAt: evaluatedAt } };
    const state = trial.api.aggregate([base, run, receipt, regression, occurrence], { evaluatedAt });
    assert.equal(state.runs[0].valid, mutation === 'terminal');
    assert.equal(state.deliveries[0].valid, mutation === 'receipt');
    assert.equal(state.occurrences[0].execution, mutation === 'missing' ? 'completed' : 'not-inferred');
    const publish = record => trial.api.automationReporting({ action: 'publish-own-record', directory: trial.home, namespace: base.namespace, record }, { evaluatedAt });
    await publish(base); await publish(receipt);
    if (mutation === 'terminal') assert.equal((await publish(run)).status, 'published'); else await assert.rejects(publish(run), /Missing or invalid predecessor/);
    if (mutation === 'receipt') assert.equal((await publish(regression)).status, 'published'); else await assert.rejects(publish(regression), /Missing or invalid predecessor/);
    const witness = { terminalRegressionAccepted: state.runs[0].valid, receiptRegressionAccepted: state.deliveries[0].valid, missingExecution: state.occurrences[0].execution };
    await save(join(trial.directory, 'witness.json'), { ...witness, state }); return witness;
  };
  const baseline = [await publication('baseline-publication'), await projection('baseline-projection'), await transitions('baseline-transitions')];
  const mutants = [await publication('mutant-partial', 'partial'), await projection('mutant-accept', 'accept'), await projection('mutant-authority', 'authority'), await projection('mutant-stale', 'stale'), await transitions('mutant-terminal', 'terminal'), await transitions('mutant-receipt', 'receipt'), await transitions('mutant-missing', 'missing')];
  const restored = [await publication('restored-publication'), await projection('restored-projection'), await transitions('restored-transitions')];
  assert.deepEqual(restored.map(({ checkpoint, ...rest }) => rest), baseline.map(({ checkpoint, ...rest }) => rest));
  return { baseline, mutants, restored };
}
