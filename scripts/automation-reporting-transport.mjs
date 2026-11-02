#!/usr/bin/env node
import { readHistoryRequest } from '../src/automation-reporting-history.mjs';
import { assertNoCredentials } from '../src/reporting-privacy.mjs';
import { transportAutomationReporting } from '../src/automation-reporting-transport.mjs';

try {
  const args = process.argv.slice(2); const request = {};
  const flags = { '--source-directory': 'sourceDirectory', '--directory': 'directory', '--namespace': 'namespace', '--mapping-cursor': 'mappingCursor', '--publication-file': 'publicationFile' };
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(JSON.stringify({ ok: true, help: 'automation-reporting-transport --source-directory <private-fallback> --directory <verified-synced-Records> --namespace <owner> [--dry-run] [--mapping-cursor <source-digest>] [--publication-file <private-history-request>]. Mapping and normalization pages show at most 50 entries. Local publication only; remote verification remains pending.' }) + '\n');
  } else {
    while (args.length) {
      const flag = args.shift(); const key = flag === '--dry-run' ? 'dryRun' : flags[flag];
      if (!key || Object.hasOwn(request, key)) throw new Error('Unknown or repeated transport option');
      if (key === 'dryRun') { request[key] = true; continue; }
      const value = args.shift();
      if (value === undefined || value.startsWith('--')) throw new Error('Missing transport option value');
      request[key] = value;
    }
    if (!request.sourceDirectory || !request.directory || !request.namespace) throw new Error('Source directory, target directory and namespace required');
    const { mappingCursor = null, publicationFile = null, ...transportRequest } = request;
    if (publicationFile !== null) transportRequest.publication = await readHistoryRequest(publicationFile);
    if (mappingCursor !== null && !/^[a-f0-9]{64}$/.test(mappingCursor)) throw new Error('Expected source digest mapping cursor');
    const { mapping, results, normalizations, ...data } = await transportAutomationReporting(transportRequest);
    const page = values => {
      const candidates = [...values].sort((a, b) => a.sourceDigest.localeCompare(b.sourceDigest)).filter(item => mappingCursor === null || item.sourceDigest > mappingCursor);
      const items = candidates.slice(0, 50);
      return { items, page: { total: values.length, shown: items.length, nextCursor: candidates.length > 50 ? items.at(-1).sourceDigest : null } };
    };
    const mapped = page(mapping); const normalized = page(normalizations.manualNominalSlotOmittedSourceRetained);
    const resultCounts = results.reduce((counts, result) => { counts[result.status] = (counts[result.status] ?? 0) + 1; return counts; }, {});
    process.stdout.write(JSON.stringify({ ok: true, data: { ...data, mapping: mapped.items, mappingPage: mapped.page, resultCounts, normalizations: { manualNominalSlotOmittedSourceRetained: normalized.items }, normalizationPage: normalized.page } }) + '\n');
  }
} catch (error) {
  let message = error.code ? 'Local file operation failed' : error instanceof SyntaxError ? 'Invalid JSON syntax' : typeof error.message === 'string' ? error.message : 'Transport request refused';
  try { assertNoCredentials(message); } catch { message = 'Transport request refused'; }
  process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
  process.exitCode = 2;
}
