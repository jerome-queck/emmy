import assert from 'node:assert/strict';

export function discoveryFixture() {
  const acquiredAt = '2026-11-04T00:00:00.000Z';
  const task = { id: 'independent-task', kind: 'codex', projectId: 'project-a', hostId: 'host-a', status: 'idle', updatedAt: 1, title: 'Independent task', cwd: '/ignored/path', summary: 'Started independently' };
  return {
    schemaVersion: 1, scope: { hostId: 'host-a', projectId: 'project-a' }, evaluatedAt: '2026-11-04T00:01:00.000Z', maxAgeMs: 60000,
    projects: { acquiredAt, response: { schemaVersion: 2, projects: [{ projectId: 'project-a', hostId: 'host-a', projectKind: 'local', label: 'Same name' }, { projectId: 'project-b', hostId: 'host-a', projectKind: 'local', label: 'Same name' }, { projectId: 'project-a', hostId: 'host-b', projectKind: 'remote', label: 'Same name' }] } },
    active: { pages: [{ acquiredAt, request: { mode: 'history', source: 'codex', hostId: 'host-a', archived: false, limit: 50 }, response: { threads: [task, { ...task, id: 'other-project', projectId: 'project-b' }], nextCursor: null } }] },
    archived: { pages: [{ acquiredAt, request: { source: 'codex', hostId: 'host-a', limit: 50 }, response: { threads: [], nextCursor: null } }] }
  };
}

