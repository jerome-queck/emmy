#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { captureProcessIncarnation } from '../src/process-incarnation.mjs';
import { migrateLegacyAcceptance, acceptanceRestartEvidence, readAcceptanceJson } from '../src/cloud-migration.mjs';
import { hostname } from 'node:os';
import { digest } from '../src/records.mjs';

const source = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2); const options = {};
while (args.length) { const key = args.shift(); if (!['--home', '--phase', '--id', '--attestation', '--baseline'].includes(key) || !args.length || options[key]) throw new Error('Use --home <private-home> --phase prepare|resume|migrate-legacy [--id <responsibility-id>]'); options[key] = args.shift(); }
if (!options['--home'] || !['prepare', 'resume', 'migrate-legacy'].includes(options['--phase'])) throw new Error('Use --home <private-home> --phase prepare|resume|migrate-legacy [--id <responsibility-id>]');
const home = resolve(options['--home']); const id = options['--id'] ?? 'cloud-acceptance'; const directory = join(home, 'cloud-acceptance', id); await mkdir(directory, { recursive: true });
await mkdir(join(directory, 'runs'), { recursive: true });
const runDirectory = join(directory, 'runs', `${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(8).toString('hex')}`); await mkdir(runDirectory);
const report = { schemaVersion: 1, phase: options['--phase'], startedAt: new Date().toISOString(), process: process.pid, host: hostname(), logicalSubmissions: 12, calls: [], status: 'running', scope: 'Actual bounded built-in workload on this executor. Pressure/failures are explicitly injected synthetic signals. No provider quota, global enforcement or native browser claim.' };
const demand = (condition, message) => { if (!condition) throw new Error(message); };
let index = 0;
async function invoke(command, value, outcomes = null) {
  const file = join(runDirectory, `${report.phase}-${String(index++).padStart(3, '0')}.json`); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  const result = spawnSync(process.execPath, [join(source, 'scripts/agent.mjs'), command, '--file', file, '--home', home], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const output = JSON.parse(result.stdout); report.calls.push({ file, command, exit: result.status, stdout: result.stdout, stderr: result.stderr });
  demand(output.ok && [0, 3].includes(result.status), `CLI failure ${result.stdout}`);
  if (outcomes) demand(outcomes.includes(output.data.outcome), `Unexpected outcome ${output.data.outcome}`);
  return output.data;
}
const cloud = (operation, fields = {}, outcomes = null) => invoke('cloud', { schemaVersion: 1, responsibilityId: id, operation, ...fields }, outcomes);
const capacity = state => ({ synthetic: true, state, observedAt: new Date().toISOString() });
const job = (n, change = {}) => ({ id: `job-${n}`, priority: 'heavy', payload: `bounded standard-library payload ${n}`, units: n === 1 ? 3 : 1, transientFailures: n === 6 ? 1 : 0, ...change });
try {
  report.incarnation = await captureProcessIncarnation();
  if (report.phase === 'migrate-legacy') {
    demand(options['--attestation'] && !options['--baseline'], 'Migration requires --attestation <parent-reviewed-local-file> and no --baseline');
    const migration = await migrateLegacyAcceptance(home, id, resolve(options['--attestation']));
    report.status = migration.status; report.migration = migration; report.next = `Run a later separate invocation with --home '${home}' --phase resume --id '${id}' --baseline '${migration.path}'.`;
  } else if (report.phase === 'prepare') {
    demand(!options['--attestation'] && !options['--baseline'], 'Prepare accepts no legacy evidence options');
    try { await lstat(join(directory, 'checkpoint.json')); throw new Error('Checkpoint already exists. Preserve it and resume or use the explicit legacy migration route.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const definition = { id, parents: [], goal: 'Demonstrate a bounded cooperative workload and recover its checkpoint in a fresh process.', context: 'Owner-invoked local acceptance. Capacity pressure and transient faults are synthetic. No native browser or provider-quota assertion.', action: 'cloud-work', resource: id, destination: 'current-process', target: { projectId: 'emmy', repository: 'https://github.com/jerome-queck/emmy', executor: 'dot-cloud', hostId: hostname(), revision: 'retrieved-source-snapshot', dirtyDigest: 'not-a-provider-build-claim' }, cloudReason: 'Bounded acceptance on the invoking executor; pure standard-library chunks only.', authorityRef: { reference: 'Owner invocation of bounded acceptance script', action: 'cloud-work', resource: id, destination: 'current-process', cloud: true }, criteria: [{ id: 'terminal-effects', description: 'Bounded jobs retain one terminal effect per stable identity.', evidence: 'reported-check' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'cloud-admission', method: 'Cooperative checkpointed sha256-chain', intendedEffect: 'Bounded acceptance workload', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' } };
    const before = spawnSync(process.execPath, [join(source, 'scripts/agent.mjs'), 'cloud', '--file', join(directory, 'does-not-exist.json'), '--home', home], { encoding: 'utf8' });
    report.invalidInputExit = before.status; demand(before.status === 2, 'Missing input must refuse');
    await invoke('responsibility', definition);
    await cloud('configure', { config: { maxPending: 4, maxJobs: 16, backoffMs: 1, maxBackoffMs: 4 } }, ['configured']);
    await cloud('submit', { job: job(1) }, ['accepted']);
    await cloud('submit', { job: job(2) }, ['accepted']);
    await cloud('submit', { job: job(1) }, ['coalesced']);
    await cloud('submit', { job: job(3) }, ['backpressure']);
    const deferred = await cloud('tick', { capacity: capacity('pressure') }, ['deferred']); demand(deferred.counts.finished === 0, 'Pressure must not execute');
    const started = await cloud('tick', { capacity: capacity('available') }, ['checkpointed']); demand(started.state.jobs[0].completedUnits === 1 && started.counts.active === 1, 'One checkpointed active job');
    await cloud('submit', { job: job(1) }, ['coalesced']);
    await cloud('submit', { job: job(3, { priority: 'morning' }) }, ['accepted']);
    await cloud('submit', { job: job(4, { priority: 'interactive' }) }, ['accepted']);
    const first = await cloud('tick', { capacity: capacity('available') }, ['finished']); demand(first.state.jobs.find(entry => entry.input.id === 'job-4').status === 'finished', 'Interactive priority wins at boundary');
    const second = await cloud('tick', { capacity: capacity('available') }, ['finished']); demand(second.state.jobs.find(entry => entry.input.id === 'job-3').status === 'finished', 'Morning priority wins before heavy continuation');
    const unknown = await cloud('tick', { capacity: capacity('unknown') }, ['deferred']);
    const repeated = await cloud('tick', { capacity: capacity('unknown') }, ['deferred']); demand(unknown.newEscalations.length === 1 && repeated.newEscalations.length === 0, 'Monitoring failure deduplicates pending escalation');
    const checkpoint = await cloud('status');
    await writeFile(join(directory, 'checkpoint.json'), `${JSON.stringify({ process: process.pid, incarnation: await captureProcessIncarnation(), responsibilityId: id, headHash: checkpoint.headHash, completedUnits: checkpoint.state.jobs[0].completedUnits, terminalEffects: checkpoint.counts.finished, preparedAt: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' });
    report.status = 'prepared'; report.next = `Run this same script in a separate process with --home '${home}' --phase resume --id '${id}'.`;
  } else {
    demand(!options['--attestation'], 'Resume accepts --baseline only after explicit legacy migration');
    const checkpoint = (await readAcceptanceJson(join(directory, 'checkpoint.json'), 65536)).value;
    const restart = await acceptanceRestartEvidence(home, id, checkpoint, options['--baseline'] ? resolve(options['--baseline']) : null);
    const status = await cloud('status'); demand(status.headHash === checkpoint.headHash && status.state.jobs[0].completedUnits === checkpoint.completedUnits && status.counts.finished === checkpoint.terminalEffects && status.turn?.status === 'available', 'Exact committed checkpoint survives fresh process');
    await cloud('tick', { capacity: capacity('available') }, ['checkpointed']);
    await cloud('tick', { capacity: capacity('available') }, ['finished']);
    await cloud('submit', { job: job(1) }, ['coalesced']);
    await cloud('tick', { capacity: capacity('available') }, ['finished']);
    for (let n = 5; n <= 12; n++) {
      await cloud('submit', { job: job(n) }, ['accepted']);
      let result = await cloud('tick', { capacity: capacity('available') });
      if (n === 6) { demand(result.outcome === 'retry-scheduled', 'Transient fault schedules a bounded retry'); result = await cloud('tick', { capacity: capacity('available') }); }
      demand(result.outcome === 'finished', `Job ${n} finishes`);
    }
    const final = await cloud('status'); demand(final.counts.finished === 12 && final.counts.pending === 0 && final.counts.active === 0, 'All twelve logical submissions finished once');
    const effects = final.state.jobs.map(entry => ({ key: entry.key, output: entry.output, units: entry.completedUnits })); demand(new Set(effects.map(entry => entry.key)).size === 12, 'Terminal effect identities are unique');
    const repeat = await cloud('tick', { capacity: capacity('available') }, ['idle']); demand(repeat.newEscalations.length === 0, 'Healthy idle turn emits no new escalation');
    report.status = 'passed'; report.effects = effects; report.effectsDigest = digest(effects); report.pendingEscalations = final.pendingEscalations; report.delivery = 'Pending parent-owned Dot confirmation. This script sends no notification.'; report.restart = { ...restart, exactCheckpoint: true };
  }
} catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
report.completedAt = new Date().toISOString(); const reportFile = join(runDirectory, 'report.json'); await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ status: report.status, report: reportFile, phase: report.phase, calls: report.calls.length, effectsDigest: report.effectsDigest, baseline: report.migration?.path, baselineDigest: report.migration?.sha256, next: report.next, error: report.error?.message })}\n`);
