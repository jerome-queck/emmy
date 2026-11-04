import { createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { strictJson } from './strict-json.mjs';
import { ordinary, directory, publishSlot } from './immutable-slot.mjs';
import { executeBriefing } from './briefing-core.mjs';

const maximum = 1048576;
const contract = 'daily-briefing-v1';
const roles = ['gmail', 'outlook', 'calendar', 'tasks'];
const need = (ok, message) => { if (!ok) throw new Error(message); };
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => createHash('sha256').update(value).digest('hex');
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const oneLine = (value, bound) => typeof value === 'string' && value.trim().length > 0 && value.length <= bound && !/[\x00-\x1f\x7f\u2028\u2029]/.test(value);
const line = value => oneLine(value, 2000);
const list = (value, limit = 500) => Array.isArray(value) && value.length <= limit;
const unique = values => new Set(values).size === values.length;
const same = (left, right) => canonical(left) === canonical(right);
function shape(value, fields) { need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), `Expected exact members: ${fields.join(', ')}`); }
function lines(value) { need(list(value, 20) && value.every(line), 'Expected bounded single-line text list'); }
function ids(value) { need(list(value) && value.every(line) && unique(value), 'Expected unique bounded native IDs'); }
function reference(value) { shape(value, ['path', 'sha256']); need(isAbsolute(value.path ?? '') && /^[a-f0-9]{64}$/.test(value.sha256), 'Exact absolute byte reference required'); }
async function bytes(value, limit = maximum) { reference(value); const raw = await ordinary(value.path, limit); need(hash(raw) === value.sha256, 'Referenced source bytes changed'); return raw; }
function identity(value) {
  shape(value, ['day', 'provenance', 'scheduledFor']);
  need(/^\d{4}-\d\d-\d\d$/.test(value.day) && new Date(`${value.day}T00:00:00.000Z`).toISOString().startsWith(value.day), 'Valid Singapore day required');
  need(['manual', 'scheduled'].includes(value.provenance) && (value.provenance === 'manual' ? value.scheduledFor === null : stamp(value.scheduledFor)), 'Scheduled origin needs the supplied nominal time; manual origin has none');
  if (value.scheduledFor) need(dayAt(value.scheduledFor) === value.day, 'Nominal occurrence crosses Singapore day');
  return hash(canonical([contract, value]));
}
const dayAt = at => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
const pilotGates = policyDigest => [policyDigest ? 'Complete saved policy requires independent semantic comparison before migration.' : 'Complete saved owner policy missing.', 'Existing effect-owner and ChatGPT delivery migration not accepted.', 'Deployment and activation held for parent-observed pilot.'];
const human = value => value.replace(/[\\`*_{}\[\]<>#|!]/g, '\\$&');

export async function compileDailyBriefing(input, { now = new Date().toISOString() } = {}) {
  shape(input, ['schemaVersion', 'identity', 'asOf', 'policy', 'sources']);
  const slot = identity(input.identity);
  need(input.schemaVersion === 1 && stamp(input.asOf) && stamp(now) && Date.parse(input.asOf) <= Date.parse(now) && dayAt(input.asOf) === input.identity.day, 'Invalid version, future clock or Singapore day');
  need(input.identity.scheduledFor === null || Date.parse(input.identity.scheduledFor) <= Date.parse(input.asOf), 'Nominal time cannot follow assessment');
  need(list(input.sources, 4) && input.sources.length === 4 && unique(input.sources.map(row => row.role)), 'Exactly four distinct source roles required');
  const policyDigest = input.policy === null ? null : hash(await bytes(input.policy));
  const gaps = []; const sections = []; const sources = []; let total = 0;
  for (const role of roles) {
    const ref = input.sources.find(row => row.role === role); shape(ref, ['role', 'artifact']);
    const raw = await bytes(ref.artifact); total += Buffer.byteLength(raw); need(total <= 4194304, 'Total source bytes exceed bound');
    const source = strictJson(raw); const mail = ['gmail', 'outlook'].includes(role);
    shape(source, ['schemaVersion', 'role', 'account', 'surface', 'observedAt', 'capturedAt', 'complete', 'gaps', ...(mail ? ['inboxIds', 'items'] : ['window', 'containerIds', 'containers'])]);
    need(source.schemaVersion === 1 && source.role === role && line(source.account) && source.surface === (role === 'outlook' ? 'browser' : 'connector'), 'Source crosses required account adapter');
    need(stamp(source.observedAt) && stamp(source.capturedAt) && Date.parse(source.observedAt) <= Date.parse(source.capturedAt) && Date.parse(source.capturedAt) <= Date.parse(input.asOf), 'Original source and acquisition clocks required');
    need(typeof source.complete === 'boolean', 'Coverage declaration required'); lines(source.gaps);
    const ageMs = Date.parse(input.asOf) - Date.parse(source.observedAt);
    if (!source.complete || source.gaps.length) gaps.push(`${role}: incomplete source coverage`);
    if (ageMs > 300000) gaps.push(`${role}: stale original source`);
    gaps.push(...source.gaps.map(gap => `${role}: ${gap}`));
    sources.push({ role, account: source.account, surface: source.surface, sha256: ref.artifact.sha256, observedAt: source.observedAt, capturedAt: source.capturedAt, complete: source.complete, ageMs });
    const body = [];
    if (mail) {
      ids(source.inboxIds); need(list(source.items) && unique(source.items.map(item => item.nativeId)), 'Duplicate or unbounded mail review');
      for (const item of source.items) {
        shape(item, ['nativeId', 'threadId', 'sender', 'subject', 'unread', 'context', 'judgment']);
        need([item.nativeId, item.threadId, item.sender, item.subject].every(line) && typeof item.unread === 'boolean' && source.inboxIds.includes(item.nativeId), 'Review must bind known original Inbox ID and read state');
        shape(item.context, ['artifact', 'complete', 'unreadPreserved']);
        need(typeof item.context.complete === 'boolean' && typeof item.context.unreadPreserved === 'boolean', 'Full-context and unread-preserving declarations required');
        const context = await bytes(item.context.artifact, 262144); total += Buffer.byteLength(context); need(total <= 4194304, 'Total context bytes exceed bound');
        shape(item.judgment, ['action', 'reason', 'facts', 'flags']);
        need(['keep', 'archive', 'trash'].includes(item.judgment.action) && line(item.judgment.reason), 'Invalid structured proposed disposition'); lines(item.judgment.facts); lines(item.judgment.flags);
        const held = !item.context.complete || !item.context.unreadPreserved || item.judgment.flags.length > 0;
        if (held) gaps.push(`${role}: item ${source.items.indexOf(item) + 1} requires context or protected-item review`);
        body.push(`- ${human(item.sender)}: ${human(item.subject)}. ${held ? 'Keep; review held' : item.judgment.action === 'trash' ? 'Recoverable Trash proposed' : `${item.judgment.action === 'archive' ? 'Archive' : 'Keep'} proposed`}. ${human(item.judgment.reason)}. Original ${item.unread ? 'unread' : 'read'} state retained as a declaration.`, ...item.judgment.facts.map(fact => `  - ${human(fact)}`));
      }
      const missing = source.inboxIds.filter(id => !source.items.some(item => item.nativeId === id));
      if (missing.length) gaps.push(`${role}: ${missing.length} Inbox IDs lack full review`);
      if (!body.length) body.push(source.inboxIds.length ? 'Inbox review unavailable.' : 'Inbox declared empty.');
    } else {
      shape(source.window, ['start', 'end']);
      need(source.window.start === new Date(`${input.identity.day}T00:00:00+08:00`).toISOString() && source.window.end === new Date(Date.parse(source.window.start) + 86400000).toISOString(), 'Calendar and Tasks require the exact full Singapore day');
      ids(source.containerIds); need(list(source.containers, 64) && unique(source.containers.map(row => row.nativeId)), 'Invalid container review');
      for (const container of source.containers) {
        shape(container, ['nativeId', 'complete', 'entries']); need(line(container.nativeId) && source.containerIds.includes(container.nativeId) && typeof container.complete === 'boolean' && list(container.entries), 'Unknown or malformed calendar/Task list');
        if (!container.complete) gaps.push(`${role}: incomplete resource`);
        for (const entry of container.entries) { shape(entry, ['title', 'summary']); need(line(entry.title) && line(entry.summary), 'Invalid read-only day entry'); body.push(`- ${human(entry.title)}. ${human(entry.summary)}`); }
      }
      const missing = source.containerIds.filter(id => !source.containers.some(row => row.nativeId === id)); if (missing.length) gaps.push(`${role}: ${missing.length} resources not acquired`);
      if (!body.length) body.push('No entries declared for the full day.');
    }
    sections.push(`## ${{ gmail: 'Gmail', outlook: 'School Outlook', calendar: 'Calendar', tasks: 'Tasks' }[role]}\n\n${body.join('\n')}`);
  }
  need(sources[0].account !== sources[1].account, 'Primary Gmail and school Outlook accounts must differ');
  const gates = pilotGates(policyDigest);
  const coverage = gaps.length ? 'partial' : 'complete-declared';
  const body = `# Daily briefing ${input.identity.day}\n\nPilot artifact. Proposed dispositions only.\n\n${sections.join('\n\n')}\n\n## Evidence coverage\n\n${sources.map(source => `- ${source.role}: original ${source.observedAt}; acquired ${source.capturedAt}; ${source.complete ? 'declared complete' : 'partial'}.`).join('\n')}\n${gaps.map(gap => `- Gap: ${human(gap)}`).join('\n')}\n\n## Pilot hold\n\n${gates.map(gate => `- ${gate}`).join('\n')}\n`;
  const result = { schemaVersion: 1, contract, identity: input.identity, inputDigest: hash(canonical(input)), checkedAt: input.asOf, policyDigest, sources, coverage, gaps, body, bodyDigest: hash(body), execution: 'compiled-only', effectsAuthorized: false, delivery: 'unverified', gates };
  need(Buffer.byteLength(canonical(result)) <= maximum, 'Compiled briefing exceeds output bound');
  const retained = { ...result, artifactDigest: hash(canonical(result)) };
  artifact(canonical(retained), input.identity);
  return { slot, result: retained };
}
function artifact(raw, expectedIdentity) {
  const value = strictJson(raw); shape(value, ['schemaVersion', 'contract', 'identity', 'inputDigest', 'checkedAt', 'policyDigest', 'sources', 'coverage', 'gaps', 'body', 'bodyDigest', 'execution', 'effectsAuthorized', 'delivery', 'gates', 'artifactDigest']);
  const { artifactDigest, ...payload } = value; need(hash(canonical(payload)) === artifactDigest, 'Briefing metadata digest differs');
  need(value.schemaVersion === 1 && value.contract === contract && same(value.identity, expectedIdentity) && value.execution === 'compiled-only' && value.effectsAuthorized === false && value.delivery === 'unverified' && typeof value.body === 'string' && hash(value.body) === value.bodyDigest, 'Briefing artifact identity, body or effect claims differ');
  need(stamp(value.checkedAt) && dayAt(value.checkedAt) === value.identity.day && /^[a-f0-9]{64}$/.test(value.inputDigest) && (value.policyDigest === null || /^[a-f0-9]{64}$/.test(value.policyDigest)), 'Invalid retained assessment or policy binding');
  need(list(value.sources, 4) && value.sources.length === 4 && same(value.sources.map(source => source.role), roles), 'Retained source roles differ');
  for (const source of value.sources) {
    shape(source, ['role', 'account', 'surface', 'sha256', 'observedAt', 'capturedAt', 'complete', 'ageMs']);
    need(line(source.account) && source.surface === (source.role === 'outlook' ? 'browser' : 'connector') && /^[a-f0-9]{64}$/.test(source.sha256) && typeof source.complete === 'boolean', 'Invalid retained adapter or source binding');
    need(stamp(source.observedAt) && stamp(source.capturedAt) && Date.parse(source.observedAt) <= Date.parse(source.capturedAt) && Date.parse(source.capturedAt) <= Date.parse(value.checkedAt) && source.ageMs === Date.parse(value.checkedAt) - Date.parse(source.observedAt), 'Retained source clocks differ');
  }
  need(value.sources[0].account !== value.sources[1].account && list(value.gaps, 2048) && value.gaps.every(gap => oneLine(gap, 2010)) && ['partial', 'complete-declared'].includes(value.coverage) && value.coverage === (value.gaps.length ? 'partial' : 'complete-declared'), 'Invalid retained coverage accounting');
  need(value.coverage !== 'complete-declared' || value.sources.every(source => source.complete && source.ageMs <= 300000), 'Complete artifact contains incomplete or stale source');
  need(same(value.gates, pilotGates(value.policyDigest)), 'Retained migration holds differ');
  return value;
}
export async function dailyBriefing(request, { now = new Date().toISOString() } = {}) {
  if (['foundation', 'prepare', 'preview', 'reporting', 'policy', 'learning'].includes(request?.action)) {
    return executeBriefing(request, { now });
  }
  need(['compile', 'read'].includes(request?.action), 'Use compile or read');
  shape(request, request.action === 'compile' ? ['action', 'directory', 'input'] : ['action', 'directory', 'identity', 'maxAgeSeconds']);
  const selected = await directory(request.directory);
  if (request.action === 'compile') {
    const { slot, result } = await compileDailyBriefing(request.input, { now });
    const status = await publishSlot(selected, `${slot}.json`, `${canonical(result)}\n`, { maximum, validateConflict: async (path, identitySlot, original) => { need(identitySlot === slot, 'Conflict slot differs'); const other = artifact(await ordinary(path, maximum), result.identity); need(!same(other, artifact(original, result.identity)), 'Invalid equal conflict marker'); } });
    return { status, slot, path: join(selected, `${slot}.json`), bodyDigest: result.bodyDigest, coverage: result.coverage, effectsAuthorized: false, delivery: 'unverified', gates: result.gates };
  }
  need(stamp(now) && Number.isSafeInteger(request.maxAgeSeconds) && request.maxAgeSeconds >= 0 && request.maxAgeSeconds <= 86400, 'Invalid read clock or age bound');
  const slot = identity(request.identity); let result;
  try { result = artifact(await ordinary(join(selected, `${slot}.json`), maximum), request.identity); } catch (error) { if (error.code === 'ENOENT') return { status: 'missing', slot, effectsAuthorized: false, delivery: 'unverified' }; throw error; }
  let conflict = null;
  try { conflict = artifact(await ordinary(join(selected, `conflict-${slot}.json`), maximum), request.identity); need(!same(conflict, result), 'Invalid equal conflict marker'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const times = [result.checkedAt, ...result.sources.map(source => source.observedAt)];
  need(times.every(stamp), 'Invalid retained source clocks');
  const status = conflict ? 'conflict' : times.some(time => Date.parse(time) > Date.parse(now)) ? 'future' : times.some(time => Date.parse(now) - Date.parse(time) > request.maxAgeSeconds * 1000) ? 'stale' : result.coverage === 'partial' ? 'partial' : 'available';
  return { status, slot, result, conflict, effectsAuthorized: false, delivery: 'unverified', limits: ['Exact slot and conflict marker only; a concurrent later publication needs another read. Local declarations do not authenticate accounts, source completeness, policy, execution or delivery.'] };
}
export async function readDailyBriefingRequest(file) { return strictJson(await ordinary(file, maximum)); }
