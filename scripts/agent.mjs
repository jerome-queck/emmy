#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { commands } from '../src/metadata.mjs';
import { readCatalog } from '../src/catalog.mjs';
import { maintain } from '../src/maintenance.mjs';
import { backupHome, digest, historicalFiles, publishRecord, readBindings, readJson, restoreHome, timestamp } from '../src/records.mjs';
import { adoptResponsibility, inspectHome, reconcile } from '../src/responsibilities.mjs';
import { briefing, guidancePin } from '../src/briefing.mjs';
import { dispatch } from '../src/dispatch.mjs';
import { calendar } from '../src/calendar.mjs';
import { calendarRegister } from '../src/calendar-register-io.mjs';
import { fleet } from '../src/fleet.mjs';
import { tokenReview } from '../src/token-review.mjs';
import { signin } from '../src/signin.mjs';
import { automationProcedure } from '../src/automation-procedure.mjs';
import { boundedJson } from '../src/bounded-json.mjs';
import { automationReporting } from '../src/automation-reporting.mjs';
import { assertNoCredentials } from '../src/reporting-privacy.mjs';
import { assessAssurance } from '../src/local-assurance.mjs';
import { executeBriefing } from '../src/briefing-core.mjs';

const args = process.argv.slice(2);
const commandName = args.shift() ?? 'help';
try {
  const command = commands.find(value => value.name === commandName);
  if (!command) throw new Error(`Unknown command ${commandName}`);
  const allowed = new Map([...command.options, { name: 'root' }, { name: 'home' }, { name: 'json', flag: true }].map(value => [value.name, value]));
  const options = {};
  while (args.length) {
    const name = args.shift();
    if (!name.startsWith('--') || !allowed.has(name.slice(2))) throw new Error(`Unknown option ${name}`);
    const key = name.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate option ${name}`);
    if (allowed.get(key).flag) options[key] = true;
    else { const value = args.shift(); if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`); options[key] = value; }
  }
  for (const option of command.options) if (option.required && !options[option.name]) throw new Error(`Missing --${option.name}`);
  const root = resolve(options.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const home = resolve(options.home ?? join(root, '.local'));
  let data; let exitCode = 0;
  switch (command.name) {
    case 'help':
      data = { commands, globalOptions: ['--root <public-source>', '--home <private-state>', '--json'], output: 'One JSON object', exitCodes: { 0: 'local operation completed', 2: 'invalid input, corrupt storage, or operational error', 3: 'actionable findings, conflict, suspension, generated drift, or advisory revision/degradation' } };
      break;
    case 'catalog': data = await readCatalog(root); break;
    case 'doctor': {
      const catalog = await readCatalog(root);
      const bindings = await readBindings(home); const store = await inspectHome(home); const historical = await historicalFiles(home);
      const references = await maintain(root, catalog, false); const runtimeSupported = Number(process.versions.node.split('.')[0]) >= 24;
      data = { status: runtimeSupported && references.status === 'current' && !store.restoredNeedsFreshObservations && !store.fleetNeedsAttention ? 'ready' : 'needs-attention', node: process.versions.node, runtimeSupported, projects: catalog.projects.length, boundProjects: Object.keys(bindings.projects).length, store, historicalFiles: historical.length, historicalAssurance: 'reported-only', references, limits: ['Local integrity does not establish Dot access or authenticate native authority.'] };
      exitCode = data.status === 'ready' ? 0 : 3; break;
    }
    case 'responsibility': data = await adoptResponsibility(home, await readJson(resolve(options.file))); break;
    case 'reconcile':
      data = await reconcile(home, { id: options.id, imports: options.import ? await readJson(resolve(options.import)) : null, asOf: timestamp(options['as-of'], 'as-of'), catalog: await readCatalog(root) });
      exitCode = data.status === 'current' ? 0 : 3; break;
    case 'reporting':
      data = await automationReporting(await boundedJson(resolve(options.file), 65536));
      exitCode = data.status === 'needs-attention' ? 3 : 0; break;
    case 'assurance':
      data = await assessAssurance(root, await boundedJson(resolve(options.file)));
      exitCode = data.status === 'current-local-reported' ? 0 : 3; break;
    case 'automation': {
      const request = await boundedJson(resolve(options.file), 1048576);
      data = await automationProcedure(request);
      exitCode = request.action === 'read' && data.status !== 'available' ? 3 : 0; break;
    }
    case 'daily-briefing': {
      const request = await boundedJson(resolve(options.file), 1048576);
      data = executeBriefing(request, { now: new Date().toISOString() });
      exitCode = request.action === 'prepare' ? data.checksTerminal && data.coverage === 'complete-declared' ? 0 : 3
        : ['policy', 'foundation'].includes(request.action) ? 0
        : request.action === 'reporting' ? data.readyForBriefing === false || data.publication === 'unverified' ? 3 : 0
        : data.status === 'held' ? 3 : 0;
      break;
    }
    case 'briefing':
      data = await briefing(home, { file: options.file ? resolve(options.file) : null });
      exitCode = data.mode === 'guidance' ? (['current', 'pinned'].includes(data.guidance.state) ? 0 : 3) : (data.status === 'checked' ? 0 : 3); break;
    case 'guidance-pin':
      data = await guidancePin(home, { file: resolve(options.file) });
      exitCode = ['pinned', 'remote-default'].includes(data.status) ? 0 : 3; break;
    case 'token-review':
      data = await tokenReview({ file: resolve(options.file) });
      exitCode = data.status === 'checked' ? 0 : 3; break;
    case 'calendar':
      data = await calendar({ file: resolve(options.file) });
      exitCode = data.status === 'checked' ? 0 : 3; break;
    case 'calendar-register':
      data = await calendarRegister(home, { file: resolve(options.file) });
      exitCode = ['collected', 'proposed', 'cloud-plan-ready', 'preflight-ready', 'accepted-reported', 'api-plan-ready-reported', 'api-applied-reported'].includes(data.status) ? 0 : 3; break;
    case 'fleet':
      data = await fleet(home, { file: resolve(options.file) });
      exitCode = data.status === 'ready' && !['backpressure', 'reconcile-before-admission'].includes(data.outcome) ? 0 : 3; break;
    case 'signin':
      data = await signin({ file: resolve(options.file) });
      exitCode = data.status === 'recovered' ? 0 : 3; break;
    case 'dispatch':
      data = await dispatch(home, { id: options.id, project: options.project, resolve: options.resolve, discoveryFile: options.discovery ? resolve(options.discovery) : null, asOf: timestamp(options['as-of'], 'as-of'), contextNeeded: Boolean(options['context-needed']), catalog: await readCatalog(root) });
      exitCode = ['advice-ready', 'recovered', 'resolved'].includes(data.status) ? 0 : 3; break;
    case 'probe': {
      const catalog = await readCatalog(root);
      const selected = options.id ? catalog.probes.filter(probe => probe.id === options.id) : catalog.probes.filter(probe => probe.id !== 'cloud-delegation');
      if (!selected.length) throw new Error(`Unknown probe ${options.id}`);
      const operatingBrief = await readFile(join(root, 'docs/operating-brief.md'), 'utf8');
      const probes = selected.map(probe => ({ ...probe, prompt: probe.prompt.replaceAll('{{nonce}}', options.nonce), status: 'proposed' }));
      const payload = { schemaVersion: 1, type: 'probe', execution: 'proposal-only', nonce: options.nonce, operatingBriefDigest: digest(operatingBrief), probes, accountStatus: 'unverified' };
      const packet = `# Proposed Emmy onboarding\n\nNot installed. No probe or schedule ran.\n\nOperating brief SHA-256 ${payload.operatingBriefDigest}. Discover tools in the current attached environment.\n\n${operatingBrief}\n\n## Proposed probes\n\n${probes.map((probe, index) => `${index + 1}. ${probe.id}. ${probe.prompt}\n\nExpected evidence. ${probe.evidence}`).join('\n\n')}\n`;
      data = await publishRecord(home, payload, { 'packet.md': packet }); break;
    }
    case 'maintain':
      if (Boolean(options.check) === Boolean(options.write)) throw new Error('Choose exactly one of --check and --write');
      data = await maintain(root, await readCatalog(root), Boolean(options.write)); exitCode = data.status === 'current' ? 0 : 3; break;
    case 'backup': data = await backupHome(home, resolve(options.to)); break;
    case 'restore': data = await restoreHome(resolve(options.from), resolve(options.into)); break;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: command.name, data })}\n`);
  process.exitCode = exitCode;
} catch (error) {
  let message = typeof error.message === 'string' ? error.message : 'Request refused';
  try { assertNoCredentials(message); } catch { message = 'Request refused'; }
  process.stdout.write(`${JSON.stringify({ ok: false, command: commands.some(command => command.name === commandName) ? commandName : 'unknown', error: message })}\n`);
  process.exitCode = 2;
}
