export const fixtureScripts = {
  'pass.mjs': `import { appendFileSync } from 'node:fs';
if (process.argv[2]) appendFileSync(process.argv[2], 'ran\\n');
process.stdout.write('Synthetic local verification passed\\n');
`,
  'fail.mjs': `process.stderr.write('Synthetic verification failed\\n');
process.exitCode = 7;
`,
  'child.mjs': `import { spawn } from 'node:child_process';
const code = "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)";
spawn(process.execPath, ['-e', code, process.argv[2]], { stdio: 'ignore' });
setInterval(() => {}, 1000);
`,
  'output.mjs': `import { spawn } from 'node:child_process';
const code = "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)";
spawn(process.execPath, ['-e', code, process.argv[2]], { stdio: 'ignore' });
setTimeout(() => setInterval(() => process.stdout.write('x'.repeat(65536)), 1), 100);
`,
  'own-binding-replay.mjs': `import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectRepository } from '../src/responsibilities.mjs';
const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const home = join(root, '.local', 'binding-negative-control');
rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
const actual = await inspectRepository(root);
const target = { projectId: 'constructor', executor: 'local-codex', hostId: 'constructor', nativeProjectId: 'native-constructor', ...actual };
const definition = { id: 'constructor-case', parents: [], goal: 'Observe inherited binding rejection.', context: 'Synthetic actual CLI negative control.', target, action: 'verify', resource: 'constructor', destination: 'local', authorityRef: { reference: 'Synthetic fixture authority', action: 'verify', resource: 'constructor', destination: 'local' }, criteria: [], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'binding-check', method: 'Actual CLI negative control.', intendedEffect: 'Retain own-key binding semantics.', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' } };
const file = join(home, 'definition.json'); writeFileSync(file, JSON.stringify(definition));
const run = (args, expected) => { const result = spawnSync(process.execPath, [join(root, 'scripts/agent.mjs'), ...args, '--root', root, '--home', home], { encoding: 'utf8' }); assert.equal(result.status, expected, result.stdout + result.stderr); return JSON.parse(result.stdout).data; };
run(['responsibility', '--file', file], 0);
const unknown = run(['reconcile', '--id', definition.id, '--as-of', new Date().toISOString()], 3).responsibilities[0].record;
assert.equal(unknown.route.project, null, 'Inherited constructor is not a registered project');
const bindings = { schemaVersion: 1, localHostId: 'constructor', hosts: {}, projects: { constructor: { label: 'Explicit constructor', path: target.path, hostId: 'constructor', nativeProjectId: 'native-constructor', repository: target.repository } } };
writeFileSync(join(home, 'bindings.json'), JSON.stringify(bindings));
const missingHost = run(['reconcile', '--id', definition.id, '--as-of', new Date().toISOString()], 3).responsibilities[0].record;
assert.ok(missingHost.route.reasons.includes('exact-binding-missing'), 'Inherited constructor is not a registered host');
bindings.hosts.constructor = { label: 'Explicit host', machine: hostname() };
writeFileSync(join(home, 'bindings.json'), JSON.stringify(bindings));
const explicit = run(['reconcile', '--id', definition.id, '--as-of', new Date().toISOString()], 3).responsibilities[0].record;
assert.equal(explicit.route.status, 'bound', 'Explicit constructor project and host remain valid');
assert.equal(explicit.route.project.label, 'Explicit constructor');
process.stdout.write('Actual CLI rejected inherited project/host keys and retained explicit bindings\\n');
`
};
