import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { startDashboard } from '../src/automation-reporting-dashboard.mjs';

const cli = fileURLToPath(new URL('../scripts/automation-reporting.mjs', import.meta.url));
const invoke = (...args) => {
  const child = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(child.stderr, '', child.stderr);
  return { code: child.status, ...JSON.parse(child.stdout) };
};
const temporary = async t => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'emmy-reporting-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};
const record = (kind = 'automation', data = { name: 'Daily review', enabled: true, schedule: 'daily', environment: 'local', nativeRef: 'reported-native-ref', model: 'reported-model', destination: 'private-report', freshChat: true, archiveOnSuccess: true, sourceRef: 'fixture', observedAt: '2020-01-01T00:00:00Z' }) => ({
  schemaVersion: 1, namespace: 'test-owner', automationId: 'daily-review', kind,
  key: 'definition', revision: 0, previous: null, recordedAt: '2020-01-01T00:00:00Z', data,
});
const http = (url, options = {}) => new Promise((resolve, reject) => {
  const call = request(url, options, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => body += chunk);
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
  });
  call.on('error', reject);
  call.end();
});

test('CLI explains options and rejects malformed arguments without writing', async t => {
  const directory = await temporary(t);
  assert.match(invoke('--help').help, /publish-own-record/);
  for (const args of [
    ['status'], ['unknown', '--directory', directory],
    ['list', '--directory', directory, '--limit', '1.5'],
    ['list', '--directory', directory, '--limit', '0'],
    ['status', '--directory', directory, '--directory', directory],
    ['status', '--directory', directory, '--as-of', 'yesterday'],
    ['status', '--directory', directory, '--port', '0'],
    ['serve', '--directory', directory, '--namespace', 'test-owner'],
  ]) {
    const result = invoke(...args);
    assert.equal(result.code, 2, JSON.stringify(args));
    assert.equal(result.ok, false);
  }
  assert.deepEqual(await readdir(directory), []);
});

test('CLI publishes, reads and preserves immutable bytes across fresh processes', async t => {
  const directory = await temporary(t);
  const inputDirectory = await temporary(t);
  const file = join(inputDirectory, 'input.json');
  await writeFile(file, JSON.stringify(record()));
  const common = ['--directory', directory, '--namespace', 'test-owner', '--file', file];
  const dry = invoke('dry-run', ...common);
  assert.equal(dry.code, 0, JSON.stringify(dry));
  const publication = invoke('publish-own-record', ...common);
  assert.equal(publication.code, 0, JSON.stringify(publication));
  assert.equal(publication.data.status, 'published');
  const replay = invoke('publish-own-record', ...common);
  assert.equal(replay.data.status, 'identical');
  const listing = invoke('list', '--directory', directory, '--namespace', 'test-owner', '--limit', '1');
  assert.ok(listing.data.items.length === 1, JSON.stringify(listing));
  const id = listing.data.items[0].id;
  assert.match(id, /^[a-f0-9]{64}$/);
  const stored = await readFile(join(directory, 'test-owner', `${id}.json`), 'utf8');
  const readback = invoke('get', '--directory', directory, '--id', id);
  assert.equal(readback.ok, true, JSON.stringify(readback));
  const wrongOwner = invoke('publish-own-record', '--directory', directory, '--namespace', 'another-owner', '--file', file);
  assert.equal(wrongOwner.code, 2, JSON.stringify(wrongOwner));
  assert.equal(await readFile(join(directory, 'test-owner', `${id}.json`), 'utf8'), stored);
});

test('CLI exposes overdue gaps, bounded pagination, search and corrupt records', async t => {
  const directory = await temporary(t);
  const inputDirectory = await temporary(t);
  const file = join(inputDirectory, 'record.json');
  const publish = async value => {
    await writeFile(file, JSON.stringify(value));
    const result = invoke('publish-own-record', '--directory', directory, '--namespace', 'test-owner', '--file', file);
    assert.equal(result.code, 0, JSON.stringify(result));
    return result.data.id;
  };
  await publish(record());
  await publish(record('occurrence', { scheduledFor: '2020-01-01T00:00:00Z', expiresAt: '2020-01-01T01:00:00Z' }));
  const hostileTitle = '<script>alert("producer text")</script>';
  await publish(record('issue', { title: hostileTitle, state: 'open', evidenceRefs: [] }));
  const status = invoke('status', '--directory', directory, '--as-of', '2020-01-02T00:00:00Z');
  assert.equal(status.code, 3);
  assert.equal(status.data.occurrences[0].state, 'overdue');
  assert.equal(status.data.occurrences[0].execution, 'not-inferred');
  const first = invoke('list', '--directory', directory, '--limit', '1');
  assert.equal(first.data.items.length, 1);
  assert.match(first.data.nextCursor, /^[a-f0-9]{64}$/);
  const second = invoke('list', '--directory', directory, '--limit', '1', '--cursor', first.data.nextCursor);
  assert.notEqual(first.data.items[0].id, second.data.items[0].id);
  const search = invoke('list', '--directory', directory, '--query', 'producer text', '--automation-id', 'daily-review');
  assert.equal(search.data.items.length, 1);
  assert.equal(search.data.items[0].data.title, hostileTitle);
  await writeFile(join(directory, 'test-owner', '0'.repeat(64) + '.json'), '{"partial":');
  const corrupt = invoke('diagnose', '--directory', directory);
  assert.equal(corrupt.code, 3);
  assert.equal(corrupt.data.scan.complete, false);
  assert.ok(corrupt.data.findings.some(finding => finding.startsWith('invalid-record:')));
});

