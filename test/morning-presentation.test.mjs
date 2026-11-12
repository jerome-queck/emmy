import test from 'node:test';
import assert from 'node:assert/strict';
import { morningFixture, morningItem, morningAssessments, morningAt, morningRoot, refreshMorning } from '../verification/morning-fixtures.mjs';
import { fleetView } from '../src/fleet-state.mjs';
import { fleetSummary } from '../src/fleet.mjs';
import { morningView } from '../src/morning.mjs';
import { digest } from '../src/records.mjs';

function fixture(phase) {
  const f = morningFixture();
  if (phase !== 'open') {
    const items = [morningItem(), morningItem('outlook')];
    if (phase === 'needs-summary') for (const item of items) item.context.actionRequired = true;
    f.command('review', { items });
    f.command('seal', morningAssessments());
    f.command('send-intent', { sendRef: 'synthetic-send', bodyDigest: f.run.sealed.bodyDigest });
    if (phase !== 'uncertain-send') f.command('send-ack', { sendRef: 'synthetic-send', bodyDigest: f.run.sealed.bodyDigest, deliveredBodyDigest: f.run.sealed.bodyDigest, nativeId: 'synthetic-message', readbackRef: 'synthetic-readback' });
    if (phase === 'uncertain-edit') { f.command('summary'); f.command('edit-intent', { editRef: 'synthetic-edit', bodyDigest: f.run.summary.bodyDigest, nativeId: 'synthetic-message' }); }
    if (phase === 'selected-refresh') refreshMorning(f);
  }
  const head = { type: 'fleet-step', hash: digest(phase), rootHash: morningRoot.hash, parentHash: morningRoot.hash, state: f.state };
  return { ...f, root: morningRoot, records: [morningRoot, head] };
}
for (const phase of ['open', 'uncertain-send', 'needs-cleanup', 'needs-summary', 'uncertain-edit', 'selected-refresh']) test(`current ${phase} presentation is read-only while historical interpretation stays exact`, () => {
  const f = fixture(phase); const before = structuredClone(f.state); const historical = morningView(f.state.morningRuns, morningAt);
  const current = fleetView(f.records, f.root.responsibilityId, morningAt);
  assert.equal(current.morning[0].mode, 'historical-read-only');
  assert.match(current.morning[0].nextAction, /retained compatible installation on a copy/);
  assert.match(current.morning[0].nextAction, /uncertain effects/);
  assert.equal(current.morning[0].status, historical[0].status);
  assert.equal(current.morning[0].delivery, historical[0].delivery);
  assert.deepEqual(fleetView(f.records, f.root.responsibilityId, morningAt, { historicalMorningAdvice: true }).morning, historical);
  assert.deepEqual(fleetSummary(f.records, f.root.responsibilityId, morningAt)[0].morning, current.morning);
  assert.deepEqual(f.state, before);
});
