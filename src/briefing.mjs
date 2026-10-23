import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { briefingGuidance } from './metadata.mjs';
import { canonical, digest } from './records.mjs';

const origin = 'https://api.github.com/repos/jerome-queck/emmy';
const maxBytes = 262144;
const maxAgeMs = 86400000;
const states = {
  status: ['complete', 'pending', 'unknown'],
  reminder: ['pending'],
  capability: ['working', 'authentication-required', 'denied', 'untested'],
  budget: ['notice', 'alert', 'spending-stopped']
};
const coverageKinds = { catalogListed: ['catalog'], chatsRead: ['chat'], repositoriesInspected: ['repository'], otherSourcesRead: ['native', 'user', 'budget'] };
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const shape = (value, name, required, optional = []) => {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  requireValue(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key)), `${name} has missing or unexpected fields`);
};
const text = (value, name) => requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= 1000 && !/[\r\n\x00-\x1f\x7f\u2028\u2029]/.test(value), `${name} must be one nonempty line, at most 1000 characters`);
const hash = (value, name, length = 64) => requireValue(typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value), `${name} must be a ${length === 40 ? 'Git object ID' : 'SHA-256 digest'}`);
const array = (value, name) => requireValue(Array.isArray(value) && value.length <= 128, `${name} must be an array with at most 128 items`);
const strings = (value, name) => { array(value, name); value.forEach(item => text(item, name)); requireValue(new Set(value).size === value.length, `${name} contains duplicates`); };
const choice = (value, choices, name) => requireValue(choices.includes(value), `Unknown ${name}`);
const time = (value, name) => requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'), `${name} must be a real UTC timestamp`);
const scope = (value, name) => {
  shape(value, name, ['subject', 'effect'], ['operation', 'executor', 'host', 'endpoint']);
  Object.values(value).forEach(item => text(item, name));
};
const sameScope = (left, right) => canonical(left) === canonical(right);
const md = value => value.replace(/[\\`*_{}\[\]()<>#+.!|~-]/g, '\\$&');
const scopeText = value => [value.subject, value.effect, ...['operation', 'executor', 'host', 'endpoint'].filter(key => value[key]).map(key => `${key} ${value[key]}`)].map(md).join(', ');
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

async function boundedFile(path) {
  const stat = await lstat(path);
  requireValue(stat.isFile() && stat.size <= maxBytes, 'Briefing input must be a regular file of at most 262144 bytes');
  const bytes = await readFile(path);
  requireValue(bytes.length <= maxBytes, 'Briefing input exceeds 262144 bytes');
  return bytes;
}

function parseBundle(bytes) {
  const bundle = JSON.parse(bytes.toString('utf8'));
  requireValue(bundle && typeof bundle === 'object' && !Array.isArray(bundle), 'Guidance bundle must be an object');
  if (bundle.schemaVersion !== briefingGuidance.schemaVersion || bundle.checkerVersion !== briefingGuidance.checkerVersion) {
    const error = new Error('Guidance requires an installed checker upgrade; downloaded code was not executed');
    error.upgradeRequired = true; throw error;
  }
  shape(bundle, 'Guidance bundle', ['schemaVersion', 'checkerVersion', 'documents', 'digest']);
  requireValue(JSON.stringify(bundle, null, 2) + '\n' === bytes.toString('utf8'), 'Guidance bundle must use the generated encoding without duplicate fields');
  array(bundle.documents, 'Guidance documents');
  requireValue(bundle.documents.length === briefingGuidance.paths.length, 'Guidance must contain exactly the approved documents');
  bundle.documents.forEach((document, index) => {
    shape(document, 'Guidance document', ['path', 'bytes', 'sha256', 'text']);
    requireValue(document.path === briefingGuidance.paths[index], 'Duplicate or unexpected guidance path');
    requireValue(typeof document.text === 'string' && document.text.length > 0, 'Missing readable guidance');
    hash(document.sha256, 'Guidance document digest');
    requireValue(document.bytes === Buffer.byteLength(document.text) && digest(document.text) === document.sha256, 'Guidance document byte/digest mismatch');
  });
  hash(bundle.digest, 'Guidance digest');
  requireValue(bundle.digest === digest(bundle.documents), 'Guidance content digest mismatch');
  return { digest: bundle.digest, text: bundle.documents.map(document => document.text).join('\n'), paths: bundle.documents.map(document => document.path) };
}

async function publish(base, files) {
  await mkdir(base, { recursive: true });
  const id = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  const pending = join(base, `.pending-${id}`); const destination = join(base, id);
  await mkdir(pending);
  try {
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(pending, name), bytes, { flag: 'wx' });
    await rename(pending, destination);
    return destination;
  } catch (error) { await rm(pending, { recursive: true, force: true }); throw error; }
}

async function acquireGuidance(home) {
  const signal = AbortSignal.timeout(10000);
  const request = async path => {
    const response = await fetch(`${origin}/${path}`, { signal, redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'emmy-briefing' } });
    requireValue(response.ok, `Canonical guidance request failed with HTTP ${response.status}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1048576) { await response.body.cancel().catch(() => {}); throw new Error('Guidance response exceeds 1048576 bytes'); }
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const commit = await request('commits/main');
  hash(commit.sha, 'Main commit', 40); hash(commit.commit?.tree?.sha, 'Main tree', 40);
  const sourceCheckedAt = new Date().toISOString();
  const tree = await request(`git/trees/${commit.commit.tree.sha}?recursive=1`);
  requireValue(tree.sha === commit.commit.tree.sha && tree.truncated === false && Array.isArray(tree.tree), 'Incomplete or mismatched pinned guidance tree');
  requireValue(new Set(tree.tree.map(entry => entry.path)).size === tree.tree.length, 'Duplicate pinned tree path');
  const entry = tree.tree.find(value => value.path === briefingGuidance.path);
  requireValue(entry?.type === 'blob' && entry.mode === '100644', 'Pinned main does not contain the approved guidance bundle');
  hash(entry.sha, 'Guidance blob', 40);
  const blob = await request(`git/blobs/${entry.sha}`);
  requireValue(blob.sha === entry.sha && blob.encoding === 'base64' && Number.isInteger(blob.size) && blob.size > 0 && blob.size <= maxBytes && typeof blob.content === 'string', 'Malformed pinned guidance blob');
  const encoded = blob.content.replaceAll('\n', '');
  requireValue(/^[A-Za-z0-9+/]*={0,2}$/.test(encoded), 'Malformed guidance base64');
  const bytes = Buffer.from(encoded, 'base64');
  requireValue(bytes.toString('base64') === encoded && bytes.length === blob.size && gitBlob(bytes) === entry.sha, 'Pinned guidance blob byte/identity mismatch');
  const parsed = parseBundle(bytes);
  const receipt = { schemaVersion: 1, commit: commit.sha, tree: tree.sha, blob: entry.sha, sourceCheckedAt, bundleSha256: digest(bytes), guidanceDigest: parsed.digest };
  const snapshot = await publish(join(home, 'briefing/guidance'), { 'bundle.json': bytes, 'receipt.json': `${JSON.stringify(receipt, null, 2)}\n` });
  return { state: 'current', ...parsed, ...receipt, snapshot };
}

