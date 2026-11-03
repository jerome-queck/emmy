import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { canonical, digest } from './records.mjs';
import { strictJson, boundedFile } from './bounded-json.mjs';
import { acquireBriefingPlanSource } from './briefing-cloud-caller.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => canonical(a) === canonical(b);
async function immutable(path, bytes) {
  try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  need((await boundedFile(path, Buffer.byteLength(bytes))).equals(Buffer.from(bytes)), 'Immutable raw retention conflict');
}
export function briefingCloudReadRequest(request, cursor = null) {
  need(request?.schemaVersion === 1 && ['gmail', 'outlook', 'calendar', 'tasks'].includes(request.role) && request.environment === 'dot-cloud' && typeof request.account === 'string' && request.account.length > 0, 'Exact cloud source identity required');
  const surfaces = request.role === 'tasks' ? ['connector', 'browser'] : [request.role === 'outlook' ? 'browser' : 'connector'];
  need(surfaces.includes(request.surface), 'Unsupported cloud source surface');
  need(cursor === null || typeof cursor === 'string' && cursor.length > 0, 'Exact page cursor required');
  need(Number.isSafeInteger(request.maxReads) && request.maxReads > 0 && request.maxReads <= 100 && Number.isSafeInteger(request.maxBytes) && request.maxBytes > 0 && request.maxBytes <= 4194304, 'Finite cloud read budgets required');
  return { schemaVersion: 1, operation: 'read-only-briefing-page', request, cursor, requestDigest: digest({ request, cursor }), rawEncoding: 'complete-serialized-tool-result-utf8', effectsAuthorized: false };
}
export async function acquireCapturedBriefingSource(manifest, { directory, policy, now }) {
  need(manifest?.schemaVersion === 1 && Array.isArray(manifest.captures) && manifest.captures.length <= 100, 'Bounded cloud result manifest required');
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  let index = 0;
  const result = await acquireBriefingPlanSource(manifest.request, {
    policy, now,
    async read(request) {
      const { cursor, ...original } = request;
      const expected = briefingCloudReadRequest(original, cursor);
      const capture = manifest.captures[index++];
      need(capture && same(capture.readRequest, expected), 'Cloud capture differs from exact requested page');
      need(typeof capture.path === 'string' && /^[a-f0-9]{64}$/.test(capture.sha256) && Number.isSafeInteger(capture.byteCount) && capture.byteCount > 0 && capture.byteCount <= 4194304, 'External raw file identity required');
      const raw = await boundedFile(capture.path, Math.min(capture.byteCount, request.maxBytes));
      need(raw.length === capture.byteCount && digest(raw) === capture.sha256, 'Complete original cloud tool bytes differ');
      return { raw, projection: capture.projection ?? null };
    },
    async retainRaw(bytes, metadata) {
      const sourceRef = join(root, `${digest(bytes)}.raw`);
      await immutable(sourceRef, bytes);
      const receipt = { ...metadata, sourceRef };
      await immutable(join(root, `${digest(receipt)}.receipt.json`), canonical(receipt));
      return receipt;
    },
    async readRaw(receipt) { const raw = await boundedFile(receipt.sourceRef, receipt.byteCount); need(raw.length === receipt.byteCount && digest(raw) === receipt.sha256, 'Retained raw readback differs'); return raw; },
    async completeAcquisition(acquisition) { await immutable(join(root, `${digest(acquisition)}.acquisition.json`), canonical(acquisition)); },
  });
  for (const field of ['window', 'resourceIds']) if (Object.hasOwn(manifest.request, field)) need(same(result.source[field], manifest.request[field]), 'Source inventory or window differs from requested scope');
  need(index === manifest.captures.length, 'Unconsumed cloud capture must not imply coverage');
  await immutable(join(root, `${digest(result)}.source.json`), canonical(result));
  return result;
}
export async function readBriefingExchangeFile(path) {
  return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(await boundedFile(path, 16777216)));
}
