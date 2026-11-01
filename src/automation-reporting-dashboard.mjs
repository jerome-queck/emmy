import { createServer } from 'node:http';
import { automationReporting } from './automation-reporting.mjs';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Automation reporting</title>
<style>
:root{font:16px system-ui,sans-serif;color:#172b3a;background:#edf2f6}*{box-sizing:border-box}body{margin:0}main{max-width:1280px;margin:auto;padding:32px}header{display:flex;align-items:start;justify-content:space-between;gap:20px}h1{margin:0;font-size:30px}h2{font-size:18px;margin:0}p{line-height:1.5;color:#506274}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#376b88;font-weight:700}.toolbar{display:flex;align-items:center;gap:16px;margin:24px 0}button{background:#174e6c;border:0;color:white;padding:11px 18px;border-radius:7px;font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #f0b64c;outline-offset:3px}#status{font-weight:650}#updated{font-size:13px}#error{color:#9b2b24;white-space:pre-wrap}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{background:white;border:1px solid #d3dfe8;border-radius:10px;padding:20px;min-width:0}.card-head{display:flex;justify-content:space-between;gap:12px}.record{border-top:1px solid #e1e8ee;padding:14px 0}.record h3{font-size:15px;margin:0 0 9px;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:13px;margin:8px 0}dt{color:#506274}dd{margin:0;overflow-wrap:anywhere}summary{cursor:pointer;color:#376b88;font-size:13px;margin-top:12px}.count{color:#506274;font-size:13px}.empty{color:#687b8a;font-size:14px}pre{font:12px/1.55 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;background:#f5f8fa;padding:12px;border-radius:6px}footer{margin-top:24px;font-size:13px;color:#506274}@media(max-width:700px){main{padding:20px}.grid{grid-template-columns:1fr}header{display:block}h1{font-size:26px}.toolbar{flex-wrap:wrap}}
</style><script src="/dashboard.js" defer></script></head><body><main>
<header><div><p class="eyebrow">Emmy / private reporting</p><h1>Automation reporting</h1><p>Recorded automation evidence, coverage and unresolved gaps.</p></div><p>Read-only · refreshes every 5 seconds</p></header>
<div class="toolbar"><button id="refresh" type="button">Refresh snapshot</button><span id="status" role="status" aria-live="polite">Loading snapshot</span><span id="updated"></span></div><p id="error" role="alert"></p><div class="grid" id="sections"></div>
<footer>Producer claims remain reported. References do not authenticate execution or delivery. This view performs no monitoring or provider actions.</footer></main></body></html>`;

const browserScript = `const sections = [
 ['Inventory', 'automations'], ['Automation observations', 'automationHealth'], ['Independent expectations', 'expectations'], ['Historical occurrence correlations', 'occurrences'], ['Runs', 'runs'],
 ['Conflicts and gaps', 'findings'], ['Coverage', 'inventoryCoverage'],
 ['Publication', 'publications'], ['Delivery', 'deliveries'], ['Issues', 'issues'], ['Store scan', 'scan']
];
const container = document.getElementById('sections');
let inFlight = false;
let controller = null;
let stopped = false;
let lastSuccess = null;
function freshness() {
 document.getElementById('updated').textContent = lastSuccess === null ? 'No successful read yet' : 'Last successful read ' + new Date(lastSuccess).toISOString() + ' (' + Math.max(0, Math.floor((Date.now() - lastSuccess) / 1000)) + 's ago)';
}
function fields(parent, values) {
 const list = document.createElement('dl');
 for (const [label, value] of values) {
  if (value === undefined) continue;
  const term = document.createElement('dt'); term.textContent = label;
  const description = document.createElement('dd'); description.textContent = value === null ? 'Unknown' : String(value);
  list.append(term, description);
 }
 parent.append(list);
}
function evidence(parent, value) {
 const details = document.createElement('details');
 const summary = document.createElement('summary'); summary.textContent = 'Recorded JSON evidence';
 const body = document.createElement('pre'); body.textContent = JSON.stringify(value, null, 2);
 details.append(summary, body); parent.append(details);
}
function recordCard(parent, record) {
 const row = document.createElement('article'); row.className = 'record';
 const name = document.createElement('h3'); name.textContent = record.data.name || record.data.title || record.key;
 row.append(name);
 const values = [['Automation', record.automationId], ['Namespace', record.namespace]];
 if (record.kind === 'automation') values.push(['Enabled', record.data.enabled], ['Schedule', record.data.schedule], ['Environment', record.data.environment], ['Observations', record.observationState ?? 'unknown']);
 if (record.kind === 'occurrence') values.push(['Occurrence', record.state], ['Scheduled for', record.data.scheduledFor], ['Execution', record.execution]);
 if (record.kind === 'expectation') values.push(['Producer', record.data.targetAutomationId], ['Producer namespace', record.data.targetNamespace], ['Observation', record.state], ['Scheduled for', record.data.scheduledFor], ['Observation grace ends', record.data.observationDueAt], ['Configuration', record.applicability], ['Execution', record.execution]);
 if (record.kind === 'run') values.push(['Execution', record.execution], ['Coverage', record.evidenceCoverage], ['Report', record.reportAvailability], ['Publication', record.publication], ['Delivery', record.userDelivery]);
 if (record.kind === 'publication' || record.kind === 'delivery') values.push(['State', record.state], ['Subject', record.data.subject]);
 if (record.kind === 'issue') values.push(['State', record.data.state]);
 if (record.conflict) values.push(['Conflict', 'Unresolved']);
 if (record.stale) values.push(['Freshness', 'Stale']);
 fields(row, values);
 if (record.data.report?.summary) { const summary = document.createElement('p'); summary.textContent = record.data.report.summary; row.append(summary); }
 evidence(row, record); parent.append(row);
}
function render(snapshot) {
 container.replaceChildren();
 for (const [title, key] of sections) {
  const card = document.createElement('section'); card.className = 'card';
  const heading = document.createElement('div'); heading.className = 'card-head';
  const name = document.createElement('h2'); name.textContent = title; heading.append(name);
  const value = snapshot[key];
  if (Array.isArray(value)) { const count = document.createElement('span'); count.className = 'count'; count.textContent = String(snapshot.counts?.[key] ?? (key === 'findings' ? snapshot.findingPage?.total : undefined) ?? value.length); heading.append(count); }
  card.append(heading);
  if (value == null || (Array.isArray(value) && !value.length)) {
   const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No records in this snapshot.'; card.append(empty);
  } else if (Array.isArray(value)) {
   for (const item of value.slice(0, 50)) {
    if (item && typeof item === 'object' && item.data) recordCard(card, item);
    else { const finding = document.createElement('p'); finding.textContent = String(item); card.append(finding); }
   }
   const page = key === 'findings' ? snapshot.findingPage : snapshot.pagination?.[key];
   if (page) {
    const more = document.createElement('p'); more.className = 'empty';
    more.textContent = 'Showing ' + Math.min(value.length, 50) + ' of ' + page.total + (page.nextCursor ? '. More records available. CLI next cursor: ' + page.nextCursor : '.');
    card.append(more);
   }
  } else {
   fields(card, key === 'automationHealth'
    ? [['Scope', value.scope], ...Object.entries(value.observations), ['Latest selection', value.latestSelection]]
    : Object.entries(value));
   evidence(card, value);
  }
  container.append(card);
 }
}
async function refresh() {
 if (inFlight || stopped) return;
 inFlight = true;
 controller = new AbortController();
 const timeout = setTimeout(() => controller?.abort(), 4000);
 const button = document.getElementById('refresh'); button.disabled = true;
 document.getElementById('error').textContent = '';
 try {
  const response = await fetch('/api', {cache: 'no-store', signal: controller.signal});
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Snapshot unavailable');
  if (stopped) return;
  render(result.data);
  document.getElementById('status').textContent = result.data.status === 'ready' ? 'Store valid · recorded outcomes only' : 'Needs attention';
  lastSuccess = Date.now();
 } catch(error) {
  if (stopped) return;
  container.replaceChildren();
  document.getElementById('status').textContent = 'Snapshot unavailable';
  document.getElementById('error').textContent = error.name === 'AbortError' ? 'Read timed out. Retrying automatically.' : error.message;
 } finally { clearTimeout(timeout); controller = null; inFlight = false; button.disabled = false; freshness(); }
}
document.getElementById('refresh').addEventListener('click', refresh);
const polling = setInterval(refresh, 5000);
const freshnessClock = setInterval(freshness, 1000);
window.addEventListener('pagehide', () => { stopped = true; clearInterval(polling); clearInterval(freshnessClock); controller?.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
freshness();
refresh();`;

export async function startDashboard({ directory, port = 0, controlAuthority = null }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid dashboard port');
  await automationReporting({ action: 'inspect', directory, controlAuthority });
  const server = createServer(async (request, response) => {
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    const send = (status, type, body) => { response.writeHead(status, { ...headers, 'Content-Type': type }); response.end(body); };
    if (request.headers.host !== `127.0.0.1:${server.address().port}`) return send(403, 'application/json', JSON.stringify({ ok: false, error: 'Loopback host required' }));
    if (request.method !== 'GET') return send(405, 'application/json', JSON.stringify({ ok: false, error: 'Read-only GET endpoint' }));
    if (request.url === '/') return send(200, 'text/html; charset=utf-8', page);
    if (request.url === '/dashboard.js') return send(200, 'text/javascript; charset=utf-8', browserScript);
    if (request.url !== '/api') return send(404, 'application/json', JSON.stringify({ ok: false, error: 'Not found' }));
    try {
      const data = await automationReporting({ action: 'inspect', directory, controlAuthority });
      send(200, 'application/json', JSON.stringify({ ok: true, data }));
    } catch (error) { send(500, 'application/json', JSON.stringify({ ok: false, error: error.message })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, address: `http://127.0.0.1:${server.address().port}` };
}
