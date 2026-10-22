#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { commands } from '../src/metadata.mjs';
import { readCatalog } from '../src/catalog.mjs';
import { maintain } from '../src/maintenance.mjs';
import { checkArtifacts, digest, parseReceipt, parseRequest, parseSnapshot, publishRecord, readBindings, readJson, readRecord, timestamp } from '../src/records.mjs';
import { assessOutcome, planTask, snapshotStatus, taskPacket } from '../src/work.mjs';

const args = process.argv.slice(2);
const commandName = args.shift() ?? 'help';
let command;
try {
  command = commands.find(value => value.name === commandName);
  if (!command) throw new Error(`Unknown command ${commandName}`);
  const allowed = new Map([...command.options, { name: 'root' }, { name: 'json', flag: true }].map(value => [value.name, value]));
  const options = {};
  while (args.length) {
    const name = args.shift();
    if (!name.startsWith('--') || !allowed.has(name.slice(2))) throw new Error(`Unknown option ${name}`);
    const key = name.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate option ${name}`);
    if (allowed.get(key).flag) options[key] = true;
    else {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
      options[key] = value;
    }
  }
  for (const option of command.options) if (option.required && !options[option.name]) throw new Error(`Missing --${option.name}`);
  const root = resolve(options.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const catalog = await readCatalog(root);
  let data;
  let exitCode = 0;
  switch (command.name) {
    case 'help':
      data = { commands, globalOptions: ['--root <repository>', '--json'], output: 'One JSON object', exitCodes: { 0: 'completed', 2: 'invalid input or operational error', 3: 'needs observation, evidence conflict, or drift' } };
      break;
    case 'catalog':
      data = catalog;
      break;
    case 'doctor': {
      const bindings = await readBindings(root);
      const references = await maintain(root, catalog, false);
      const runtimeSupported = Number(process.versions.node.split('.')[0]) >= 24;
      data = { status: runtimeSupported && references.status === 'current' ? 'ready' : 'needs-attention', node: process.versions.node, runtimeSupported, projects: catalog.projects.length, boundProjects: Object.keys(bindings.projects).length, references, limits: ['This checks the local kit. Dot and provider access remain unverified.', 'No binding is required to read the catalog or prepare an onboarding packet.'] };
      exitCode = runtimeSupported && references.status === 'current' ? 0 : 3;
      break;
    }
    case 'snapshot': {
      const payload = parseSnapshot(await readJson(resolve(options.import)));
      const published = await publishRecord(root, 'snapshots', payload);
      data = { ...published, execution: 'import-only' };
      break;
    }
    case 'brief': {
      const snapshot = await readRecord(root, 'snapshots', options.snapshot);
      const asOf = timestamp(options['as-of'], 'as-of');
      data = { snapshotId: snapshot.id, scope: snapshot.scope, observedAt: snapshot.observedAt, asOf, coverage: snapshot.coverage, observer: snapshot.observer, basis: snapshot.basis, projects: snapshot.projects, chats: snapshot.chats, limits: snapshot.limits, observation: snapshotStatus(snapshot, snapshot.scope, asOf) };
      break;
    }
    case 'plan': {
      const request = parseRequest(await readJson(resolve(options.request)));
      const bindings = await readBindings(root);
      const snapshot = options.snapshot ? await readRecord(root, 'snapshots', options.snapshot) : null;
      const asOf = timestamp(options['as-of'], 'as-of');
      const task = { ...planTask(request, { catalog, bindings, snapshot, asOf }), catalogDigest: digest(catalog), bindingDigest: digest(bindings) };
      data = await publishRecord(root, 'tasks', task, { 'packet.md': taskPacket(task) });
      exitCode = task.route.status === 'ready' ? 0 : 3;
      break;
    }
    case 'receipt': {
      const task = await readRecord(root, 'tasks', options.task);
      const receipt = parseReceipt(await readJson(resolve(options.import)));
      if (receipt.taskId !== task.id) throw new Error('Receipt taskId must equal --task');
      if (task.request.workClass === 'code' && !/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(receipt.resultRevision)) throw new Error('Code resultRevision must be a full lowercase commit SHA');
      data = await publishRecord(root, 'receipts', receipt);
      break;
    }
    case 'assess': {
      const task = await readRecord(root, 'tasks', options.task);
      const receipt = await readRecord(root, 'receipts', options.receipt);
      const asOf = timestamp(options['as-of'], 'as-of');
      if (task.request.workClass === 'code' && !/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(options.revision)) throw new Error('Code --revision must be a full lowercase commit SHA');
      const artifactChecks = await checkArtifacts(receipt);
      const assessment = { ...assessOutcome(task, receipt, artifactChecks, options.revision, asOf), artifactChecks };
      data = await publishRecord(root, 'assessments', assessment);
      exitCode = assessment.status === 'supported' ? 0 : 3;
      break;
    }
    case 'probe': {
      const selected = options.id ? catalog.probes.filter(probe => probe.id === options.id) : catalog.probes;
      if (!selected.length) throw new Error(`Unknown probe ${options.id}`);
      const operatingBrief = await readFile(join(root, 'docs/operating-brief.md'), 'utf8');
      const probes = selected.map(probe => ({ ...probe, prompt: probe.prompt.replaceAll('{{nonce}}', options.nonce), status: 'proposed' }));
      const payload = { schemaVersion: 1, execution: 'proposal-only', nonce: options.nonce, operatingBriefDigest: digest(operatingBrief), probes, accountStatus: 'unverified' };
      const packet = `# Proposed Emmy onboarding\n\nNot installed. No probe or schedule ran.\n\nRead docs/operating-brief.md at SHA-256 ${payload.operatingBriefDigest}. Apply it in the actual Dot through supported instructions. Discover tools there. Never treat this Codex session's tools as your account access.\n\n${operatingBrief}\n\n## Proposed probes\n\n${probes.map((probe, index) => `${index + 1}. ${probe.id}. ${probe.prompt}\n\nExpected evidence. ${probe.evidence}`).join('\n\n')}\n\nKeep private paths, task IDs, raw output, and personal state under .local. Capture tool, executor, UTC timestamp, scope, exact identity, result, limitations, and retained evidence. Ask the owner for missing scratch repo, known task, prepared environment, or future absolute time. Read back each actual record before upgrading the account status. Use docs/dot-verification.md for recovery and cleanup.\n`;
      data = await publishRecord(root, 'probes', payload, { 'packet.md': packet });
      break;
    }
    case 'maintain':
      if (Boolean(options.check) === Boolean(options.write)) throw new Error('Choose exactly one of --check and --write');
      data = await maintain(root, catalog, Boolean(options.write));
      exitCode = data.status === 'current' ? 0 : 3;
      break;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: command.name, data })}\n`);
  process.exitCode = exitCode;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, command: commandName, error: error.message })}\n`);
  process.exitCode = 2;
}