async function refreshGuidance(home) {
  try { return await acquireGuidance(home); }
  catch (error) {
    const failure = { refreshError: error.message, upgradeRequired: Boolean(error.upgradeRequired) };
    let directories;
    try { directories = await readdir(join(home, 'briefing/guidance'), { withFileTypes: true }); }
    catch (readError) { if (readError.code === 'ENOENT') return { state: 'unavailable', ...failure }; throw readError; }
    const candidates = [];
    for (const directory of directories.filter(value => value.isDirectory() && !value.name.startsWith('.')).sort((a, b) => b.name.localeCompare(a.name))) {
      const snapshot = join(home, 'briefing/guidance', directory.name);
      try {
        const bytes = await boundedFile(join(snapshot, 'bundle.json')); const parsed = parseBundle(bytes);
        const receipt = JSON.parse((await boundedFile(join(snapshot, 'receipt.json'))).toString('utf8'));
        shape(receipt, 'Cached receipt', ['schemaVersion', 'commit', 'tree', 'blob', 'sourceCheckedAt', 'bundleSha256', 'guidanceDigest']);
        requireValue(receipt.schemaVersion === 1, 'Unknown cache schema');
        for (const key of ['commit', 'tree', 'blob']) hash(receipt[key], `Cached ${key}`, 40);
        time(receipt.sourceCheckedAt, 'Cached main-check time');
        requireValue(Date.parse(receipt.sourceCheckedAt) <= Date.now() && receipt.bundleSha256 === digest(bytes) && receipt.blob === gitBlob(bytes) && receipt.guidanceDigest === parsed.digest, 'Corrupt cached guidance');
        candidates.push({ state: 'cached', ...parsed, ...receipt, snapshot, ...failure });
      } catch {}
    }
    return candidates.sort((a, b) => b.sourceCheckedAt.localeCompare(a.sourceCheckedAt))[0] ?? { state: 'unavailable', ...failure };
  }
}

