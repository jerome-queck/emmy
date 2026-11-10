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

export async function driveImprovementReport({ sourceRoot, root, home, bindings, target, run, scenario, report, evidenceDir }) {
  const directory = await realpath(await mkdir(join(home, 'improvement'), { recursive: true }).then(() => join(home, 'improvement')));
  const requests = join(directory, 'requests'); await mkdir(requests);
  const env = await guardedEnvironment(requests, false); const readEnv = await guardedEnvironment(requests, true);
  const outputs = []; let index = 0;
  const call = async (request, expected) => {
    const file = join(requests, `${index++}.json`); await writeFile(file, JSON.stringify({ directory, ...request }));
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(sourceRoot, 'scripts/improvement-report.mjs'), '--file', file], { env: { ...process.env, ...(request.action === 'read' ? readEnv : env), PATH: `${join(root, 'bin')}:${process.env.PATH}` } });
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
  assert.equal((await call(read, 0)).status, 'completed-empty');
  assert.equal((await call({ action: 'publish', report: { ...value, status: 'failed', coverage: 'partial', summary: 'Contradictory review failure.' } }, 3)).status, 'conflict');
  const before = await readdir(directory); const bytes = await Promise.all(before.filter(name => name.endsWith('.json')).map(name => readFile(join(directory, name))));
  const disputed = await call(read, 3); assert.equal(disputed.status, 'conflict'); assert.deepEqual(disputed.report, value); assert.equal(disputed.conflictingReport.status, 'failed'); assert.deepEqual(await readdir(directory), before); assert.deepEqual(await Promise.all(before.filter(name => name.endsWith('.json')).map(name => readFile(join(directory, name)))), bytes);
  await call({ action: 'release', ownerToken: owner.ownerToken }, 0);
  let partial;
  for (const kind of ['project-chat-cleanup', 'weekly-upkeep', 'lifecycle-check']) {
    const query = { ...read, kind }; const bounded = { ...value, kind, coverage: 'partial', summary: 'Successful bounded synthetic work with partial source evidence.' };
    assert.equal((await call(query, 3)).handover.execution, 'unknown');
    await call({ action: 'publish', report: bounded }, 0);
    partial = await call(query, 3); assert.equal(partial.handover.execution, 'completed'); assert.equal(partial.handover.evidenceCoverage, 'partial');
    assert.equal((await call(query, 3)).handover.snapshotDigest, partial.handover.snapshotDigest);
  }
  const receiptHome = join(directory, 'fleet-receipt'); await mkdir(receiptHome); await writeFile(join(receiptHome, 'bindings.json'), JSON.stringify(bindings));
  const fixture = async (name, value) => { const path = join(receiptHome, `${name}.json`); await writeFile(path, JSON.stringify(value)); return path; };
  const definition = { id: 'report-handover', parents: [], goal: 'Retain one synthetic bounded report acquisition.', context: 'Synthetic parent receipt example. No live parent acceptance or delivery.', workClass: 'coordination', action: 'monitor', resource: target.projectId, destination: 'fixture-parent', target, authorityRef: { reference: 'Synthetic handover authority', action: 'monitor', resource: target.projectId, destination: 'fixture-parent' }, criteria: [{ id: 'receipt', evidence: 'reported-check', description: 'Complete acquisition remains separate from report coverage and delivery.' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'report-handover', method: 'Existing fleet receipt.', intendedEffect: 'Retain bounded report bytes.', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' } };
  await run(['responsibility', '--file', await fixture('definition', definition)], 0, receiptHome);
  const scope = { service: 'emmy', environment: 'fixture-local', surface: 'native', resource: 'lifecycle-check-report' };
  let head; let ordinal = 0;
  const fleet = async (action, evidence = []) => {
    const input = { schemaVersion: 1, responsibilityId: definition.id, ...(head ? { expectedHead: head } : {}), action, evidence };
    const result = await run(['fleet', '--file', await fixture(`input-${ordinal++}`, input)], 3, receiptHome); head = result.headHash; return result;
  };
  await fleet({ operation: 'configure', semanticsVersion: 2, entities: [{ id: 'report', kind: 'cloud-job', scope }] });
  const job = { id: 'report-read', kind: 'briefing-source-read', occurrence: `lifecycle-check/${read.scheduledFor}/read-1`, priority: 'morning', entityIds: ['report'], purpose: 'Acquire exactly the bounded derived report snapshot, not its underlying sources.', maxReads: 1, maxBytes: 32768, steps: 1 };
  await fleet({ operation: 'submit', job }); const admitted = await fleet({ operation: 'claim', ownerRef: 'synthetic-parent' }); assert.ok(admitted.ticket);
  const acquired = await call({ ...read, kind: 'lifecycle-check' }, 3); const acquiredBytes = Buffer.from(outputs.at(-1).stdout);
  assert.equal(acquired.handover.snapshotDigest, partial.handover.snapshotDigest);
  const path = join(receiptHome, 'acquired-report.json'); await writeFile(path, acquiredBytes); const at = new Date().toISOString();
  const receipt = { sourceRef: 'synthetic-bounded-report-read', sha256: createHash('sha256').update(acquiredBytes).digest('hex'), observedAt: at, capturedAt: at, observer: 'Synthetic parent acquired the complete bounded helper output; underlying report evidence remains partial.', scope, coverage: { complete: true, gaps: [] } };
  const evidence = [{ path, sha256: receipt.sha256, sourceRef: receipt.sourceRef }];
  const resultAction = { operation: 'result', jobKey: admitted.ticket.key, ticket: admitted.ticket.ticket, checkpoint: 1, outcome: 'completed', usage: { reads: 1, bytes: acquiredBytes.length }, receipt };
  const accepted = await fleet(resultAction, evidence); assert.equal(accepted.state.jobs[0].status, 'completed');
  assert.equal((await fleet(resultAction, evidence)).outcome, 'coalesced');
  assert.equal((await fleet({ operation: 'submit', job })).outcome, 'coalesced');
  assert.equal((await fleet({ operation: 'claim', ownerRef: 'synthetic-parent' })).ticket, null);
  assert.ok(accepted.state.alerts.every(alert => alert.delivery === 'pending'));
  const changed = { ...value, kind: 'lifecycle-check', status: 'failed', coverage: 'partial' };
  await call({ action: 'publish', report: changed }, 3);
  const conflict = await call({ ...read, kind: 'lifecycle-check' }, 3); assert.equal(conflict.status, 'conflict'); assert.notEqual(conflict.handover.snapshotDigest, acquired.handover.snapshotDigest);
  const retained = join(evidenceDir, 'improvement-report'); await cp(directory, retained, { recursive: true }); await writeFile(join(retained, 'results.json'), JSON.stringify(outputs, null, 2));
  report.improvementReport = { retained, declaredOnly: true, fleetReceiptExample: join(retained, 'fleet-receipt'), parentAcceptance: 'synthetic-only', userDelivery: 'not-attempted' };
  scenario('improvement-report', 'Fresh helper processes retain exact-token guards, immutable conflicts, successful partial-evidence outcomes and stable snapshots. Existing fleet CLI retains complete bounded-read bytes, coalesces repeated requests/results, and leaves delivery separate.');
}