test('CLI imports compact reports deterministically with dry-run and manual provenance', async t => {
  const directory = await temporary(t);
  const inputDirectory = await temporary(t);
  const file = join(inputDirectory, 'compact-report.json');
  const report = {
    schemaVersion: 1, kind: 'maintenance', scheduledFor: '2020-01-02T00:00:00Z',
    runId: 'scheduled:daily-review:2020-01-02', provenance: 'scheduled', status: 'completed',
    coverage: 'partial', summary: 'Completed with a retained source gap.', findings: 1,
    evidenceRefs: ['fixture-source'], sourceWindow: { start: '2020-01-01T00:00:00Z', end: '2020-01-01T23:00:00Z' },
    generatedAt: '2020-01-02T01:00:00Z',
  };
  await writeFile(file, JSON.stringify(report));
  const args = ['import-improvement', '--directory', directory, '--namespace', 'test-owner', '--automation-id', 'daily-review', '--file', file, '--as-of', '2020-01-02T02:00:00Z'];
  const dry = invoke(...args, '--dry-run');
  assert.equal(dry.code, 0, JSON.stringify(dry));
  assert.equal(dry.data.status, 'dry-run');
  assert.equal(dry.data.writes, false);
  assert.equal(dry.data.records.length, 2);
  assert.deepEqual(await readdir(directory), []);
  const published = invoke(...args);
  assert.equal(published.code, 0, JSON.stringify(published));
  assert.equal(published.data.status, 'published');
  const names = (await readdir(join(directory, 'test-owner'))).sort();
  const bytes = await Promise.all(names.map(name => readFile(join(directory, 'test-owner', name), 'utf8')));
  assert.equal(names.length, 2);
  const duplicate = invoke(...args);
  assert.equal(duplicate.code, 0, JSON.stringify(duplicate));
  assert.equal(duplicate.data.status, 'identical');
  assert.deepEqual(await Promise.all(names.map(name => readFile(join(directory, 'test-owner', name), 'utf8'))), bytes);
  const previewAgain = invoke(...args, '--dry-run');
  assert.equal(previewAgain.code, 0);
  assert.deepEqual((await readdir(join(directory, 'test-owner'))).sort(), names);
  assert.deepEqual(await Promise.all(names.map(name => readFile(join(directory, 'test-owner', name), 'utf8'))), bytes);
  const listing = invoke('list', '--directory', directory, '--as-of', '2020-01-02T02:00:00Z');
  const run = listing.data.items.find(item => item.kind === 'run');
  const occurrence = listing.data.items.find(item => item.kind === 'occurrence');
  assert.equal(run.key, report.runId);
  assert.deepEqual(run.data.report, report);
  assert.equal(run.data.occurrenceKey, occurrence.key);
  assert.equal(run.data.execution, 'completed');
  assert.equal(run.data.coverage, 'partial');
  await writeFile(file, JSON.stringify({ ...report, runId: 'manual:daily-review:2020-01-02', provenance: 'manual' }));
  const manual = invoke(...args);
  assert.equal(manual.code, 0, JSON.stringify(manual));
  assert.equal(manual.data.records.length, 1);
  const manualList = invoke('list', '--directory', directory, '--query', 'manual:daily-review');
  assert.equal(manualList.data.items[0].data.occurrenceKey, null);
  const missingOwner = invoke('import-improvement', '--directory', directory, '--file', file);
  assert.equal(missingOwner.code, 2);
  await writeFile(file, JSON.stringify({ ...report, generatedAt: '2099-01-01T00:00:00Z' }));
  const beforeInvalid = (await readdir(join(directory, 'test-owner'))).sort();
  const invalid = invoke(...args);
  assert.equal(invalid.code, 2);
  assert.deepEqual((await readdir(join(directory, 'test-owner'))).sort(), beforeInvalid);
});

