import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { discoveryCases, discoveryFixture } from './studio-discovery-properties.mjs';

async function homeSnapshot(root, relative = '') {
  const entries = [];
  for (const name of (await readdir(join(root, relative))).sort()) {
    const path = join(relative, name); const fullPath = join(root, path); const info = await lstat(fullPath);
    if (info.isDirectory()) { entries.push({ path, kind: 'directory' }); entries.push(...await homeSnapshot(root, path)); }
    else if (info.isFile()) entries.push({ path, kind: 'file', sha256: createHash('sha256').update(await readFile(fullPath)).digest('hex') });
    else if (info.isSymbolicLink()) entries.push({ path, kind: 'symlink', target: await readlink(fullPath) });
    else entries.push({ path, kind: 'special', mode: info.mode, rdev: info.rdev });
  }
  return entries;
}

export async function driveStudioDiscovery({ home, run, scenario, report, evidenceDir }) {
  const directory = join(evidenceDir, 'discovery'); await mkdir(directory, { recursive: true });
  report.retainedDiscovery = directory;
  const fifoRoot = await mkdtemp(join(directory, 'snapshot-fifo-'));
  try {
    const fifo = join(fifoRoot, 'fifo'); execFileSync('mkfifo', [fifo]);
    const info = await lstat(fifo); assert.equal(info.isFIFO(), true);
    const snapshot = await homeSnapshot(fifoRoot);
    assert.deepEqual(snapshot, [{ path: 'fifo', kind: 'special', mode: info.mode, rdev: info.rdev }]);
    await writeFile(join(directory, 'fifo-snapshot.json'), JSON.stringify(snapshot, null, 2));
  } finally { await rm(fifoRoot, { recursive: true, force: true }); }

  const inputFile = join(directory, 'capture.json'); const indexFile = join(directory, 'index.json');
  const beforeHome = await homeSnapshot(home);
  await writeFile(join(directory, 'home-before.json'), JSON.stringify(beforeHome, null, 2));
  for (const [name, mutate, check, reject = false] of discoveryCases()) {
    const input = discoveryFixture(); mutate(input); const bytes = JSON.stringify(input);
    const caseFile = join(directory, `${name}.input.json`); await writeFile(caseFile, bytes);
    const partial = !['saved-membership', 'inclusive-age', 'identical-duplicate', 'mcp-wrapper', 'opaque-native-id', 'valid-offset-leap-day', 'opaque-status'].includes(name);
    const expectedExit = reject ? 2 : partial ? 3 : 0;
    const result = await run(['discovery', '--file', caseFile], expectedExit); if (reject) assert.equal(result.ok, false); else check(result);
    assert.deepEqual(await run(['discovery', '--file', caseFile], expectedExit), result);
    assert.equal(await readFile(caseFile, 'utf8'), bytes);
  }
  const input = discoveryFixture();
  input.active.pages[0].response.nextCursor = 'second-page';
  const page = structuredClone(input.active.pages[0]); page.request.cursor = 'second-page'; page.response.nextCursor = null;
  page.response.threads = [{ ...page.response.threads[0], id: 'independent-second-page' }]; input.active.pages.push(page);
  await writeFile(inputFile, JSON.stringify(input));
  const baseline = await run(['discovery', '--file', inputFile]);
  assert.equal(baseline.tasks.length, 2); assert.equal(baseline.sources.active.validPages, 2);
  await writeFile(indexFile, JSON.stringify(baseline));
  await writeFile(indexFile, 'corrupt disposable index');
  assert.deepEqual(await run(['discovery', '--file', inputFile]), baseline);
  await rm(indexFile); assert.deepEqual(await run(['discovery', '--file', inputFile]), baseline);
  for (const invalid of [{ ...input, schemaVersion: 2 }, { ...input, maxAgeMs: -1 }, { ...input, maxAgeMs: Number.MAX_SAFE_INTEGER + 1 }]) {
    await writeFile(inputFile, JSON.stringify(invalid)); await run(['discovery', '--file', inputFile], 2);
  }
  await writeFile(inputFile, ' '.repeat(1048577)); await run(['discovery', '--file', inputFile], 2);
  await writeFile(inputFile, '{"schemaVersion":1,"schemaVersion":1}'); await run(['discovery', '--file', inputFile], 2);
  const afterHome = await homeSnapshot(home);
  await writeFile(join(directory, 'home-after.json'), JSON.stringify(afterHome, null, 2));
  assert.deepEqual(afterHome, beforeHome, 'Discovery must preserve every selected private-home directory, file byte, symlink and special-file metadata; added journals also fail');
  await assert.rejects(readFile(join(home, 'executor-invoked')), { code: 'ENOENT' });
  scenario('studio-discovery', 'Real CLI retains independently started project members across exact native pages, preserves partial/freshness/identity uncertainty, rebuilds without a prior index and leaves supplied input and the complete selected private-home tree unchanged. No executor is invoked.');
}
