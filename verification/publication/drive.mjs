import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const edits = {
  'direct-canonical': [
    'const pending = join(base, `.pending-${randomUUID()}`);',
    'const pending = destination;',
  ],
  'reversed-import': [
    '  return result;\n}\n\nexport function canonicalRepository',
    '  return result.reverse();\n}\n\nexport function canonicalRepository',
  ],
};

async function snapshot(home) {
  const directory = join(home, 'records');
  const names = (await readdir(directory)).sort();
  const canonical = [];
  for (const hash of names.filter(name => /^[a-f0-9]{64}$/.test(name))) {
    const files = [];
    for (const name of (await readdir(join(directory, hash))).sort()) {
      const bytes = await readFile(join(directory, hash, name));
      files.push({ name, length: bytes.length, sha256: sha256(bytes) });
    }
    canonical.push({ hash, files });
  }
  return { canonical, pending: names.filter(name => name.startsWith('.pending-')) };
}

function start(root, inputPath, boundary, marker) {
  const env = { ...process.env };
  delete env.EMMY_VERIFY_BOUNDARY;
  delete env.EMMY_VERIFY_BOUNDARY_FILE;
  if (boundary) Object.assign(env, { EMMY_VERIFY_BOUNDARY: boundary, EMMY_VERIFY_BOUNDARY_FILE: marker });
  const child = spawn(process.execPath, [join(root, 'verification/publication/worker.mjs'), inputPath], { env });
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', bytes => { output.stdout += bytes; });
  child.stderr.on('data', bytes => { output.stderr += bytes; });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ ...output, code, signal }));
  });
  return { child, completion, output };
}

async function run(root, inputPath) {
  const process = start(root, inputPath);
  const deadline = setTimeout(() => process.child.kill('SIGKILL'), 15_000);
  try {
    const result = await process.completion;
    assert.equal(result.code, 0, `Publication child must succeed. ${JSON.stringify(result)}`);
    return { ...result, value: JSON.parse(result.stdout) };
  } finally { clearTimeout(deadline); }
}