function parseDraft(bytes) {
  const draft = JSON.parse(bytes.toString('utf8'));
  shape(draft, 'Draft', ['schemaVersion', 'authoredUnder', 'sources', 'coverage', 'correctionReadback', 'entries']);
  requireValue(draft.schemaVersion === 1, 'Unknown draft schema'); hash(draft.authoredUnder, 'authoredUnder');
  array(draft.sources, 'Sources'); array(draft.entries, 'Entries'); array(draft.correctionReadback, 'Correction readback');
  const sourceIds = new Set();
  for (const source of draft.sources) {
    shape(source, 'Source', ['id', 'scope', 'reference', 'kind', 'retrievedAt', 'availability', 'coverage', 'claim', 'attribution'], ['contentAt', 'metadataAt']);
    text(source.id, 'Source ID'); requireValue(!sourceIds.has(source.id), 'Duplicate source ID'); sourceIds.add(source.id);
    scope(source.scope, 'Source scope'); text(source.reference, 'Source reference');
    choice(source.kind, Object.values(coverageKinds).flat(), 'source kind');
    choice(source.claim, Object.values(states).flat(), 'source claim'); choice(source.attribution, ['reported', 'attributed'], 'source attribution');
    choice(source.availability, ['available', 'unavailable', 'denied', 'unknown'], 'source availability');
    for (const key of ['retrievedAt', 'contentAt', 'metadataAt']) if (source[key] !== undefined) time(source[key], `Source ${key}`);
    shape(source.coverage, 'Source coverage', ['complete', 'gaps']); requireValue(typeof source.coverage.complete === 'boolean', 'Coverage complete must be boolean'); strings(source.coverage.gaps, 'Source coverage gaps');
    requireValue(!source.coverage.complete || !source.coverage.gaps.length, 'Complete source coverage cannot have gaps');
  }
  shape(draft.coverage, 'Coverage', ['selection', ...Object.keys(coverageKinds), 'gaps']); text(draft.coverage.selection, 'Coverage selection');
  for (const key of [...Object.keys(coverageKinds), 'gaps']) strings(draft.coverage[key], `Coverage ${key}`);
  const covered = Object.keys(coverageKinds).flatMap(key => draft.coverage[key]); requireValue(new Set(covered).size === covered.length, 'Duplicate coverage source');
  for (const readback of draft.correctionReadback) {
    shape(readback, 'Correction readback', ['scope', 'state'], ['reference', 'completionSourceId']); scope(readback.scope, 'Correction scope');
    choice(readback.state, ['reported-readback', 'conversation-only', 'unavailable'], 'correction readback state');
    if (readback.reference !== undefined) text(readback.reference, 'Correction readback reference');
    if (readback.completionSourceId !== undefined) text(readback.completionSourceId, 'Correction completion source');
    requireValue(readback.state !== 'reported-readback' || readback.reference !== undefined, 'Reported readback needs an opaque reference');
  }
  requireValue(new Set(draft.correctionReadback.map(value => canonical(value.scope))).size === draft.correctionReadback.length, 'Duplicate correction scope');
  for (const entry of draft.entries) {
    shape(entry, 'Entry', ['kind', 'scope', 'label', 'state', 'sourceIds']); choice(entry.kind, Object.keys(states), 'entry kind');
    scope(entry.scope, 'Entry scope'); text(entry.label, 'Entry label'); choice(entry.state, states[entry.kind], 'entry state'); strings(entry.sourceIds, 'Entry sources');
    if (entry.kind === 'capability') requireValue(['operation', 'executor', 'host', 'endpoint'].every(key => entry.scope[key] !== undefined), 'Capability needs operation, executor, host and endpoint');
  }
  return draft;
}

function support(source, draft, asOf) {
  const reasons = [];
  if (source.availability !== 'available') reasons.push(`source ${source.availability}`);
  if (!source.coverage.complete) reasons.push('partial source coverage');
  if (!Object.keys(coverageKinds).some(key => draft.coverage[key].includes(source.id))) reasons.push('source outside declared read coverage');
  if (source.kind === 'catalog') reasons.push('catalog listing does not inspect current work');
  if (!source.contentAt) reasons.push('content date unknown');
  else if (Date.parse(source.contentAt) > asOf) reasons.push('future content');
  else if (asOf - Date.parse(source.contentAt) > maxAgeMs) reasons.push('historical content');
  if (source.contentAt && Date.parse(source.contentAt) > Date.parse(source.retrievedAt)) reasons.push('content is newer than its retrieval');
  if (Date.parse(source.retrievedAt) > asOf || source.metadataAt && Date.parse(source.metadataAt) > asOf) reasons.push('future retrieval or metadata');
  if (source.metadataAt && (!source.contentAt || Date.parse(source.metadataAt) > Date.parse(source.contentAt))) reasons.push('newer metadata; latest content unverified');
  return reasons;
}

