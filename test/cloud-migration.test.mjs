import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLegacyAttestation } from '../src/cloud-migration.mjs';
import { legacyAttestationFixture } from '../verification/cloud-migration-fixtures.mjs';

test('legacy attestation binds exact files, checkpoint and distinct reported call references without authenticating authority', () => {
  const fixture = legacyAttestationFixture(); const result = assessLegacyAttestation(fixture.attestation, fixture.files, fixture.id); assert.equal(result.historicalFreshness, 'reported-parent-attestation'); assert.equal(result.authenticatedParentAuthority, false);
});
for (const [name, mutate] of Object.entries({
  'same call reference': fixture => fixture.attestation.failedResume.toolCallRef = fixture.attestation.prepare.toolCallRef,
  'wrong original bytes': fixture => fixture.attestation.prepare.sha256 = 'f'.repeat(64),
  'wrong checkpoint head': fixture => fixture.attestation.checkpoint.headHash = 'f'.repeat(64),
  'wrong responsibility': fixture => fixture.attestation.responsibilityId = 'other',
  'no parent review': fixture => delete fixture.attestation.parentReview,
  'resume already executed work': fixture => fixture.files.failedResume.value.calls.push({ command: 'cloud' }),
  'unrelated failure': fixture => fixture.files.failedResume.value.error.message = 'different',
  'modern checkpoint': fixture => fixture.files.checkpoint.value.incarnation = { status: 'unknown' },
})) test(`legacy migration refuses ${name}`, () => { const fixture = legacyAttestationFixture(); mutate(fixture); assert.throws(() => assessLegacyAttestation(fixture.attestation, fixture.files, fixture.id)); });
test('partial sidecar evidence refuses without changing its bytes', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const { readAcceptanceJson } = await import('../src/cloud-migration.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'emmy-partial-baseline-')); const path = join(directory, 'partial.json'); const bytes = Buffer.from('{"schemaVersion":1');
  try { await writeFile(path, bytes); await assert.rejects(readAcceptanceJson(path, 65536)); assert.deepEqual(await readFile(path), bytes); } finally { await rm(directory, { recursive: true, force: true }); }
});
