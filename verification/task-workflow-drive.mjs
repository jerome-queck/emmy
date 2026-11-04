import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, lstat, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { discoveryFixture } from './studio-discovery-properties.mjs';

export function taskWorkflowFixture() {
  return {
    schemaVersion: 1, action: 'assess', evaluatedAt: '2026-11-04T00:01:00Z', maxAgeMs: 60000,
    record: {
      objectiveId: 'synthetic-original-objective', owner: 'synthetic-owner', scope: { hostId: 'host-a', projectId: 'project-a' }, phase: 'prepare',
      native: { state: 'planned', taskId: null, clientThreadId: null, readbacks: [] },
      sections: {
        goal: 'Inspect the exact synthetic artifact.', verification: { criteria: [{ id: 'artifact', text: 'Original artifact matches the declared scope.' }], checks: ['Read the original artifact.'], independentReview: true },
        subgoals: ['Read the exact artifact.'], boundaries: { authorized: ['Read synthetic fixture.'], excluded: ['No writes.'], sourceRef: 'synthetic-source-revision' }, output: ['Original evidence references and gaps.'], delegation: { parent: 'synthetic-parent', helpers: [] }
      }
    }
  };
}

function known(input, state = 'known') {
  input.record.phase = 'monitor';
  input.record.native = { state, taskId: 'task-a', clientThreadId: null, readbacks: [{ ...input.record.scope, taskId: 'task-a', state, ref: 'synthetic-original-native-readback', acquiredAt: '2026-11-04T00:00:30Z' }] };
}
function reviewed(input) {
  known(input, 'completed'); input.record.phase = 'review';
  input.record.review = { reviewer: 'synthetic-independent-reviewer', ref: 'synthetic-original-review', acquiredAt: '2026-11-04T00:00:45Z', criteria: [{ id: 'artifact', outcome: 'passed', evidence: [{ ref: 'synthetic-original-artifact', acquiredAt: '2026-11-04T00:00:30Z' }] }] };
}
async function snapshot(root, relative = '') {
  const result = [];
  for (const name of (await readdir(join(root, relative))).sort()) {
    const path = join(relative, name); const full = join(root, path); const info = await lstat(full);
    if (info.isDirectory()) { result.push({ path, kind: 'directory' }); result.push(...await snapshot(root, path)); }
    else if (info.isFile()) result.push({ path, sha256: createHash('sha256').update(await readFile(full)).digest('hex') });
    else if (info.isSymbolicLink()) result.push({ path, target: await readlink(full) });
    else result.push({ path, mode: info.mode, rdev: info.rdev });
  }
  return result;
}

