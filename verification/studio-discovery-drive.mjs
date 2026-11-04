import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoveryCases, discoveryFixture } from './studio-discovery-properties.mjs';

export async function driveStudioDiscovery({ home, run, scenario, report, evidenceDir }) {
  const directory = join(evidenceDir, 'discovery'); await mkdir(directory, { recursive: true });
  report.retainedDiscovery = directory;
  const inputFile = join(directory, 'capture.json'); const indexFile = join(directory, 'index.json');
  const sentinels = [join(directory, 'journal.jsonl'), join(directory, 'schedule.toml')];
  for (const file of sentinels) await writeFile(file, `Retained sentinel ${file}\n`);
  const retained = await Promise.all(sentinels.map(file => readFile(file)));
  for (const [name, mutate, check] of discoveryCases()) {
    const input = discoveryFixture(); mutate(input); const bytes = JSON.stringify(input);
    const caseFile = join(directory, `${name}.input.json`); await writeFile(caseFile, bytes);
    const partial = !['saved-membership', 'inclusive-age', 'identical-duplicate', 'mcp-wrapper', 'opaque-native-id', 'opaque-status'].includes(name);
    const result = await run(['discovery', '--file', caseFile], partial ? 3 : 0); check(result);
    assert.deepEqual(await run(['discovery', '--file', caseFile], partial ? 3 : 0), result);
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
  assert.deepEqual(await Promise.all(sentinels.map(file => readFile(file))), retained);
  await assert.rejects(readFile(join(home, 'executor-invoked')), { code: 'ENOENT' });
  scenario('studio-discovery', 'Real CLI retains independently started project members across exact native pages, preserves partial/freshness/identity uncertainty, rebuilds without a prior index and leaves supplied input, journal and schedule sentinels unchanged. No executor is invoked.');
}