async function stopped(root, inputPath, boundary, directory, inspect) {
  const marker = join(directory, 'checkpoint.json');
  const process = start(root, inputPath, boundary, marker);
  let checkpointBytes = '';
  let output;
  try {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      checkpointBytes = await readFile(marker, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      if (checkpointBytes.endsWith('\n')) break;
      assert.equal(process.child.exitCode, null, `Child exited before checkpoint. ${JSON.stringify(process.output)}`);
      assert.equal(process.child.signalCode, null, 'Child was signalled before checkpoint');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(checkpointBytes.endsWith('\n'), 'Checkpoint must contain a complete newline frame');
    const checkpoint = JSON.parse(checkpointBytes);
    assert.equal(checkpoint.boundary, boundary);
    assert.equal(checkpoint.pid, process.child.pid);
    const witness = await inspect();
    await save(join(directory, 'filesystem-witness.json'), { checkpoint, checkpointBytes, ...witness });
    return witness;
  } finally {
    process.child.kill('SIGKILL');
    output = await process.completion;
    await save(join(directory, 'child-output.json'), { checkpointBytes, ...output });
    assert.equal(output.signal, 'SIGKILL', 'The owned writer must stop before cleanup');
  }
}

export async function drivePublication(root, evidenceDir) {
  await mkdir(evidenceDir, { recursive: true });
  const source = await readFile(join(root, 'src/records.mjs'), 'utf8');
  const evidenceFile = join(evidenceDir, 'synthetic-evidence.bin');
  const evidenceBytes = 'publication contract synthetic evidence\n';
  await writeFile(evidenceFile, evidenceBytes);
  const prepare = async (name, mutation, operation) => {
    const directory = join(evidenceDir, name);
    await mkdir(directory, { recursive: true });
    let candidate = source;
    if (mutation) {
      const [before, after] = edits[mutation];
      assert.equal(source.split(before).length, 2, `${mutation} must replace one production expression`);
      candidate = source.replace(before, after);
    }
    const sourcePath = join(directory, 'records.mjs');
    await writeFile(sourcePath, candidate);
    const records = await import(pathToFileURL(sourcePath));
    const home = join(directory, 'home');
    const payload = { type: 'probe', schemaVersion: 1, nonce: 'publication-contract', value: 'a' };
    const files = { 'packet.md': evidenceBytes };
    const requested = records.recordPayload(payload, files);
    const input = { operation, source: sourcePath, home, payload, files };
    let predecessor;
    let successor;
    let definition;
    if (operation === 'import') {
      const subject = { projectId: 'publication-control', repository: 'https://example.invalid/publication-control', executor: 'dot-cloud', hostId: 'synthetic-host', revision: 'synthetic-revision', dirtyDigest: 'synthetic-clean' };
      const time = '2026-10-23T00:00:00Z';
      definition = await records.publishRecord(home, records.parseDefinition({ id: 'publication-control', parents: [], goal: 'Synthetic publication control', context: 'Isolated verifier fixture', target: subject, action: 'observe', resource: 'synthetic records', destination: 'synthetic private register', authorityRef: { reference: 'synthetic fixture authority', action: 'observe', resource: 'synthetic records', destination: 'synthetic private register' }, criteria: [{ id: 'publication', description: 'Synthetic publication control', evidence: 'reported-check' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: time, feature: { id: 'publication', method: 'synthetic control', intendedEffect: 'verify publication', reviewAt: time }, lifecycle: { status: 'active' } }));
      const observation = { type: 'observation', responsibilityId: 'publication-control', subject, observedAt: time, observer: 'predecessor', category: 'effect', availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], effects: [], evidenceRefs: [{ path: evidenceFile, sha256: sha256(evidenceBytes) }] };
      const extra = { 'evidence-0.bin': evidenceBytes };
      predecessor = records.recordPayload(records.parseObservation(observation), extra);
      const next = { ...observation, observer: 'successor', observedAt: '2026-10-23T00:00:01Z', supersedes: { hash: predecessor.hash, reason: 'Dependency is later in the input bundle.' } };
      successor = records.recordPayload(records.parseObservation(next), extra);
      input.bundle = { schemaVersion: 1, records: [next, observation] };
    }
    const inputPath = join(directory, 'input.json');
    await save(inputPath, input);
    return { directory, records, home, requested, definition, predecessor, successor, inputPath, sourceSha256: sha256(candidate) };
  };
  const direct = async (name, mutation) => {
    const fixture = await prepare(name, mutation, 'publish');
    const witness = await stopped(root, fixture.inputPath, 'record:created', fixture.directory, async () => {
      const state = await snapshot(fixture.home);
      const visible = state.canonical.find(record => record.hash === fixture.requested.hash);
      if (mutation) {
        assert.ok(visible, 'Mutant must expose the requested canonical hash before writing any file');
        assert.deepEqual(visible.files, [], 'The canonical directory must actually lack both requested files');
      } else {
        assert.equal(visible, undefined, 'Baseline must keep the incomplete record outside canonical names');
        assert.equal(state.pending.length, 1);
      }
      return { property: 'PublishedComplete', mutation: mutation ?? null, expectedHash: fixture.requested.hash, expectedFiles: ['packet.md', 'record.json'], unsafeCanonical: Boolean(visible), state };
    });
    if (mutation) return { property: witness.property, unsafeCanonical: witness.unsafeCanonical, witness: `${name}/filesystem-witness.json`, sourceSha256: fixture.sourceSha256 };
    const replay = await run(root, fixture.inputPath);
    assert.equal(replay.value.hash, fixture.requested.hash);
    assert.deepEqual(await fixture.records.readRecord(fixture.home, replay.value.hash), fixture.requested);
    const store = await fixture.records.readStore(fixture.home);
    assert.equal(store.records.length, 1);
    assert.equal(store.pending.length, 1, 'A killed pending directory remains excluded on retry');
    const concurrent = await Promise.all([run(root, fixture.inputPath), run(root, fixture.inputPath)]);
    assert.ok(concurrent.every(result => result.value.hash === fixture.requested.hash));
    const result = { hash: replay.value.hash, canonicalRecords: (await snapshot(fixture.home)).canonical.length, ignoredOrphans: store.pending.length, duplicateReadbacks: concurrent.map(result => result.value.hash) };
    await save(join(fixture.directory, 'replay.json'), { replay, concurrent, result });
    return result;
  };
  const imports = async (name, mutation) => {
    const fixture = await prepare(name, mutation, 'import');
    const witness = await stopped(root, fixture.inputPath, 'import:record:1', fixture.directory, async () => {
      const state = await snapshot(fixture.home);
      const has = hash => state.canonical.some(record => record.hash === hash);
      assert.equal(has(fixture.definition.hash), true);
      assert.equal(has(fixture.predecessor.hash), !mutation);
      assert.equal(has(fixture.successor.hash), Boolean(mutation));
      const published = await fixture.records.readRecord(fixture.home, mutation ? fixture.successor.hash : fixture.predecessor.hash);
      if (mutation) assert.equal(published.supersedes.hash, fixture.predecessor.hash);
      let storeRefusal;
      try { await fixture.records.readStore(fixture.home); }
      catch (error) { storeRefusal = error.message; }
      if (mutation) assert.match(storeRefusal, /Missing referenced record/);
      else assert.equal(storeRefusal, undefined);
      return { property: 'ImportPrefixSafe', mutation: mutation ?? null, predecessor: fixture.predecessor.hash, successor: fixture.successor.hash, missingDependency: Boolean(mutation), published, storeRefusal, state };
    });
    if (mutation) return { property: witness.property, missingDependency: witness.missingDependency, witness: `${name}/filesystem-witness.json`, sourceSha256: fixture.sourceSha256 };
    const replay = await run(root, fixture.inputPath);
    const repeated = await run(root, fixture.inputPath);
    const expected = [fixture.predecessor.hash, fixture.successor.hash];
    assert.deepEqual(replay.value.map(result => result.hash).sort(), [...expected].sort());
    assert.deepEqual(repeated.value.map(result => result.hash).sort(), [...expected].sort());
    const store = await fixture.records.readStore(fixture.home);
    assert.equal(store.records.length, 3);
    assert.equal(store.pending.length, 0);
    const result = { hashes: expected, canonicalRecords: store.records.length, pending: store.pending.length };
    await save(join(fixture.directory, 'replay.json'), { replay, repeated, result });
    return result;
  };
  const baseline = { direct: await direct('baseline-direct'), import: await imports('baseline-import') };
  const mutants = [await direct('mutant-direct', 'direct-canonical'), await imports('mutant-import', 'reversed-import')];
  const restored = { direct: await direct('restored-direct'), import: await imports('restored-import') };
  assert.deepEqual(restored, baseline, 'Unmodified production must reproduce the original baseline after both mutants');
  assert.equal(sha256(await readFile(join(root, 'src/records.mjs'))), sha256(source), 'The real source must remain unchanged');
  return { status: 'passed', baseline, mutants, restored, sourceSha256: sha256(source) };
}
