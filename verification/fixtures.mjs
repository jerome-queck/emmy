export const fixtureScripts = {
  'record-group-kill.mjs': `import { appendFileSync } from 'node:fs';
const actual = process.kill.bind(process); const requests = new Map();
process.kill = (pid, signal) => {
  if (pid < 0 && signal === 'SIGKILL' && process.env.EMMY_VERIFY_GROUP_CALL_FILE) {
    const attempt = (requests.get(pid) ?? 0) + 1; requests.set(pid, attempt);
    const denied = process.env.EMMY_VERIFY_GROUP_CALL_MODE === 'repeat-denial' && attempt > 1;
    appendFileSync(process.env.EMMY_VERIFY_GROUP_CALL_FILE, JSON.stringify({ processGroup: -pid, signal, attempt, action: denied ? 'denied' : 'actual' }) + String.fromCharCode(10));
    if (denied) throw Object.assign(new Error('Synthetic repeat-only owned-group EPERM control'), { code: 'EPERM' });
  }
  return actual(pid, signal);
};
`,
  'deny-group-kill.mjs': `import { appendFileSync } from 'node:fs';
const actual = process.kill.bind(process); let denied = false;
process.kill = (pid, signal) => {
  if (pid < 0 && signal === 'SIGKILL' && process.env.EMMY_VERIFY_DENIED_GROUP_FILE && (!denied || process.env.EMMY_VERIFY_DENIED_GROUP_MODE === 'always')) {
    denied = true;
    appendFileSync(process.env.EMMY_VERIFY_DENIED_GROUP_FILE, String(-pid) + '\\n');
    throw Object.assign(new Error('Synthetic owned-group EPERM control'), { code: 'EPERM' });
  }
  return actual(pid, signal);
};
`,
  'pass.mjs': `import { appendFileSync } from 'node:fs';
if (process.argv[2]) appendFileSync(process.argv[2], 'ran\\n');
process.stdout.write('Synthetic local verification passed\\n');
`,
  'fail.mjs': `process.stderr.write('Synthetic verification failed\\n');
process.exitCode = 7;
`,
  'dependency.mjs': `export const value = "pinned";
`,
  'mutate-dependency.mjs': `import { writeFileSync } from 'node:fs';
writeFileSync('fixture-verifiers/dependency.mjs', 'export const value = "changed";\\n');
`,
  'read-dependency.mjs': `import { writeFileSync } from 'node:fs';
import { value } from './dependency.mjs';
writeFileSync(process.argv[2], value);
console.log(value);
`,
  'hide-repository.mjs': `import { renameSync } from 'node:fs';
renameSync('.git', '.local/source-boundary.git');
`,
  'delay.mjs': `await new Promise(resolve => setTimeout(resolve, 3000));
console.log('delayed');
`,
  'child.mjs': `import { spawn } from 'node:child_process';
const code = "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)";
spawn(process.execPath, ['-e', code, process.argv[2]], { stdio: 'ignore' });
setInterval(() => {}, 1000);
`,
  'normal-exit-child.mjs': `import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const code = "setInterval(() => {}, 1000); require('node:fs').writeFileSync(process.argv[1], String(process.pid) + String.fromCharCode(10))";
const child = spawn(process.execPath, ['-e', code, process.argv[2]], { stdio: ['ignore', 'inherit', 'inherit'] });
let ready = false;
for (let attempt = 0; attempt < 400; attempt++) {
  const bytes = await readFile(process.argv[2], 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  if (bytes.endsWith(String.fromCharCode(10))) {
    if (Number(bytes) !== child.pid) throw new Error('Unexpected descendant readiness marker');
    process.kill(child.pid, 0); child.unref(); console.log('Live inherited descendant ready'); ready = true; break;
  }
  await new Promise(resolve => setTimeout(resolve, 10));
}
if (!ready) throw new Error('Descendant readiness marker did not complete');
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
import { digest } from '../src/records.mjs';
const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const home = join(root, '.local', 'binding-negative-control');
rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
const actual = await inspectRepository(root);
const target = { projectId: 'constructor', executor: 'local-codex', hostId: 'constructor', nativeProjectId: 'native-constructor', ...actual };
const definition = { id: 'constructor-case', parents: [], goal: 'Observe inherited binding rejection.', context: 'Synthetic actual CLI negative control.', target, action: 'verify', resource: 'constructor', destination: 'local', authorityRef: { reference: 'Synthetic fixture authority', action: 'verify', resource: 'constructor', destination: 'local' }, criteria: [{ id: 'artifact', description: 'Inspect tracked fixture ignore bytes.', evidence: 'local-digest', path: join(root, '.gitignore'), sha256: digest(readFileSync(join(root, '.gitignore'))) }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'binding-check', method: 'Actual CLI negative control.', intendedEffect: 'Retain own-key binding semantics.', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' } };
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