export function discoveryCases() {
  return [
    ['saved-membership', () => {}, result => { assert.deepEqual(result.tasks.map(value => value.id), ['independent-task']); assert.equal(result.project.value.hostId, 'host-a'); assert.equal(result.tasks[0].observations[0].task.status, 'idle'); }],
    ['inclusive-age', () => {}, result => assert.equal(result.status, 'captured')],
    ['stale-original', input => { input.active.pages[0].acquiredAt = '2026-11-03T23:59:59.999Z'; }, result => { assert.equal(result.status, 'partial'); assert.equal(result.sources.active.acquisitions[0].state, 'stale'); assert.ok(result.tasks.length); }],
    ['future-original', input => { input.projects.acquiredAt = '2026-11-04T00:01:00.001Z'; }, result => assert.equal(result.project.freshness.state, 'future')],
    ['missing-source', input => { delete input.archived; }, result => { assert.equal(result.status, 'partial'); assert.deepEqual(result.nextReads, [{ tool: 'list_archived_threads', arguments: { source: 'codex', hostId: 'host-a', limit: 50 } }]); }],
    ['unavailable-source', input => { input.archived.error = 'permission-denied'; }, result => assert.equal(result.status, 'partial')],
    ['catalog-unavailable', input => { delete input.projects; }, result => { assert.equal(result.project.state, 'unavailable'); assert.equal(result.tasks.length, 1); }],
    ['catalog-missing', input => { input.projects.response.projects = []; }, result => assert.equal(result.project.state, 'missing-from-available-catalog')],
    ['pagination', input => { input.active.pages[0].response.nextCursor = 'next'; }, result => { assert.equal(result.sources.active.terminalCursorObserved, false); assert.equal(result.nextReads[0].arguments.cursor, 'next'); }],
    ['cursor-chain', input => { input.active.pages[0].response.nextCursor = 'next'; const page = structuredClone(input.active.pages[0]); page.request.cursor = 'wrong'; page.response.nextCursor = null; input.active.pages.push(page); }, result => { assert.equal(result.sources.active.validPages, 1); assert.equal(result.nextReads[0].arguments.cursor, 'next'); }],
    ['cursor-loop', input => { input.active.pages[0].response.nextCursor = 'next'; const page = structuredClone(input.active.pages[0]); page.request.cursor = 'next'; input.active.pages.push(page); }, result => assert.equal(result.status, 'partial')],
    ['foreign-host', input => { input.active.pages[0].response.threads[0].hostId = 'host-b'; }, result => { assert.equal(result.tasks.length, 0); assert.equal(result.status, 'partial'); }],
    ['unknown-membership', input => { input.active.pages[0].response.threads[0].projectId = null; }, result => { assert.equal(result.tasks.length, 0); assert.equal(result.unknownMembership[0].reason, 'unknown-membership'); }],
    ['pending-identity', input => { delete input.active.pages[0].response.threads[0].id; input.active.pages[0].response.threads[0].clientThreadId = 'pending'; }, result => { assert.equal(result.tasks.length, 0); assert.equal(result.unknownMembership[0].reason, 'pending-native-identity'); }],
    ['identical-duplicate', input => { input.active.pages[0].response.threads.push(structuredClone(input.active.pages[0].response.threads[0])); }, result => { assert.equal(result.tasks.length, 1); assert.equal(result.tasks[0].conflict, false); assert.equal(result.tasks[0].observations.length, 1); }],
    ['conflicting-duplicate', input => { input.active.pages[0].response.threads.push({ ...input.active.pages[0].response.threads[0], title: 'Conflicting title' }); }, result => { assert.equal(result.tasks[0].conflict, true); assert.equal(result.status, 'partial'); }],
    ['active-archive-overlap', input => { input.archived.pages[0].response.threads = [structuredClone(input.active.pages[0].response.threads[0])]; }, result => { assert.equal(result.tasks[0].overlap, true); assert.equal(result.status, 'partial'); }],
    ['exact-request', input => { input.active.pages[0].request.projectId = 'project-a'; }, result => { assert.equal(result.status, 'partial'); assert.equal(result.sources.active.validPages, 0); }],
    ['mcp-wrapper', input => { input.active.pages[0].response = { content: [{ type: 'text', text: JSON.stringify(input.active.pages[0].response) }], isError: false }; }, result => assert.equal(result.status, 'captured')],
    ['ambiguous-wrapper', input => { input.active.pages[0].response = { content: [{ type: 'text', text: JSON.stringify(input.active.pages[0].response) }], structuredContent: {} }; }, result => assert.equal(result.status, 'partial')],
    ['error-wrapper', input => { input.active.pages[0].response = { content: [{ type: 'text', text: JSON.stringify(input.active.pages[0].response) }], isError: true }; }, result => assert.equal(result.status, 'partial')],
    ['unknown-host-catalog', input => { delete input.projects.response.projects[0].hostId; }, result => assert.equal(result.project.state, 'unknown-host-membership')],
    ['unknown-acquisition', input => { delete input.archived.pages[0].acquiredAt; }, result => assert.equal(result.sources.archived.acquisitions[0].state, 'unknown')],
    ['initial-cursor', input => { input.active.pages[0].request.cursor = 'unbound'; }, result => { assert.equal(result.sources.active.validPages, 0); assert.equal(Object.hasOwn(result.nextReads[0].arguments, 'cursor'), false); }],
    ['missing-native-id', input => { delete input.active.pages[0].response.threads[0].id; }, result => assert.equal(result.unknownMembership[0].reason, 'unknown-native-identity')],
    ['pending-client-id', input => { delete input.active.pages[0].response.threads[0].id; input.active.pages[0].response.threads[0].clientThreadId = 'pending'; }, result => assert.equal(result.unknownMembership[0].reason, 'pending-native-identity')],
    ['opaque-native-id', input => { input.active.pages[0].response.threads[0].id = 'client:native-opaque'; }, result => { assert.equal(result.tasks[0].id, 'client:native-opaque'); assert.equal(result.status, 'captured'); }],
    ['conflicting-membership', input => { input.active.pages[0].response.threads.push({ ...input.active.pages[0].response.threads[0], projectId: null }); }, result => { assert.equal(result.tasks[0].conflict, true); assert.equal(result.tasks[0].observations.length, 2); }],
    ['zoneless-acquisition', input => { input.active.pages[0].acquiredAt = '2026-11-04T00:00:00'; }, result => assert.equal(result.sources.active.acquisitions[0].state, 'unknown')],
    ['missing-status', input => { delete input.active.pages[0].response.threads[0].status; }, result => { assert.equal(result.status, 'partial'); assert.equal(result.tasks.length, 1); assert.ok(result.gaps.some(value => value.reason === 'unknown-native-status')); }],
    ['invalid-calendar-acquisition', input => { input.active.pages[0].acquiredAt = '2026-02-30T00:00:00Z'; }, result => assert.equal(result.sources.active.acquisitions[0].state, 'unknown')],
    ['invalid-clock-acquisition', input => { input.active.pages[0].acquiredAt = '2026-11-03T24:00:00Z'; }, result => assert.equal(result.sources.active.acquisitions[0].state, 'unknown')],
    ['valid-offset-leap-day', input => { input.evaluatedAt = '2024-02-29T00:01:00Z'; input.projects.acquiredAt = input.active.pages[0].acquiredAt = input.archived.pages[0].acquiredAt = '2024-02-29T08:00:00+08:00'; }, result => assert.equal(result.status, 'captured')],
    ['invalid-calendar-evaluation', input => { input.evaluatedAt = '2026-02-30T00:00:00Z'; }, null, true],
    ['opaque-status', input => { input.active.pages[0].response.threads[0].status = 'future-native-status'; }, result => assert.equal(result.tasks[0].observations[0].task.status, 'future-native-status')]
  ];
}

export function verifyDiscovery(studioDiscovery, selected = null) {
  let checks = 0;
  for (const [name, mutate, check, reject = false] of discoveryCases()) {
    if (selected && selected !== name) continue;
    const input = discoveryFixture(); mutate(input);
    const before = JSON.stringify(input);
    try {
      if (reject) assert.throws(() => studioDiscovery(input), /Expected discovery schema/);
      else { const result = studioDiscovery(input); check(result); assert.deepEqual(studioDiscovery(input), result); }
      assert.equal(JSON.stringify(input), before);
    }
    catch (error) { error.discoveryCase = name; throw error; }
    checks++;
  }
  return { checks };
}