test('CLI exports only sanitized current outcomes into exclusive private files', async t => {
  const directory = await temporary(t);
  const inputDirectory = await temporary(t);
  const file = join(inputDirectory, 'record.json');
  const report = {
    schemaVersion: 1, kind: 'maintenance', scheduledFor: '2020-01-02T00:00:00Z',
    runId: 'export:daily-review', provenance: 'manual', status: 'completed', coverage: 'partial',
    summary: 'Review completed with a retained coverage gap.', findings: 1,
    evidenceRefs: ['/Users/private-owner/raw-source.json', 'private-owner@example.com'],
    sourceWindow: { start: '2020-01-01T00:00:00Z', end: '2020-01-01T23:00:00Z' }, generatedAt: '2020-01-02T01:00:00Z',
  };
  const run = { ...record('run', { occurrenceKey: null, execution: 'completed', coverage: 'partial', report, evidenceRefs: report.evidenceRefs,
    timing: { startedAt: '2020-01-02T00:00:00Z', lastHeartbeatAt: '2020-01-02T00:30:00Z', endedAt: '2020-01-02T01:00:00Z', observedAt: '2020-01-02T01:00:00Z', sourceRef: '/Volumes/private/account/readback.json' } }), key: report.runId, recordedAt: '2020-01-02T01:00:00Z' };
  await writeFile(file, JSON.stringify(run));
  const published = invoke('publish-own-record', '--directory', directory, '--namespace', 'test-owner', '--file', file);
  assert.equal(published.code, 0, JSON.stringify(published));
  const id = published.data.id;
  const to = join(inputDirectory, 'outcome.json');
  const args = ['export-outcome', '--directory', directory, '--id', id, '--to', to];
  const result = invoke(...args);
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.data.status, 'exported');
  const exported = await readFile(to, 'utf8');
  assert.equal((await stat(to)).mode & 0o777, 0o600);
  assert.ok(exported.endsWith('\n'));
  assert.doesNotMatch(exported, /Users|Volumes|private-owner|example.com|readback.json|evidenceRefs/);
  const outcome = JSON.parse(exported);
  assert.equal(outcome.summary, report.summary);
  assert.equal(outcome.evidenceCoverage, 'partial');
  assert.equal(outcome.userDelivery, 'pending');
  assert.match(outcome.actualTiming.sourceRefDigest, /^[a-f0-9]{64}$/);
  assert.equal(invoke(...args).data.status, 'identical');
  await writeFile(to, 'different bytes');
  assert.equal(invoke(...args).code, 2);
  assert.equal(await readFile(to, 'utf8'), 'different bytes');
  const linked = join(inputDirectory, 'linked.json');
  await symlink(to, linked);
  assert.equal(invoke('export-outcome', '--directory', directory, '--id', id, '--to', linked).code, 2);
  assert.equal(invoke(...args, '--namespace', 'test-owner').code, 2);
  for (const summary of ['/Users/private-owner/report.json', 'Bearer abcdefghijklmnopqrstuvwxyz']) {
    const unsafe = { ...run, key: 'unsafe-export', data: { ...run.data, report: { ...report, runId: 'unsafe-export', summary } } };
    await writeFile(file, JSON.stringify(unsafe));
    const unsafePublished = invoke('publish-own-record', '--directory', directory, '--namespace', 'test-owner', '--file', file);
    if (summary.startsWith('Bearer')) assert.equal(unsafePublished.code, 2);
    else {
      assert.equal(unsafePublished.code, 0);
      const unsafeTo = join(inputDirectory, 'unsafe-outcome.json');
      assert.equal(invoke('export-outcome', '--directory', directory, '--id', unsafePublished.data.id, '--to', unsafeTo).code, 2);
      assert.ok(!(await readdir(inputDirectory)).includes('unsafe-outcome.json'));
    }
  }
  const revision = { ...run, revision: 1, previous: id, recordedAt: '2020-01-02T02:00:00Z' };
  await writeFile(file, JSON.stringify(revision));
  assert.equal(invoke('publish-own-record', '--directory', directory, '--namespace', 'test-owner', '--file', file).code, 0);
  assert.equal(invoke(...args).code, 2, 'An earlier run revision cannot be exported as current');
});

