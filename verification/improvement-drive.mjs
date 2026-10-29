import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, cp, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tokenCapture, terminalReport } from './token-review-fixtures.mjs';

async function guardedEnvironment(directory, readOnly) {
  const file = join(directory, readOnly ? 'deny-effects.mjs' : 'deny-executors.mjs');
  await writeFile(file, `import { syncBuiltinESMExports } from 'node:module';
import child from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import promises from 'node:fs/promises';
const deny = () => { throw new Error('Synthetic guard refused native, network or forbidden write effect'); };
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) child[name] = deny;
for (const module of [http, https]) for (const name of ['request', 'get']) module[name] = deny;
for (const name of ['connect', 'createConnection']) net[name] = deny;
globalThis.fetch = deny;
${readOnly ? "for (const name of ['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'rm', 'rmdir', 'link', 'symlink', 'copyFile', 'cp', 'truncate']) { promises[name] = deny; if (fs[name]) fs[name] = deny; if (fs[name + 'Sync']) fs[name + 'Sync'] = deny; }" : ''}
syncBuiltinESMExports();
`);
  return { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${pathToFileURL(file).href}` };
}

export async function driveTokenReview({ home, run, scenario, report, evidenceDir }) {
  const directory = join(evidenceDir, 'token-review'); await mkdir(directory, { recursive: true });
  const env = await guardedEnvironment(directory, true);
  const before = await readdir(join(home, 'records')); const capture = tokenCapture(new Date().toISOString());
  const assess = async (name, value, expected) => {
    const file = join(directory, `${name}.json`); const bytes = JSON.stringify(value); await writeFile(file, bytes);
    const data = await run(['token-review', '--file', file], expected, home, env);
    if (expected !== 2) { assert.equal(data.inputDigest, createHash('sha256').update(bytes).digest('hex')); assert.equal(data.execution, 'none'); }
    assert.equal(await readFile(file, 'utf8'), bytes); await writeFile(join(directory, `${name}.result.json`), JSON.stringify(data)); return data;
  };
  const complete = await assess('complete', capture, 0); assert.equal(complete.costPerVerifiedSuccess.numerator, 30); assert.equal(complete.usageSubtotals[0].total, 210);
  const partial = structuredClone(capture); partial.inventory.attempts = 'partial'; assert.equal((await assess('partial', partial, 3)).costPerVerifiedSuccess.status, 'unavailable');
  const missing = structuredClone(capture); missing.objectives[0].evidenceIds = []; assert.equal((await assess('missing-verification', missing, 3)).verifiedSuccesses, 0);
  const duplicate = structuredClone(capture); duplicate.attempts.push(duplicate.attempts[0]); await assess('duplicate', duplicate, 2);
  await assess('malformed', {}, 2);
  assert.deepEqual(await readdir(join(home, 'records')), before);
  report.tokenReview = { retained: directory, inputDigest: complete.inputDigest, suppliedAccountingOnly: true };
  scenario('token-review', 'Fresh real CLI processes assess supplied failed/retry/helper costs, exact bytes, cache subset, partial and missing outcomes, malformed and duplicate controls without journal writes.');
}

export async function driveImprovementReport({ sourceRoot, root, home, scenario, report, evidenceDir }) {
  const directory = await realpath(await mkdir(join(home, 'improvement'), { recursive: true }).then(() => join(home, 'improvement')));
  const requests = join(directory, 'requests'); await mkdir(requests);
  const env = await guardedEnvironment(requests, false);
  const outputs = []; let index = 0;
  const call = async (request, expected) => {
    const file = join(requests, `${index++}.json`); await writeFile(file, JSON.stringify({ directory, ...request }));
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(sourceRoot, 'scripts/improvement-report.mjs'), '--file', file], { env: { ...process.env, ...env, PATH: `${join(root, 'bin')}:${process.env.PATH}` } });
      let stdout = ''; let stderr = ''; child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; }); child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
    }); outputs.push({ request, ...result }); assert.equal(result.code, expected, result.stdout); return JSON.parse(result.stdout).data;
  };
  const read = { action: 'read', kind: 'maintenance', scheduledFor: '2026-10-29T03:00:00Z', maxAgeSeconds: 31536000, provenance: 'scheduled', minimumSourceEnd: terminalReport().sourceWindow.end };
  assert.equal((await call(read, 3)).status, 'missing');
  const owner = await call({ action: 'claim', kind: 'maintenance', runId: 'synthetic-owner' }, 0);
  assert.equal((await call({ action: 'claim', kind: 'token-optimisation', runId: 'synthetic-overlap' }, 3)).status, 'held');
  await call({ action: 'release', ownerToken: '00000000-0000-0000-0000-000000000000' }, 2);
  const value = terminalReport(new Date().toISOString());
  assert.equal((await call({ action: 'publish', report: value }, 0)).status, 'published');
  assert.equal((await call({ action: 'publish', report: value }, 0)).status, 'identical');
  assert.equal((await call({ action: 'publish', report: { ...value, findings: 1 } }, 3)).status, 'conflict');
  const before = await readdir(directory); const bytes = await Promise.all(before.filter(name => name.endsWith('.json')).map(name => readFile(join(directory, name))));
  assert.equal((await call(read, 0)).status, 'completed-empty'); assert.deepEqual(await readdir(directory), before); assert.deepEqual(await Promise.all(before.filter(name => name.endsWith('.json')).map(name => readFile(join(directory, name)))), bytes);
  await call({ action: 'release', ownerToken: owner.ownerToken }, 0);
  const retained = join(evidenceDir, 'improvement-report'); await cp(directory, retained, { recursive: true }); await writeFile(join(retained, 'results.json'), JSON.stringify(outputs, null, 2));
  report.improvementReport = { retained, declaredOnly: true };
  scenario('improvement-report', 'Fresh helper processes retain exact-token guard refusal, immutable same-slot duplicates and conflicts, explicit missing/empty reports and read-only queries outside the journal.');
}