function inspectDraft(draft, guidance, asOf) {
  const findings = []; const sources = new Map(draft.sources.map(value => [value.id, value]));
  if (guidance.digest && draft.authoredUnder !== guidance.digest) findings.push('Read the returned guidance and revise authoredUnder before rendering.');
  for (const [key, kinds] of Object.entries(coverageKinds)) for (const id of draft.coverage[key]) {
    if (!sources.has(id) || !kinds.includes(sources.get(id).kind)) findings.push(`Coverage ${key} references an absent or differently typed source ${id}.`);
  }
  for (const entry of draft.entries) for (const id of entry.sourceIds) {
    const source = sources.get(id);
    if (!source || !sameScope(source.scope, entry.scope) || source.claim !== entry.state) findings.push(`Entry ${entry.label} needs matching scoped ${entry.state} support for ${id}.`);
  }
  for (const readback of draft.correctionReadback) if (readback.completionSourceId) {
    const source = sources.get(readback.completionSourceId);
    if (!source || source.kind !== 'user' || source.claim !== 'complete' || !sameScope(source.scope, readback.scope)) findings.push(`Correction for ${readback.scope.subject} needs its exact user completion source.`);
    else if (!draft.coverage.otherSourcesRead.includes(source.id)) findings.push(`Correction for ${readback.scope.subject} is outside declared read coverage.`);
  }
  if (findings.length) return { status: 'revise', findings };
  const degraded = guidance.state !== 'current' || draft.correctionReadback.some(value => value.state !== 'reported-readback') || draft.entries.some(entry => ['status', 'reminder'].includes(entry.kind) && !draft.correctionReadback.some(readback => sameScope(readback.scope, entry.scope)));
  const lines = ['# Briefing', '', degraded ? 'Degraded briefing. ' + (guidance.state === 'cached' ? `Current guidance refresh failed. Last successful main check ${guidance.sourceCheckedAt}. ` : guidance.state === 'unavailable' ? 'Current guidance is unavailable. ' : '') + (guidance.upgradeRequired ? 'Upgrade the installed checker before using the new guidance. ' : '') + 'Correction recovery and source limits follow.' : 'Checked against current guidance and declared inputs. Source claims and native readbacks remain reported.', '', '## Coverage', '', `Selection: ${md(draft.coverage.selection)}.`];
  const coverageNames = { catalogListed: 'Catalog entries listed', chatsRead: 'Chats read', repositoriesInspected: 'Repositories inspected', otherSourcesRead: 'Other sources read' };
  for (const [key, name] of Object.entries(coverageNames)) lines.push(`${name}: ${draft.coverage[key].map(id => md(sources.get(id).reference)).join('; ') || 'none'}.`);
  lines.push(`Gaps: ${draft.coverage.gaps.map(md).join('; ') || 'none declared within this selection'}.`, '', '## Updates', '');
  const usedSources = new Set();
  for (const entry of draft.entries) {
    const selected = entry.sourceIds.map(id => sources.get(id)); selected.forEach(source => usedSources.add(source.id));
    const readback = draft.correctionReadback.find(value => sameScope(value.scope, entry.scope));
    const completion = readback?.completionSourceId ? sources.get(readback.completionSourceId) : null;
    if (completion) usedSources.add(completion.id);
    const datedCompletion = completion?.availability === 'available' && completion.coverage.complete && completion.contentAt && Date.parse(completion.contentAt) <= Date.parse(completion.retrievedAt) && Date.parse(completion.retrievedAt) <= asOf && (!completion.metadataAt || Date.parse(completion.metadataAt) <= asOf) ? completion : null;
    const contrary = datedCompletion ? draft.sources.filter(source => sameScope(source.scope, entry.scope) && source.claim === 'pending' && source.attribution === 'attributed' && !support(source, draft, asOf).length && Date.parse(source.contentAt) > Date.parse(datedCompletion.contentAt)) : [];
    const olderReminder = datedCompletion && ['reminder', 'status'].includes(entry.kind) && entry.state === 'pending' && selected.length && selected.every(source => source.contentAt && Date.parse(source.contentAt) <= Date.parse(datedCompletion.contentAt));
    let status;
    if (datedCompletion && contrary.length && ['status', 'reminder'].includes(entry.kind)) {
      contrary.forEach(source => usedSources.add(source.id));
      status = `Conflict. User-reported complete (${md(datedCompletion.reference)}); later attributable pending report (${contrary.map(source => md(source.reference)).join('; ')}). Next check: read ${md(contrary[0].reference)} for this exact scope before another reminder.`;
    } else if (olderReminder) status = `Complete, reported by the user (${md(datedCompletion.reference)}). Older reminder suppressed. Provider completion unverified.`;
    else {
      const eligible = selected.filter(source => !support(source, draft, asOf).length);
      if (!eligible.length) status = `Current state unknown. ${selected.length ? `Declared ${entry.state} is qualified by ${[...new Set(selected.flatMap(source => support(source, draft, asOf)))].map(md).join('; ')}.` : 'No supporting source supplied.'}`;
      else if (entry.kind === 'budget') status = entry.state === 'spending-stopped' ? 'Spending stop reported by the declared source; enforcement unverified.' : `Current ${entry.state} reported. A notice or alert does not establish a spending stop.`;
      else status = `${entry.state === 'complete' ? 'Complete, reported by the declared source; provider completion unverified' : entry.state === 'authentication-required' ? 'Access blocked by authentication, reported' : entry.state === 'untested' ? 'Untested' : `${entry.state}, reported`}.`;
    }
    lines.push(`- ${scopeText(entry.scope)}. ${status} Unverified label: ${md(entry.label)}.`);
    if (['status', 'reminder'].includes(entry.kind) && (!readback || readback.state !== 'reported-readback')) lines.push(`  Correction recovery ${readback?.state ?? 'not declared'}; persistence unverified.`);
    else if (readback?.state === 'reported-readback') lines.push(`  Correction readback reported from ${md(readback.reference)}; native recovery unverified by this checker.`);
  }
  for (const readback of draft.correctionReadback.filter(value => value.state === 'unavailable')) lines.push(`- Correction recovery unavailable for ${scopeText(readback.scope)}. Persistence unverified.`);
  lines.push('', '## Source ages', '');
  for (const id of usedSources) {
    const source = sources.get(id);
    lines.push(`- ${md(source.reference)}. Content ${source.contentAt ?? 'unknown'}; retrieved ${source.retrievedAt}; metadata ${source.metadataAt ?? 'not supplied'}. Availability ${source.availability}; coverage ${source.coverage.complete ? 'complete' : 'partial'}. ${source.attribution === 'attributed' ? 'Attribution declared; assurance remains reported' : 'Reported assurance'}.`);
    if (source.coverage.gaps.length) lines.push(`  Coverage gaps: ${source.coverage.gaps.map(md).join('; ')}.`);
  }
  lines.push('', 'Advisory only. Current facts need source checks. Authority, reconciliation closure, schedules and execution remain with their existing owners.', '');
  return { status: degraded ? 'degraded' : 'checked', findings: [], body: lines.join('\n') };
}

