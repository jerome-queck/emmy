#!/usr/bin/env node
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, parse, resolve } from 'node:path';
import { exportOutcome } from '../src/automation-reporting-export.mjs';
import { boundedJson } from '../src/bounded-json.mjs';
import { automationReporting, improvementRecords, canonical } from '../src/automation-reporting.mjs';
import { startDashboard } from '../src/automation-reporting-dashboard.mjs';

const actions = new Set(['inspect', 'list', 'get', 'status', 'publish-own-record', 'validate', 'diagnose', 'dry-run', 'reconcile', 'import-improvement', 'export-outcome', 'serve']);
const options = new Map([
  ['--to', 'to'], ['--directory', 'directory'], ['--namespace', 'namespace'], ['--file', 'file'],
  ['--id', 'id'], ['--automation-id', 'automationId'], ['--query', 'query'],
  ['--cursor', 'cursor'], ['--limit', 'limit'], ['--as-of', 'evaluatedAt'], ['--port', 'port'],
]);
const help = `Usage: automation-reporting <action> --directory <private-store> [options]
Actions: inspect, list, get, status, publish-own-record, validate, diagnose,
         dry-run, reconcile, import-improvement, export-outcome, serve
Options: --namespace <owner> --file <record.json> --id <digest>
         --automation-id <id> --query <text> --cursor <cursor> --limit <count>
         --as-of <UTC> --port <port, serve only; default 0>
Publication requires --namespace and --file. Files contain one record object.
import-improvement requires --namespace, --automation-id and --file <compact-report.json>.
Use import-improvement --dry-run to validate without writing.
export-outcome requires --id <current-run-digest> and --to <absolute-private-file>.
Export writes sanitized compact JSON locally; publication remains pending.
serve opens a read-only dashboard on 127.0.0.1 with an ephemeral port by default.
JSON stdout. Exit 0 success, 2 invalid request, 3 findings.\n`;

async function writeOutcome(path, bytes) {
  if (!isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error('--to requires an absolute private output without traversal');
  const selected = resolve(path);
  let ancestor = dirname(selected);
  while (true) {
    if (!(await lstat(ancestor)).isDirectory()) throw new Error('Output ancestry must contain ordinary directories');
    if (ancestor === parse(ancestor).root) break;
    ancestor = dirname(ancestor);
  }
  if (await realpath(dirname(selected)) !== dirname(selected)) throw new Error('Symlinked output ancestry refused');
  let handle;
  try { handle = await open(selected, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await open(selected, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await existing.stat();
      if (!info.isFile() || info.size > 32768 || (info.mode & 0o077) !== 0) throw new Error('Existing export must be a bounded private ordinary file');
      const buffer = Buffer.alloc(32769);
      let length = 0;
      while (length < buffer.length) {
        const result = await existing.read(buffer, length, buffer.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (!buffer.subarray(0, length).equals(Buffer.from(bytes))) throw new Error('Existing export differs; choose a new output file');
      return 'identical';
    } finally { await existing.close(); }
  }
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
  return 'exported';
}

try {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && ['help', '--help', '-h'].includes(args[0]))) {
    process.stdout.write(JSON.stringify({ ok: true, help }) + '\n');
  } else {
    const action = args.shift();
    if (!actions.has(action)) throw new Error('Unknown action. Use --help.');
    const parsed = {};
    while (args.length) {
      const flag = args.shift();
      if (flag === '--dry-run') {
        if (action !== 'import-improvement' || parsed.dryRun) throw new Error('--dry-run requires import-improvement and cannot repeat');
        parsed.dryRun = true;
        continue;
      }
      const key = options.get(flag);
      if (!key || Object.hasOwn(parsed, key)) throw new Error(`Unknown or repeated option ${flag}`);
      const value = args.shift();
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      parsed[key] = value;
    }
    if (!parsed.directory) throw new Error('--directory is required');
    for (const key of ['limit', 'port']) {
      if (parsed[key] !== undefined) {
        if (!/^\d+$/.test(parsed[key]) || !Number.isSafeInteger(Number(parsed[key]))) throw new Error(`Invalid --${key}`);
        parsed[key] = Number(parsed[key]);
      }
    }
    if (parsed.limit !== undefined && parsed.limit < 1) throw new Error('--limit must be positive');
    if (parsed.port !== undefined && (action !== 'serve' || parsed.port > 65535)) throw new Error('--port requires serve and a port from 0 to 65535');
    if (parsed.evaluatedAt !== undefined && !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(parsed.evaluatedAt)) throw new Error('--as-of must be a UTC timestamp');
    if (parsed.evaluatedAt !== undefined && !Number.isFinite(Date.parse(parsed.evaluatedAt))) throw new Error('Invalid --as-of');
    if (action === 'serve') {
      if (Object.keys(parsed).some(key => !['directory', 'port'].includes(key))) throw new Error('serve accepts only --directory and --port');
      const { server, address } = await startDashboard(parsed);
      process.stdout.write(JSON.stringify({ ok: true, status: 'serving', address, readOnly: true }) + '\n');
      const stop = () => server.close(() => process.exit(0));
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    } else if (action === 'export-outcome') {
      if (!parsed.id || !parsed.to || Object.keys(parsed).some(key => !['directory', 'id', 'to'].includes(key))) throw new Error('export-outcome requires only --directory, --id and --to');
      const snapshot = await automationReporting({ action: 'status', directory: parsed.directory });
      const run = snapshot.runs.find(item => item.id === parsed.id);
      if (!snapshot.scan.complete || !run || !run.valid || run.conflict) throw new Error('Export requires a valid nonconflicted current run and complete scan');
      const exact = await automationReporting({ action: 'get', directory: parsed.directory, id: parsed.id });
      if (!exact.scan.complete || !exact.record) throw new Error('Exact run readback unavailable');
      const outcome = exportOutcome(exact.record);
      const status = await writeOutcome(parsed.to, canonical(outcome) + '\n');
      process.stdout.write(JSON.stringify({ ok: true, data: { status, subject: parsed.id, publication: 'pending', userDelivery: 'pending' } }) + '\n');
    } else if (action === 'import-improvement') {
      if (!parsed.namespace || !parsed.automationId || !parsed.file) throw new Error('import-improvement requires --namespace, --automation-id and --file');
      if (Object.keys(parsed).some(key => !['directory', 'namespace', 'automationId', 'file', 'evaluatedAt', 'dryRun'].includes(key))) throw new Error('Unsupported import-improvement option');
      const { directory, namespace, automationId, file, evaluatedAt, dryRun } = parsed;
      const records = improvementRecords(await boundedJson(file, 16384), { namespace, automationId });
      const results = [];
      for (const record of records) results.push(await automationReporting({ action: 'validate', directory, namespace, record }, { evaluatedAt }));
      if (!dryRun) {
        results.length = 0;
        for (const record of records) results.push(await automationReporting({ action: 'publish-own-record', directory, namespace, record }, { evaluatedAt }));
      }
      const status = dryRun ? 'dry-run' : results.every(result => result.status === 'identical') ? 'identical' : 'published';
      process.stdout.write(JSON.stringify({ ok: true, data: { status, records: results, writes: !dryRun } }) + '\n');
    } else {
      const { evaluatedAt, file, ...request } = parsed;
      if (file) request.record = await boundedJson(file, 32768);
      const data = await automationReporting({ action, ...request }, { evaluatedAt });
      process.stdout.write(JSON.stringify({ ok: true, data }) + '\n');
      process.exitCode = data.status === 'needs-attention' || data.findings?.length > 0 ? 3 : 0;
    }
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n');
  process.exitCode = 2;
}
