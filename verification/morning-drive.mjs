import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, digest, publishRecord, readStore } from '../src/records.mjs';
import { fleetInitial, fleetTransition, fleetState } from '../src/fleet-state.mjs';

export async function driveMorning({ root: temporaryRoot, home, bindings, run, scenario, report }) {
  const selected = join(home, 'morning-drive'); await mkdir(selected, { recursive: true });
  await writeFile(join(selected, 'bindings.json'), JSON.stringify(bindings));
  const packed = JSON.parse(await readFile(new URL('../test/fixtures/morning-v3-history.json', import.meta.url)));
  const bytes = gunzipSync(Buffer.from(packed.data, 'base64')); assert.equal(digest(bytes), packed.sha256);
  const fixture = JSON.parse(bytes); const originals = fixture.records;
  const ordered = originals.toSorted((a, b) => (a.record.type === 'definition' ? -2 : a.record.type === 'fleet-root' ? -1 : a.record.seq) - (b.record.type === 'definition' ? -2 : b.record.type === 'fleet-root' ? -1 : b.record.seq));
  const statusPath = join(selected, 'status.json');
  let currentStatusChecks = 0;
  let root; let state;
  for (const entry of ordered) {
    const { hash, fileDigests, ...payload } = entry.record;
    if (payload.type === 'fleet-step') { const result = fleetTransition(state, payload.action, root, payload.at, payload.epochHash); state = result.state; assert.equal(digest(state), entry.stateDigest); payload.state = state; }
    const result = await publishRecord(selected, payload, Object.fromEntries(Object.entries(entry.files).map(([name, value]) => [name, Buffer.from(value, 'base64')])));
    assert.equal(result.record.hash, hash, 'Historical canonical bytes and identities stay exact');
    if (payload.type === 'fleet-root') { root = result.record; state = fleetInitial(root); }
    if (payload.action?.operation === 'morning' && ['open', 'send-intent', 'send-ack', 'summary', 'edit-intent'].includes(payload.action.command.step)) {
      await writeFile(statusPath, canonical({ schemaVersion: 1, responsibilityId: root.responsibilityId, action: { operation: 'status' } }));
      const view = await run(['fleet', '--file', statusPath], 3, selected);
      assert.equal(view.morning[0].mode, 'historical-read-only');
      assert.match(view.morning[0].nextAction, /current morning writes are unsupported/);
      assert.deepEqual(view.state.morningRuns, state.morningRuns);
      currentStatusChecks++;
    }
  }
  const before = (await readStore(selected)).records; const id = root.responsibilityId;
  assert.deepEqual(fleetState(before, id).state, state);
  assert.ok(state.morningMigration); assert.equal(state.morningRuns.at(-1).policyVersion, 3);
  assert.equal(state.morningRuns.at(-1).delivery.status, 'delivered');
  const manifest = async directory => Object.fromEntries(await Promise.all(before.flatMap(record => ['record.json', ...Object.keys(record.fileDigests ?? {})].map(async name => { const path = join('records', record.hash, name); return [path, digest(await readFile(join(directory, path)))]; }))));
  const originalBytes = await manifest(selected);
  await run(['doctor'], 3, selected);
  await writeFile(statusPath, canonical({ schemaVersion: 1, responsibilityId: id, action: { operation: 'status' } }));
  const status = await run(['fleet', '--file', statusPath], 3, selected);
  assert.deepEqual(status.state.morningRuns, state.morningRuns);
  const actions = [...new Map(ordered.filter(entry => entry.record.action?.operation === 'morning').map(entry => [entry.record.action.command.step, entry.record.action])).values()];
  actions.push({ operation: 'morning', command: { step: 'open', policyVersion: 2 } }, { operation: 'morning', command: { step: 'open', policyVersion: 1 } });
  for (const [index, action] of actions.entries()) {
    const path = join(selected, `refused-${index}.json`); await writeFile(path, canonical({ schemaVersion: 1, responsibilityId: id, expectedHead: status.headHash, action, evidence: [] }));
    assert.match((await run(['fleet', '--file', path], 2, selected)).error, /historical replay-only/);
  }
  assert.deepEqual(await manifest(selected), originalBytes); assert.equal((await readStore(selected)).records.length, before.length);
  const review = (await run(['reconcile', '--id', id, '--as-of', new Date().toISOString()], 3, selected)).responsibilities[0].record;
  assert.equal(review.fleetViewVersion, 3); assert.equal(review.fleet[0].morning[0].mode, 'historical-read-only');
  assert.deepEqual(await manifest(selected), originalBytes);
  const archive = join(temporaryRoot, 'bin', 'morning-archive'); await run(['backup', '--to', archive], 0, selected);
  const restored = join(selected, 'restored'); await run(['restore', '--from', archive, '--into', restored], 0, selected);
  await run(['doctor'], 3, restored);
  const recovered = await run(['fleet', '--file', statusPath], 3, restored);
  assert.equal(recovered.status, 'suspended'); assert.deepEqual(recovered.state.morningRuns, state.morningRuns); assert.deepEqual(await manifest(restored), originalBytes);
  await cp(archive, join(selected, 'retained-archive'), { recursive: true });
  await writeFile(join(selected, 'original-byte-manifest.json'), canonical(originalBytes));
  report.morningHistory = { records: (await readStore(selected)).records.length, frozenRecords: before.length, currentStatusChecks, reviewViewVersion: review.fleetViewVersion, fixtureDigest: packed.sha256, headHash: status.headHash, bodyDigest: state.morningRuns.at(-1).sealed.bodyDigest, refusedSteps: actions.map(action => action.command.step), restored: true, nativeEffects: 0 };
  scenario('morning-run', 'Frozen synthetic migrated v3 canonical history replays exact bytes, identities and delivered outcomes; current morning actions refuse before publication. Fresh CLI status at retained open/send/edit prefixes and current responsibility review show read-only history; backup and suspended restore preserve original records. Historical reducer source properties remain separate; no live producer or provider acceptance.');
}