export async function briefing(home, { file = null } = {}) {
  const input = file ? await boundedFile(file) : null;
  const draft = input ? parseDraft(input) : null;
  const guidance = await refreshGuidance(home);
  const checkedAt = new Date().toISOString();
  const result = draft ? { mode: 'draft', ...inspectDraft(draft, guidance, Date.parse(checkedAt)), guidance } : { mode: 'guidance', guidance };
  if (result.body !== undefined) result.bodyDigest = digest(result.body);
  const receipt = { schemaVersion: 1, mode: result.mode, status: result.status ?? guidance.state, checkedAt, guidanceState: guidance.state, guidanceDigest: guidance.digest ?? null, inputDigest: input ? digest(input) : null, bodyDigest: result.bodyDigest ?? null, findings: result.findings ?? [], assurance: 'advisory-reported-inputs', nativeInvocation: 'unverified' };
  const files = { 'receipt.json': `${JSON.stringify(receipt, null, 2)}\n`, 'guidance.json': `${JSON.stringify(guidance, null, 2)}\n`, ...(input ? { 'draft.json': input } : {}), ...(result.body !== undefined ? { 'body.md': result.body } : {}) };
  const directory = await publish(join(home, 'briefing/runs'), files);
  return { ...result, evidence: { directory, receipt: join(directory, 'receipt.json'), ...(result.body !== undefined ? { body: join(directory, 'body.md') } : {}) } };
}