export async function driveTaskWorkflow({ home, run, scenario, report, evidenceDir }) {
  const directory = join(evidenceDir, 'task-workflow'); await mkdir(directory, { recursive: true }); report.retainedTaskWorkflow = directory;
  const before = await snapshot(home); await writeFile(join(directory, 'home-before.json'), JSON.stringify(before));
  let counter = 0;
  async function check(name, input, status, expectedExit = 0) {
    const file = join(directory, `${++counter}-${name}.json`); const bytes = JSON.stringify(input); await writeFile(file, bytes);
    const result = await run(['task-workflow', '--file', file], expectedExit);
    if (expectedExit !== 2) {
      assert.equal(result.status, status); assert.equal(result.execution, 'none'); assert.equal(result.accepted, false); assert.equal(result.automaticRetry, false);
      assert.deepEqual(await run(['task-workflow', '--file', file], expectedExit), result);
    }
    assert.equal(await readFile(file, 'utf8'), bytes); return result;
  }
  const baseline = taskWorkflowFixture();
  const prepared = await check('prepared', baseline, 'prepared');
  assert.deepEqual([...prepared.prompt.matchAll(/^# (.*)$/gm)].map(match => match[1]), ['Goal', 'Verification', 'Subgoals', 'Boundaries', 'Output', 'Delegation']);
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverse(value[key])])) : value;
  assert.equal((await check('key-order', reverse(baseline), 'prepared')).prompt, prepared.prompt);
  const skilled = structuredClone(baseline); skilled.record.skills = [{ name: 'verify', path: '/synthetic/.agents/skills/verify/SKILL.md' }];
  assert.ok((await check('skill-invocation', skilled, 'prepared')).prompt.startsWith('[$verify](/synthetic/.agents/skills/verify/SKILL.md)\n# Goal'));
  skilled.record.skills[0].path = '/synthetic/Project (copy)/verify/SKILL.md';
  assert.ok((await check('skill-path-markdown', skilled, 'prepared')).prompt.startsWith('[$verify](/synthetic/Project%20%28copy%29/verify/SKILL.md)'));
  for (const section of ['goal', 'verification', 'subgoals', 'boundaries', 'output', 'delegation']) { const input = structuredClone(baseline); delete input.record.sections[section]; await check(`missing-${section}`, input, null, 2); }
  for (const field of ['objectiveId', 'owner', 'scope', 'phase', 'native']) { const input = structuredClone(baseline); delete input.record[field]; await check(`missing-${field}`, input, null, 2); }
  for (const state of ['attempted', 'pending', 'uncertain']) {
    const input = structuredClone(baseline); known(input); input.record.native.state = state; input.record.native.clientThreadId = 'pending-client';
    const result = await check(state, input, 'rediscovery-only', 3); assert.match(result.next[0], /Do not retry/);
  }
  const monitoring = structuredClone(baseline); known(monitoring); await check('known', monitoring, 'reported-native-known');
  const boundary = structuredClone(monitoring); boundary.record.native.readbacks[0].acquiredAt = '2026-11-04T00:00:00Z'; await check('inclusive-age', boundary, 'reported-native-known');
  const unsupported = structuredClone(monitoring); unsupported.record.native.state = 'ready'; await check('unsupported-state', unsupported, null, 2);
  await check('unsupported-schema', { ...baseline, schemaVersion: 2 }, null, 2);
  const duplicateFile = join(directory, 'duplicate-json.json'); await writeFile(duplicateFile, '{"schemaVersion":1,"schemaVersion":1}'); await run(['task-workflow', '--file', duplicateFile], 2);
  for (const [name, mutate] of [
    ['missing-task-id', input => { input.record.native.taskId = null; }],
    ['unknown-membership', input => { input.record.native.readbacks[0].projectId = null; }],
    ['wrong-host', input => { input.record.native.readbacks[0].hostId = 'foreign-host'; }],
    ['wrong-task', input => { input.record.native.readbacks[0].taskId = 'foreign-task'; }],
    ['wrong-project', input => { input.record.native.readbacks[0].projectId = 'foreign-project'; }],
    ['stale-original-clock', input => { input.record.native.readbacks[0].acquiredAt = '2026-11-03T00:00:00Z'; }],
    ['future-original-clock', input => { input.record.native.readbacks[0].acquiredAt = '2026-11-05T00:00:00Z'; }],
    ['contrary-membership', input => { input.record.native.readbacks.push({ ...input.record.native.readbacks[0], projectId: 'foreign-project' }); }],
    ['contrary-state', input => { input.record.native.readbacks.push({ ...input.record.native.readbacks[0], state: 'pending' }); }],
    ['missing-readback', input => { input.record.native.readbacks = []; }],
    ['pending-client', input => { input.record.native.clientThreadId = 'pending-client'; }],
    ['planned-with-task', input => { input.record.native.state = 'planned'; input.record.phase = 'prepare'; }],
    ['failure', input => { input.record.native.state = 'failed'; input.record.native.readbacks[0].state = 'failed'; }]
  ]) { const input = structuredClone(monitoring); mutate(input); await check(name, input, 'rediscovery-only', 3); }
  const complete = structuredClone(baseline); reviewed(complete); await check('reported-review', complete, 'reported-review-complete');
  for (const [name, mutate] of [
    ['criterion-failed', input => { input.record.review.criteria[0].outcome = 'failed'; }],
    ['criterion-missing', input => { input.record.review.criteria = []; }],
    ['receipt-missing', input => { input.record.review.criteria[0].evidence = []; }],
    ['stale-artifact', input => { input.record.review.criteria[0].evidence[0].acquiredAt = '2026-11-03T00:00:00Z'; }],
    ['self-review', input => { input.record.review.reviewer = input.record.owner; }],
    ['review-missing', input => { delete input.record.review; }]
  ]) { const input = structuredClone(complete); mutate(input); await check(name, input, 'evidence-gaps', 3); }
  const malformed = structuredClone(complete); malformed.record.review.criteria.push(malformed.record.review.criteria[0]); await check('duplicate-criterion', malformed, null, 2);
  for (const evaluatedAt of ['2026-02-30T00:00:00Z', 'not-a-clock']) await check('invalid-clock', { ...baseline, evaluatedAt }, null, 2);
  for (const evaluatedAt of ['2026-11-04T00:01:00.1Z', '2026-11-04T00:01:00.12Z']) await check('fractional-clock', { ...baseline, evaluatedAt }, 'prepared');
  const discovery = discoveryFixture();
  discovery.scope = baseline.record.scope; discovery.evaluatedAt = baseline.evaluatedAt; discovery.maxAgeMs = baseline.maxAgeMs;
  discovery.projects.acquiredAt = '2026-11-04T00:00:30Z'; discovery.projects.response.projects = [{ projectId: 'project-a', hostId: 'host-a', label: 'Synthetic project', projectKind: 'local' }];
  for (const capture of [discovery.active, discovery.archived]) for (const page of capture.pages) { page.acquiredAt = '2026-11-04T00:00:30Z'; page.request.hostId = 'host-a'; page.response.threads = []; }
  discovery.active.pages[0].response.threads = [{ id: 'task-a', hostId: 'host-a', projectId: 'project-a', kind: 'codex', status: 'opaque-native-status' }, { id: 'independent-task', hostId: 'host-a', projectId: 'project-a', kind: 'codex', status: 'opaque-native-status' }];
  const foreign = structuredClone(monitoring.record); foreign.objectiveId = 'foreign-objective'; foreign.scope.projectId = 'foreign-project';
  const projection = { schemaVersion: 1, action: 'project', scope: baseline.record.scope, evaluatedAt: baseline.evaluatedAt, maxAgeMs: baseline.maxAgeMs, records: [monitoring.record, foreign], discovery };
  const projected = await check('project-filter', projection, 'projected'); assert.equal(projected.records.length, 1); assert.equal(projected.excludedRecords[0].objectiveId, 'foreign-objective'); assert.deepEqual(projected.independentNativeTasks, [{ hostId: 'host-a', taskId: 'independent-task' }]); assert.equal(projected.intervention, 'none');
  const conflict = structuredClone(projection); conflict.discovery.active.pages[0].response.threads.push({ ...conflict.discovery.active.pages[0].response.threads[0], projectId: 'foreign-project' });
  assert.equal((await check('project-conflict', conflict, 'projected-partial', 3)).records[0].status, 'rediscovery-only');
  const absent = structuredClone(projection); absent.discovery.active.pages[0].response.threads.shift(); assert.equal((await check('index-absence', absent, 'projected-partial', 3)).records[0].status, 'rediscovery-only');
  const partial = structuredClone(projection); partial.discovery.active.pages[0].response.nextCursor = 'next'; await check('partial-index', partial, 'projected-partial', 3);
  const scopeMismatch = structuredClone(projection); scopeMismatch.scope = { ...scopeMismatch.scope, projectId: 'other' }; await check('project-scope-mismatch', scopeMismatch, null, 2);
  const after = await snapshot(home); await writeFile(join(directory, 'home-after.json'), JSON.stringify(after)); assert.deepEqual(after, before);
  await assert.rejects(readFile(join(home, 'executor-invoked')), { code: 'ENOENT' });
  scenario('structured-task-workflow', 'Actual read-only CLI validates six sections, original identities and clocks, retains native uncertainty/failure, maps criterion evidence, preserves independent project work and unchanged complete private-home/input bytes. All evidence remains supplied declarations.');
}
