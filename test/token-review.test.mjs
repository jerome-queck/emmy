import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assessTokenReview } from '../src/token-review.mjs';
import { tokenCapture } from '../verification/token-review-fixtures.mjs';
const evaluatedAt = '2026-10-29T04:00:00Z';
const assess = input => assessTokenReview(input, { evaluatedAt });
const change = edit => { const input = tokenCapture(); edit(input); return assess(input); };
test('complete cost includes failed objective, helper and retry with cached input counted once', () => {
  const value = assess(tokenCapture()); assert.equal(value.status, 'checked');
  assert.deepEqual(value.costPerVerifiedSuccess, { status: 'available', basis: 'supplied-measured', currency: 'USD', unit: 'microdollar', numerator: 30, denominator: 1 });
  assert.equal(value.usageSubtotals[0].total, 210); assert.equal(value.usageSubtotals[0].cachedInput, 50);
  assert.equal(value.costSubtotals[0].coverage, 'partial'); assert.equal(value.tokenSavings.status, 'unavailable');
});
test('measured zero is available while absent, estimated and mixed data remain unavailable', () => {
  assert.equal(change(input => input.attempts.forEach(row => { row.cost.value = 0; })).costPerVerifiedSuccess.numerator, 0);
  for (const edit of [input => { input.attempts[0].cost = { basis: 'unavailable', reason: 'Not supplied' }; }, input => { input.attempts[0].cost.basis = 'estimated'; input.attempts[0].cost.method = 'Synthetic supplied estimate'; }, input => { input.attempts[0].cost.currency = 'SGD'; }, input => { input.attempts[0].cost.unit = 'cent'; }, input => { input.attempts[0].usage.basis = 'estimated'; input.attempts[0].usage.method = 'Synthetic supplied estimate'; }]) assert.equal(change(edit).costPerVerifiedSuccess.status, 'unavailable');
  assert.throws(() => change(input => { delete input.attempts[0].cost; }));
});
test('incomplete inventories, no success, unsettled outcomes and missing verification cannot establish complete cost', () => {
  for (const edit of [input => { input.inventory.attempts = 'partial'; }, input => { input.inventory.objectives = 'unavailable'; }, input => { input.objectives[0].outcome = 'failed'; }, input => { input.objectives[1].outcome = 'pending'; }, input => { input.objectives[1].outcome = 'unknown'; }, input => { input.objectives[0].evidenceIds = []; }, input => { input.attempts[0].evidenceIds = []; }, input => { input.attempts = []; }, input => { input.objectives = []; input.attempts = []; }]) {
    const value = change(edit); assert.equal(value.status, 'needs-evidence'); assert.equal(value.costPerVerifiedSuccess.status, 'unavailable');
  }
});
test('source window and original acquisition times stay age bounded', () => {
  for (const edit of [input => { input.evidence[0].acquiredAt = '2026-10-29T04:00:01Z'; }, input => { input.evidence[0].observedAt = '2026-10-29T03:59:59Z'; }, input => { input.reviewWindow.start = '2026-10-26T00:00:00Z'; input.evidence[0].observedAt = '2026-10-27T00:00:00Z'; input.evidence[0].acquiredAt = '2026-10-27T00:00:01Z'; }, input => { input.reviewWindow.end = '2026-10-29T05:00:00Z'; }]) assert.equal(change(edit).status, 'needs-evidence');
  assert.throws(() => change(input => { input.evidence[0].observedAt = '2026-02-30T04:00:00Z'; }));
});
test('duplicate IDs, aggregate overlap, invalid cache subset, floats and overflow are rejected', () => {
  for (const edit of [input => { input.attempts.push(input.attempts[0]); }, input => { input.objectives.push(input.objectives[0]); }, input => { input.attempts[0].kind = 'aggregate'; }, input => { input.attempts[0].covers = ['helper']; }, input => { input.attempts[0].usage.cachedInput = 101; }, input => { input.attempts[0].cost.value = 0.1; }, input => { input.attempts[0].cost.value = Number.MAX_SAFE_INTEGER; }, input => { input.attempts[0].objectiveId = 'missing'; }]) assert.throws(() => change(edit));
});
test('supported observations are opportunities and preserve deterministic input under permutation', () => {
  const input = tokenCapture(); input.observations = [{ id: 'reads', category: 'repeated-reads-tools', summary: 'Inspect repeated reads for necessary refreshes.', evidenceIds: ['source'], attemptIds: ['lead', 'helper'] }];
  const original = JSON.stringify(input); const value = assess(input); assert.equal(value.status, 'needs-review'); assert.equal(value.opportunities[0].status, 'review-opportunity'); assert.equal(JSON.stringify(input), original);
  input.objectives.reverse(); input.attempts.reverse(); input.observations[0].attemptIds.reverse(); assert.deepEqual(assess(input), value);
  const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } }; freeze(input); assert.deepEqual(assess(input), value);
});
test('fresh-process CLI binds exact UTF-8 bytes, does not write its private home and refuses malformed or oversized files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'token-review-test-')); const file = join(directory, 'capture.json'); const home = join(directory, 'absent-home');
  const run = path => { const child = spawnSync(process.execPath, ['scripts/agent.mjs', 'token-review', '--file', path, '--home', home], { encoding: 'utf8' }); return { code: child.status, ...JSON.parse(child.stdout) }; };
  try {
    const bytes = JSON.stringify(tokenCapture(new Date().toISOString()), null, 2); await writeFile(file, bytes); const value = run(file); assert.equal(value.code, 0); assert.equal(value.data.inputDigest, createHash('sha256').update(bytes).digest('hex')); assert.ok(Date.now() - Date.parse(value.data.evaluatedAt) < 10000); assert.equal(await readFile(file, 'utf8'), bytes); await assert.rejects(readFile(join(home, 'bindings.json')));
    await writeFile(file, bytes.replace('"schemaVersion": 1,', '"schemaVersion": 1, "schemaVersion": 1,')); assert.equal(run(file).code, 2);
    await writeFile(file, '{}'); assert.equal(run(file).code, 2);
    await writeFile(file, Buffer.from([0xff])); assert.equal(run(file).code, 2);
    await writeFile(file, ' '.repeat(262145)); assert.equal(run(file).code, 2);
    await symlink(file, join(directory, 'link')); assert.equal(run(join(directory, 'link')).code, 2);
    await mkdir(join(directory, 'folder')); assert.equal(run(join(directory, 'folder')).code, 2);
    const partial = tokenCapture(new Date().toISOString()); partial.inventory.attempts = 'partial'; await writeFile(file, JSON.stringify(partial)); assert.equal(run(file).code, 3);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('fresh acquisition cannot refresh stale original observations', () => {
  const input = tokenCapture(); input.reviewWindow.start = '2026-10-26T00:00:00Z'; input.evidence[0].observedAt = '2026-10-27T00:00:00Z';
  assert.equal(assess(input).status, 'needs-evidence'); assert.ok(assess(input).findings.some(row => row.code === 'stale-evidence'));
});
test('estimate methods and unavailable reasons are required', () => {
  assert.throws(() => change(input => { input.attempts[0].cost = { basis: 'unavailable' }; }));
  assert.throws(() => change(input => { input.attempts[0].cost.basis = 'estimated'; }));
});
