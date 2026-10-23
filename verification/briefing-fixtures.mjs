export const briefingTransport = `import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
const fixture = JSON.parse(fs.readFileSync(process.env.EMMY_VERIFY_BRIEFING_FIXTURE, 'utf8'));
const origin = 'https://api.github.com/repos/jerome-queck/emmy/';
let mainReads = 0;
let transientFailed = false;
const attempts = {};
globalThis.fetch = async (url, options) => {
  fs.appendFileSync(fixture.requests, JSON.stringify({ url, redirect: options.redirect, headers: options.headers }) + '\\n');
  if (!url.startsWith(origin) || options.redirect !== 'error') throw new Error('Unexpected transport or redirect');
  const path = url.slice(origin.length);
  const stage = path === 'commits/main' ? 'main' : path.startsWith('git/trees/') ? 'tree' : 'blob';
  attempts[stage] = (attempts[stage] || 0) + 1;
  const fault = fixture.faults?.find(value => value.stage === stage && value.attempt === attempts[stage]);
  if (fault) {
    if (fault.delayMs) await new Promise(resolve => setTimeout(resolve, fault.delayMs));
    const error = Object.assign(new TypeError('private transport detail must not survive'), { name: fault.errorName || 'TypeError' });
    if (fault.code) error.cause = Object.assign(new Error('private cause detail must not survive'), { code: fault.code });
    if (fault.kind === 'transport') throw error;
    if (fault.kind === 'body') return new Response(new ReadableStream({ start(controller) { controller.error(error); } }));
    if (fault.kind === 'http') return new Response('private remote response must not survive', { status: fault.status, headers: fault.retryAfter === undefined ? {} : { 'Retry-After': fault.retryAfter } });
    if (fault.kind === 'json') return new Response('private invalid JSON must not survive');
  }
  if (fixture.transient && path === 'commits/main' && !transientFailed) {
    transientFailed = true;
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('Temporary DNS lookup failure'), { code: 'EAI_AGAIN' }) });
  }
  if (fixture.unavailable) return new Response('unavailable', { status: 503 });
  if (fixture.timeout && (!fixture.timeoutStage || fixture.timeoutStage === stage)) return new Promise((resolve, reject) => {
    const keepAlive = setInterval(() => {}, 1000);
    options.signal.addEventListener('abort', () => { clearInterval(keepAlive); reject(options.signal.reason); }, { once: true });
  });
  if (fixture.oversized) return new Response(' '.repeat(1048577));
  if (path === 'commits/main') {
    mainReads++;
    return Response.json({ sha: mainReads > 1 && fixture.advance ? 'b'.repeat(40) : fixture.commit, commit: { tree: { sha: mainReads > 1 && fixture.advance ? 'c'.repeat(40) : fixture.tree } } });
  }
  if (path === 'git/trees/' + fixture.tree + '?recursive=1') {
    const entry = { path: 'docs/briefing-guidance.json', mode: '100644', type: 'blob', sha: fixture.blob };
    return Response.json({ sha: fixture.tree, truncated: false, tree: fixture.duplicatePath ? [entry, entry] : fixture.missing ? [] : [entry] });
  }
  if (path === 'git/blobs/' + fixture.blob) {
    const bytes = Buffer.from(fixture.bytes, 'base64');
    if (fixture.corruptBytes) bytes[0] ^= 1;
    return Response.json({ sha: fixture.blob, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') });
  }
  throw new Error('Request escaped its original pin: ' + path);
};
if (fixture.interrupt || fixture.publicationFailure) {
  const promises = createRequire(import.meta.url)('node:fs/promises');
  const rename = promises.rename;
  promises.rename = async (source, destination) => {
    if (destination.includes('/briefing/guidance/')) {
      if (fixture.publicationFailure) throw Object.assign(new Error('private publication detail must not survive'), { code: 'ENOSPC' });
      fs.writeFileSync(fixture.interrupt, JSON.stringify({ source, destination, pid: process.pid }) + '\\n');
      process.kill(process.pid, 'SIGSTOP');
    }
    return rename(source, destination);
  };
  syncBuiltinESMExports();
}
`;
