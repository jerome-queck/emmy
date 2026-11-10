import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const digest = value => createHash('sha256').update(value).digest('hex');
const name = `${digest('synthetic-slot')}.json`;
const missing = async path => { try { await readFile(path); return false; } catch (e) { if (e.code === 'ENOENT') return true; throw e; } };
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Unique actual source anchor required: ${before}`);
  return source.replace(before, after);
}
function instrument(source) {
  for (const [before, after] of [
    ["const handle = await open(temporary, 'wx', 0o600);", "const handle = await open(temporary, 'wx', 0o600); await globalThis.slotBoundary?.('created');"],
    ['await handle.writeFile(bytes);', "await handle.writeFile(bytes); await globalThis.slotBoundary?.('written');"],
    ['await handle.close(); }\n  try {', "await handle.close(); await globalThis.slotBoundary?.('closed'); }\n  try {"],
    ["await link(temporary, join(directory, name)); return 'published';", "await link(temporary, join(directory, name)); await globalThis.slotBoundary?.('canonical'); return 'published';"],
    ['await link(temporary, marker);', "await link(temporary, marker); await globalThis.slotBoundary?.('marker');"],
    ['await link(temporary, join(directory, conflict));', "await link(temporary, join(directory, conflict)); await globalThis.slotBoundary?.('evidence');"],
    ['await unlink(temporary);', "await unlink(temporary); await globalThis.slotBoundary?.('cleanup');"]
  ]) source = replaceOnce(source, before, after);
  return source;
}
export async function driveSlot(root, selected, source) {
  await mkdir(selected, { recursive: true });
  const modules = new Map();
  const prepare = async (id, bytes) => {
    const path = join(selected, `${id}.mjs`); await writeFile(path, bytes);
    const module = await import(pathToFileURL(path)); modules.set(id, { path, module }); return modules.get(id);
  };
  const base = await prepare('baseline', source);
  const options = module => ({ maximum: 16384, validateConflict: async (path, slot, original) => {
    assert.equal(slot, name.slice(0, -5));
    const retained = await module.ordinary(path, 16384);
    assert.ok(['a', 'b', 'c'].includes(retained), 'Invalid symbolic conflict bytes');
    assert.notEqual(retained, original);
  } });
  const call = (module, dir, bytes) => module.publishSlot(dir, name, bytes, options(module));
  const dir = async id => { const path = join(selected, id); await mkdir(path); return path; };
  const baseline = async id => {
    const same = await dir(`${id}-same`);
    assert.deepEqual((await Promise.all([call(base.module, same, 'a'), call(base.module, same, 'a')])).sort(), ['identical', 'published']);
    const distinct = await dir(`${id}-distinct`);
    assert.deepEqual((await Promise.all([call(base.module, distinct, 'a'), call(base.module, distinct, 'b')])).sort(), ['conflict', 'published']);
    const original = await readFile(join(distinct, name), 'utf8'); const marker = await readFile(join(distinct, `conflict-${name}`), 'utf8');
    assert.notEqual(original, marker);
    assert.equal(await call(base.module, distinct, 'c'), 'conflict');
    assert.equal(await readFile(join(distinct, name), 'utf8'), original);
    assert.equal(await readFile(join(distinct, `conflict-${name}`), 'utf8'), marker);
    for (const value of ['a', 'b', 'c'].filter(value => value !== original)) assert.equal(await readFile(join(distinct, `conflict-${name.slice(0, -5)}-${digest(value)}.json`), 'utf8'), value);
    return { exactRetries: true, firstCanonical: original, firstMarker: marker, thirdCandidateRetained: true };
  };
  const before = await baseline('before');
  const observerDir = await dir('observer');
  await call(base.module, observerDir, 'a');
  const observedSlot = await readFile(join(observerDir, name), 'utf8');
  const markerInitiallyMissing = await missing(join(observerDir, `conflict-${name}`));
  assert.equal(markerInitiallyMissing, true);
  await call(base.module, observerDir, 'b');
  const laterMarker = await readFile(join(observerDir, `conflict-${name}`), 'utf8');
  assert.equal(observedSlot, 'a'); assert.equal(laterMarker, 'b');
  const corruptDir = await dir('corrupt-marker');
  await call(base.module, corruptDir, 'a');
  await writeFile(join(corruptDir, `conflict-${name}`), 'invalid');
  await assert.rejects(call(base.module, corruptDir, 'b'), /Invalid symbolic conflict bytes/);
  assert.equal(await readFile(join(corruptDir, name), 'utf8'), 'a');
  const instrumented = await prepare('instrumented', instrument(source));
  async function stop(modulePath, directory, bytes, boundary, id) {
    const checkpoint = join(selected, `${id}-checkpoint.json`);
    const child = spawn(process.execPath, [join(root, 'verification/briefing-slot/worker.mjs'), modulePath, directory, name, bytes, boundary, checkpoint]);
    let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
    const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
    const started = Date.now();
    try {
      while (await missing(checkpoint)) {
        if (Date.now() - started > 10000 || child.exitCode !== null) throw new Error(`Missing checkpoint ${boundary}: ${output}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const captured = JSON.parse(await readFile(checkpoint)); assert.equal(captured.boundary, boundary); assert.equal(captured.pid, child.pid);
    } finally { child.kill('SIGKILL'); await completion; }
    return { checkpoint, output };
  }
  const crashes = [];
  for (const boundary of ['created', 'written', 'closed', 'canonical', 'marker', 'evidence', 'cleanup']) {
    const directory = await dir(`crash-${boundary}`); const conflicting = ['marker', 'evidence'].includes(boundary);
    if (conflicting) await call(base.module, directory, 'a');
    await stop(instrumented.path, directory, conflicting ? 'b' : 'a', boundary, `crash-${boundary}`);
    if (['created', 'written', 'closed'].includes(boundary)) assert.equal(await missing(join(directory, name)), true);
    else assert.equal(await readFile(join(directory, name), 'utf8'), 'a');
    const result = await call(base.module, directory, conflicting ? 'b' : 'a');
    assert.equal(result, conflicting ? 'conflict' : ['created', 'written', 'closed'].includes(boundary) ? 'published' : 'identical');
    crashes.push({ boundary, retriedOnce: true, result, files: await readdir(directory) });
  }
  const mutants = [];
  const early = replaceOnce(source, 'try { await handle.writeFile(bytes); }', "try { await link(temporary, join(directory, name)); await globalThis.slotBoundary?.('early'); await handle.writeFile(bytes); }");
  const earlyModule = await prepare('early-mutant', early); const earlyDir = await dir('early-mutant-files');
  await stop(earlyModule.path, earlyDir, 'complete-request', 'early', 'early');
  const partial = await readFile(join(earlyDir, name), 'utf8'); assert.notEqual(partial, 'complete-request');
  mutants.push({ id: 'early', invariant: 'PublishedComplete', actualCanonicalBytes: partial });
  const overwrite = replaceOnce(source, 'await link(temporary, join(directory, name));', "await unlink(join(directory, name)).catch(error => { if (error.code !== 'ENOENT') throw error; }); await link(temporary, join(directory, name));");
  const overwrittenModule = await prepare('overwrite-mutant', overwrite); const overwriteDir = await dir('overwrite-mutant-files');
  await call(overwrittenModule.module, overwriteDir, 'a'); await call(overwrittenModule.module, overwriteDir, 'b');
  assert.equal(await readFile(join(overwriteDir, name), 'utf8'), 'b');
  mutants.push({ id: 'overwrite', invariant: 'CanonicalImmutable', before: 'a', after: 'b' });
  const omitted = replaceOnce(source, 'await link(temporary, marker);', 'await Promise.resolve();');
  const omittedModule = await prepare('omit-marker-mutant', omitted); const omittedDir = await dir('omit-marker-mutant-files');
  await call(omittedModule.module, omittedDir, 'a'); assert.equal(await call(omittedModule.module, omittedDir, 'b'), 'conflict');
  assert.equal(await missing(join(omittedDir, `conflict-${name}`)), true);
  mutants.push({ id: 'omit-marker', invariant: 'ConflictRetained', returned: 'conflict', markerMissing: true });
  const after = await baseline('restored');
  assert.equal(after.exactRetries, before.exactRetries);
  assert.equal(after.thirdCandidateRetained, before.thirdCandidateRetained);
  return { baseline: before, observer: { observedSlot, markerInitiallyMissing, laterMarker, atomicSnapshotClaimed: false }, invalidCallbackEvidenceRefused: true, crashes, mutants, restored: after, sourceUnchanged: true };
}
