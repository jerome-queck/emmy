import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonical } from './records.mjs';
import { insist, shape, stamp, receiptInput } from './fleet-schema.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
const read = path => JSON.parse(readFileSync(path, 'utf8'));
// Portable in capture runtimes without TextEncoder; lone surrogates use UTF-8 replacement.
export function utf8Bytes(value) {
  let bytes = 0;
  for (const char of value) { const point = char.codePointAt(0); bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4; }
  return bytes;
}
export function collectionBegin(directory, config) {
  shape(config, ['runId', 'sourceId', 'scope', 'ownerRef', 'provenance', 'jobKey', 'ticket', 'generation'], 'collection config');
  insist(['ordinary-authorized', 'admitted'].includes(config.provenance) && typeof config.ownerRef === 'string' && config.ownerRef && typeof config.runId === 'string' && typeof config.sourceId === 'string', 'Collection needs explicit authority, source and provenance');
  insist(config.provenance === 'ordinary-authorized' ? config.jobKey === null && config.ticket === null : /^[a-f0-9]{64}$/.test(config.jobKey) && /^[a-f0-9]{64}$/.test(config.ticket), 'Ordinary collection cannot borrow an advisory ticket');
  insist(!existsSync(directory), 'Collection directory already exists; continue its retained attempts'); mkdirSync(directory, { mode: 0o700, recursive: true }); save(join(directory, 'config.json'), config); return config;
}
export function collectionCollect(directory, capture, rawPath) {
  const config = read(join(directory, 'config.json')); shape(capture, ['attempt', 'observedAt', 'capturedAt', 'outcome', 'reason'], 'capture');
  insist(Number.isInteger(capture.attempt) && capture.attempt >= 1 && capture.attempt <= (config.provenance === 'ordinary-authorized' ? 62 : 32) && stamp(capture.observedAt) && stamp(capture.capturedAt) && Date.parse(capture.observedAt) <= Date.parse(capture.capturedAt) && ['returned', 'lost', 'denied'].includes(capture.outcome), 'Invalid bounded capture');
  const base = join(directory, String(capture.attempt)); insist(!existsSync(`${base}.json`) && !existsSync(`${base}.raw`), 'Capture attempt already retained');
  // Write supplied response bytes BEFORE any decoding, counter or JSON parsing.
  if (rawPath) writeFileSync(`${base}.raw`, readFileSync(rawPath), { flag: 'wx', mode: 0o600 });
  save(`${base}.input.json`, capture);
  const raw = rawPath ? readFileSync(`${base}.raw`) : null;
  let bytes = null; let counterFailure = null;
  try {
    insist(capture.outcome === 'returned' ? rawPath : typeof capture.reason === 'string' && capture.reason, 'Missing raw response or attributable failure');
    insist(!raw || raw.length <= 1048576, 'Raw response exceeds artifact byte bound');
    if (raw) bytes = utf8Bytes(JSON.stringify(JSON.parse(raw.toString('utf8'))));
  } catch (error) { counterFailure = error.message; }
  const result = { ...capture, bytes, artifactBytes: raw?.length ?? null, counterFailure, sha256: raw ? sha(raw) : null, rawPath: raw ? `${capture.attempt}.raw` : null };
  save(`${base}.json`, result); return result;
}
export function collectionFinish(directory, details) {
  const config = read(join(directory, 'config.json'));
  shape(details, ['attempts', 'coverage', 'paginationComplete', 'cached', 'resourceIds', 'messageIds', 'window', 'envelope'], 'collection finish');
  insist(Number.isInteger(details.attempts) && details.attempts > 0 && details.attempts <= (config.provenance === 'ordinary-authorized' ? 62 : 32), 'Invalid capture count');
  const captures = Array.from({ length: details.attempts }, (_, index) => read(join(directory, `${index + 1}.json`)));
  for (const capture of captures) if (capture.rawPath) { const raw = readFileSync(join(directory, capture.rawPath)); insist(sha(raw) === capture.sha256 && raw.length === capture.artifactBytes, 'Retained response changed'); }
  insist(captures.reduce((sum, capture) => sum + (capture.bytes ?? 0), 0) <= 1048576, 'Collection known bytes exceed bounded packet allowance');
  const unknown = captures.some(capture => capture.bytes === null); const denied = captures.some(capture => capture.outcome === 'denied');
  insist(!details.coverage.complete || !unknown && !denied && details.paginationComplete && !details.cached && details.coverage.gaps.length === 0, 'Unknown, denied or incomplete captures cannot claim complete acquisition');
  const { envelope, ...content } = details;
  const packet = { schemaVersion: 1, kind: 'morning-collection-v1', ...config, ...content, captures, usage: { reads: captures.length, bytes: unknown ? null : captures.reduce((sum, capture) => sum + capture.bytes, 0), knownBytesLowerBound: captures.reduce((sum, capture) => sum + (capture.bytes ?? 0), 0), budgetCompliance: 'unverified' }, outcome: denied ? 'denied' : unknown ? 'unknown' : details.coverage.complete ? 'complete' : 'partial' };
  const packetPath = resolve(join(directory, 'packet.json')); save(packetPath, packet); const bytes = readFileSync(packetPath); const collectionRef = `collection:${sha(bytes)}`;
  const receipt = { observer: 'Operator-supplied raw capture; declared evidence only', sourceRef: collectionRef, sha256: sha(bytes), scope: config.scope, observedAt: captures.reduce((first, capture) => capture.observedAt < first ? capture.observedAt : first, captures[0].observedAt), capturedAt: captures.reduce((last, capture) => capture.capturedAt > last ? capture.capturedAt : last, captures[0].capturedAt), coverage: details.coverage };
  receiptInput(receipt);
  const command = { step: 'source', runId: config.runId, sourceId: config.sourceId, jobKey: config.jobKey, receipt, paginationComplete: details.paginationComplete, cached: details.cached, resourceIds: details.resourceIds, messageIds: details.messageIds, window: details.window, ...(config.generation ? { generation: config.generation } : {}), acquisition: { provenance: config.provenance, ownerRef: config.ownerRef, collectionRef } };
  const evidence = [{ sourceRef: collectionRef, path: packetPath, sha256: sha(bytes) }, ...captures.filter(capture => capture.rawPath).map(capture => ({ sourceRef: `${collectionRef}/attempt/${capture.attempt}`, path: resolve(join(directory, capture.rawPath)), sha256: capture.sha256 }))];
  const result = { command, evidence, ticketCompleted: false, nativeExecution: 'none', note: 'Add retained owner evidence and current journal envelope. Admitted provenance still requires its completed fleet job; ordinary provenance is never queue admission.' };
  if (envelope) {
    shape(envelope, ['responsibilityId', 'expectedHead', 'authorityEvidence'], 'receiving journal envelope');
    insist(typeof envelope.responsibilityId === 'string' && /^[a-f0-9]{64}$/.test(envelope.expectedHead) && Array.isArray(envelope.authorityEvidence), 'Receiving finish needs exact responsibility/current head and authority evidence');
    const authorityEvidence = envelope.authorityEvidence.map(ref => ({ sourceRef: ref.sourceRef, path: resolve(ref.path), sha256: sha(readFileSync(ref.path)) }));
    insist(authorityEvidence.some(ref => ref.sourceRef === config.ownerRef), 'Receiving finish needs existing owner evidence');
    result.input = { schemaVersion: 1, responsibilityId: envelope.responsibilityId, expectedHead: envelope.expectedHead, action: { operation: 'morning', command }, evidence: [...evidence, ...authorityEvidence] };
    result.envelopePath = resolve(join(directory, 'envelope.json')); save(result.envelopePath, result.input);
  }
  save(join(directory, 'intake.json'), result); return result;
}
export function validateCollection(packet, command, run, retainedDigests) {
  insist(packet?.schemaVersion === 1 && packet.kind === 'morning-collection-v1' && packet.runId === run.id && packet.sourceId === command.sourceId && packet.ownerRef === run.ownerRef && packet.provenance === command.acquisition.provenance && packet.jobKey === command.jobKey && canonical(packet.scope) === canonical(command.receipt.scope), 'Collection crosses existing run, scope, provenance or authority');
  insist(packet.outcome !== 'denied' && Array.isArray(packet.captures) && packet.captures.length > 0 && packet.captures.length <= (packet.provenance === 'ordinary-authorized' ? 62 : 32) && packet.captures.every(capture => capture.outcome !== 'denied' && (!capture.sha256 || retainedDigests.includes(capture.sha256))), 'Denied or unretained collection cannot authorize intake');
  insist(canonical(packet.coverage) === canonical(command.receipt.coverage) && packet.paginationComplete === command.paginationComplete && packet.cached === command.cached && canonical(packet.messageIds) === canonical(command.messageIds) && canonical(packet.resourceIds) === canonical(command.resourceIds) && canonical(packet.window) === canonical(command.window), 'Collection intake differs from retained scope/coverage');
  const observed = packet.captures.map(capture => capture.observedAt).sort(); const captured = packet.captures.map(capture => capture.capturedAt).sort();
  insist(observed[0] === command.receipt.observedAt && captured.at(-1) === command.receipt.capturedAt && packet.captures.every(capture => stamp(capture.observedAt) && stamp(capture.capturedAt) && Date.parse(capture.observedAt) <= Date.parse(capture.capturedAt)), 'Collection must preserve original source/fetch timestamps');
  insist(!command.receipt.coverage.complete || packet.outcome === 'complete' && packet.captures.every(capture => capture.outcome === 'returned' && capture.sha256 && Number.isSafeInteger(capture.bytes)), 'Unknown captures cannot claim completeness');
}
