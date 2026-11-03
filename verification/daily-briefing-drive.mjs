import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dailyFixture } from './daily-briefing-fixtures.mjs';
export async function driveDailyBriefing({ home, run, scenario, report, evidenceDir }) {
  const directory = join(evidenceDir, 'daily-briefing'); await mkdir(directory, { recursive: true });
  const { input, save } = await dailyFixture(directory);
  const foundation = await run(['daily-briefing', '--file', (await save('foundation-request.json', { action: 'foundation', input: {} })).path]);
  assert.equal(foundation.id, 'emmy-operating-foundation'); assert.equal(foundation.state, 'staged'); assert.equal(foundation.effectsAuthorized, false);
  const request = await save('compile-request.json', { action: 'compile', directory, input });
  const first = await run(['daily-briefing', '--file', request.path]); assert.equal(first.status, 'published');
  assert.equal((await run(['daily-briefing', '--file', request.path])).status, 'identical');
  const read = await save('read-request.json', { action: 'read', directory, identity: input.identity, maxAgeSeconds: 300 });
  await writeFile(join(directory, 'unrelated-malformed.json'), 'unselected malformed history');
  const selected = await run(['daily-briefing', '--file', read.path]); assert.equal(selected.status, 'available'); assert.equal(selected.effectsAuthorized, false); assert.equal(selected.result.execution, 'compiled-only'); assert.equal(selected.delivery, 'unverified');
  const original = await readFile(first.path);
  const source = input.sources[0]; const data = JSON.parse(await readFile(source.artifact.path)); data.inboxIds.push('unreviewed-native-id'); source.artifact = await save('gmail-partial.json', data);
  const partial = await save('conflict-request.json', { action: 'compile', directory, input });
  assert.equal((await run(['daily-briefing', '--file', partial.path], 3)).status, 'conflict'); assert.deepEqual(await readFile(first.path), original); assert.equal((await run(['daily-briefing', '--file', read.path], 3)).status, 'conflict');
  const invalid = await save('invalid-request.json', { action: 'compile', directory, input: { ...input, asOf: 'invalid' } }); await run(['daily-briefing', '--file', invalid.path], 2);
  report.retainedDailyBriefing = { directory, artifact: first.path, bodyDigest: selected.result.bodyDigest, originalBytes: original.length, synthetic: true };
  scenario('daily-briefing-pilot', 'Fresh real CLI compiles exact supplied source files, repeats idempotently, reads only exact occurrence/marker, preserves contradictory candidates and refuses invalid clocks. Every artifact remains held without effect or delivery authority.');
}
