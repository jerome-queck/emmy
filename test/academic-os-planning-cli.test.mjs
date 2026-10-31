import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { academicOsPlanningFixture } from '../verification/academic-os-planning-fixtures.mjs';
import { academicOsPlanFixture } from '../verification/academic-os-plan-fixtures.mjs';
import { buildAcademicOsPlanningCatalog } from '../src/academic-os-planning.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const normalize = (value, stage) => {
  const copy = structuredClone(value);
  if (['prepare', 'acquire'].includes(stage) && copy.data?.prepared) { delete copy.data.prepared.preparedAt; delete copy.data.prepared.preparedDigest; }
  if (copy.data) delete copy.data.checkedAt;
  return copy;
};

test('compact launcher preserves all planning stages, wire output, guards and exit codes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emmy-compact-planning-'));
  const request = join(directory, 'request.json'); const envelope = join(directory, 'envelope.json');
  try {
    await writeFile(envelope, JSON.stringify({ schemaVersion: 1, action: 'academic-os', requestFile: request }));
    const call = (script, expected) => {
      const result = spawnSync(process.execPath, [join(root, 'scripts', script), 'calendar-register', '--file', envelope], { encoding: 'utf8' });
      assert.equal(result.status, expected, result.stdout + result.stderr);
      assert.equal(result.stderr, '');
      return JSON.parse(result.stdout);
    };
    const compare = async (body, expected = 0) => {
      const bytes = typeof body === 'string' ? body : JSON.stringify({ schemaVersion: 1, ...body });
      await writeFile(request, bytes);
      const general = call('agent.mjs', expected); const compact = call('academic-os-planning.mjs', expected);
      assert.deepEqual(normalize(compact, body.stage), normalize(general, body.stage));
      assert.equal(await readFile(request, 'utf8'), bytes);
      return compact.data;
    };
    const input = academicOsPlanningFixture();
    const catalog = (await compare({ stage: 'publish', catalog: input.catalogInput })).catalog;
    await compare({ stage: 'validate', catalog });
    const { operationId: omitted, ...selector } = input.request;
    const discovered = await compare({ stage: 'discover', catalog, selector });
    input.request.operationId = discovered.authorizations[0].operationId;
    const acquired = await compare({ stage: 'acquire', catalog, request: input.request, observation: input.observation });
    await compare({ stage: 'revalidate', catalog, prepared: acquired.prepared, observation: input.observation });
    const revised = structuredClone(input.catalogInput); revised.authorizations[0].authorityRef += '-during-backup';
    const newCatalog = buildAcademicOsPlanningCatalog(revised);
    assert.equal((await compare({ stage: 'revalidate', catalog: newCatalog, prepared: acquired.prepared, observation: input.observation }, 3)).call, null);
    const terminal = structuredClone(input.observation); terminal.result.report.tasks[1].status = 'completed';
    await compare({ stage: 'acquire', catalog, request: input.request, observation: terminal }, 3);
    const expired = structuredClone(input.catalogInput); expired.policy.assignments[0].observedAt = new Date(Date.now() - 86400001).toISOString();
    await compare({ stage: 'publish', catalog: expired }, 2);
    const partial = structuredClone(input.catalogInput); partial.coverage.complete = false;
    await compare({ stage: 'publish', catalog: partial }, 2);
    const forged = structuredClone(catalog); forged.policyVersion = 'fixture-policy';
    await compare({ stage: 'validate', catalog: forged }, 2);
    await compare({ stage: 'acquire', catalog, request: { ...input.request, taskId: 'other-task' }, observation: input.observation }, 2);
    await compare({ stage: 'acquire', catalog, request: input.request, observation: { ...input.observation, policy: catalog.policy } }, 2);
    const direct = academicOsPlanFixture('complete');
    await compare({ stage: 'prepare', intent: direct.intent, observation: direct.observation });
    const receiptAt = new Date().toISOString();
    for (const outcome of ['applied', 'uncertain', 'conflict']) {
      await compare({ stage: 'receipt', prepared: acquired.prepared, receipt: { attemptedAt: receiptAt, observedAt: receiptAt, evidenceRef: 'synthetic-compact-original-receipt', report: { schemaVersion: 1, operationId: acquired.prepared.intent.operationId, outcome, taskId: acquired.prepared.intent.identity.taskId, registerFresh: outcome === 'applied' }, isError: outcome !== 'applied' } }, outcome === 'applied' ? 0 : 3);
    }
    await compare({ stage: 'receipt', prepared: acquired.prepared, receipt: { attemptedAt: receiptAt, observedAt: receiptAt, evidenceRef: 'synthetic-compact-lost-response', transportError: 'lost response' } }, 3);
    await compare({ stage: 'unsupported' }, 2);
    await compare({ stage: 'validate', catalog, extra: true }, 2);
    await compare('{"schemaVersion":1,"schemaVersion":1,"stage":"validate"}', 2);
    await writeFile(envelope, '{"schemaVersion":1,"schemaVersion":1,"action":"academic-os"}');
    assert.deepEqual(call('academic-os-planning.mjs', 2), call('agent.mjs', 2));
    await writeFile(envelope, JSON.stringify({ schemaVersion: 1, action: 'academic-os', requestFile: request, extra: true }));
    assert.deepEqual(call('academic-os-planning.mjs', 2), call('agent.mjs', 2));
    await writeFile(envelope, JSON.stringify({ schemaVersion: 1, action: 'academic-os', requestFile: join(directory, 'linked.json') }));
    await symlink(request, join(directory, 'linked.json'));
    assert.deepEqual(call('academic-os-planning.mjs', 2), call('agent.mjs', 2));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('compact launcher accepts only its documented service-owned planning invocation', async () => {
  for (const args of [[], ['doctor'], ['calendar-register', '--file'], ['calendar-register', '--file', 'missing', '--root', '/tmp']]) {
    const result = spawnSync(process.execPath, [join(root, 'scripts/academic-os-planning.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).ok, false);
  }
});