test('dashboard binds loopback, serves safe static UI and refuses writes', async t => {
  const directory = await temporary(t);
  const { server, address } = await startDashboard({ directory });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');
  const page = await http(address);
  assert.equal(page.status, 200);
  assert.match(page.body, /Automation reporting/);
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  const script = await http(`${address}/dashboard.js`);
  assert.match(script.body, /textContent/);
  assert.doesNotMatch(script.body, /innerHTML/);
  for (const label of ['Inventory', 'Runs', 'Conflicts and gaps', 'Coverage', 'Publication', 'Delivery']) assert.ok(script.body.includes(label));
  const snapshot = await http(`${address}/api`);
  assert.equal(snapshot.status, 200);
  assert.equal(JSON.parse(snapshot.body).ok, true);
  assert.equal((await http(`${address}/api`, { method: 'POST' })).status, 405);
  assert.equal((await http(`${address}/api`, { headers: { host: 'outside.example' } })).status, 403);
  assert.equal((await http(`${address}/api?write=true`)).status, 404);
  assert.deepEqual(await readdir(directory), []);
});

test('served dashboard script polls once at a time, invalidates failures and cleans up', async t => {
  const directory = await temporary(t);
  const { server, address } = await startDashboard({ directory });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { body: script } = await http(`${address}/dashboard.js`);
  const element = () => ({ children: [], textContent: '', listeners: {}, append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; }, addEventListener(name, callback) { this.listeners[name] = callback; } });
  const nodes = Object.fromEntries(['sections', 'refresh', 'error', 'status', 'updated'].map(id => [id, element()]));
  const intervals = new Map();
  const timeouts = new Map();
  const events = {};
  let reloads = 0;
  const requests = [];
  const text = node => node.textContent + node.children.map(text).join(' ');
  runInNewContext(script, {
    document: { getElementById: id => nodes[id], createElement: element },
    window: { addEventListener: (name, callback) => { events[name] = callback; }, location: { reload: () => reloads++ } },
    Date, AbortController,
    setInterval: (callback, delay) => { intervals.set(delay, callback); return delay; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (callback, delay) => { timeouts.set(delay, callback); return delay; },
    clearTimeout: id => timeouts.delete(id),
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve, reject });
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
  });
  assert.equal(requests.length, 1);
  intervals.get(5000)();
  nodes.refresh.listeners.click();
  assert.equal(requests.length, 1, 'Concurrent refreshes must share the active read');
  const run = { kind: 'run', key: 'run-one', automationId: 'daily-review', namespace: 'test-owner', execution: 'completed', evidenceCoverage: 'partial', reportAvailability: 'available', publication: 'pending', userDelivery: 'pending', data: { report: { summary: '<script>reported text</script>' } } };
  requests[0].resolve({ ok: true, json: async () => ({ ok: true, data: { status: 'needs-attention', runs: [run] } }) });
  await new Promise(setImmediate);
  assert.equal(nodes.status.textContent, 'Needs attention');
  assert.match(nodes.updated.textContent, /Last successful read/);
  assert.match(text(nodes.sections), /Execution completed/);
  assert.match(text(nodes.sections), /Coverage partial/);
  assert.match(text(nodes.sections), /<script>reported text<\/script>/);
  intervals.get(5000)();
  assert.equal(requests.length, 2);
  requests[1].reject(new Error('Store unavailable'));
  await new Promise(setImmediate);
  assert.equal(nodes.status.textContent, 'Snapshot unavailable');
  assert.equal(nodes.sections.children.length, 0, 'Prior cards must disappear after a failed read');
  assert.equal(nodes.error.textContent, 'Store unavailable');
  assert.match(nodes.updated.textContent, /Last successful read/);
  intervals.get(5000)();
  timeouts.get(4000)();
  await new Promise(setImmediate);
  assert.match(nodes.error.textContent, /timed out/);
  intervals.get(5000)();
  const active = requests.at(-1);
  events.pagehide();
  assert.equal(active.options.signal.aborted, true);
  assert.equal(intervals.size, 0);
  await new Promise(setImmediate);
  assert.equal(timeouts.size, 0);
  events.pageshow({ persisted: false });
  assert.equal(reloads, 0, 'An ordinary load must not reload');
  events.pageshow({ persisted: true });
  assert.equal(reloads, 1, 'A restored page must reload to resume reads with fresh timers');
});

test('serve child announces its ephemeral address and shuts down on SIGTERM', async t => {
  const directory = await temporary(t);
  const child = spawn(process.execPath, [cli, 'serve', '--directory', directory], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  let output = '';
  const announcement = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Dashboard did not start')), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Dashboard exited ${code}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output.split('\n')[0])); }
    });
  });
  assert.equal(announcement.readOnly, true);
  assert.match(announcement.address, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal((await http(`${announcement.address}/api`)).status, 200);
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  assert.equal((await exited)[0], 0);
});
