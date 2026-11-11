#!/usr/bin/env node
import { lstat, readdir, readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, digest } from '../src/content.mjs';

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const safe = path => {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe relative path');
  return path;
};
async function ordinary(root, path) {
  safe(path);
  for (const part of ['', ...path.split('/')]) {
    root = part ? join(root, part) : root;
    const stat = await lstat(root);
    if (stat.isSymbolicLink()) throw new Error('Symlink refused');
  }
  const stat = await lstat(root);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Expected bounded ordinary file');
  const bytes = await readFile(root);
  if (bytes.length !== stat.size) throw new Error('Incomplete read');
  return bytes;
}
async function discover(root, path = 'skills') {
  const stat = await lstat(join(root, path));
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Incomplete discovery');
  const found = [];
  for (const entry of (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${path}/${entry.name}`;
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error('Unsupported discovery entry');
    if (entry.isDirectory()) found.push(...await discover(root, child));
    else found.push(child);
  }
  return found;
}
function policyCheck(policy) {
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.sources) || !policy.sources.length) throw new Error('Invalid allowlist');
  const ids = new Set();
  for (const source of policy.sources) {
    if (!/^[a-z0-9-]+$/.test(source.id) || ids.has(source.id)) throw new Error('Invalid source identity');
    ids.add(source.id);
    if (source.license !== 'MIT' || !source.origin.startsWith('https://github.com/') || !source.version || !source.files?.length || !source.skills?.length || !source.notices?.length) throw new Error('Unapproved source');
    const paths = new Set();
    for (const file of source.files) {
      safe(file.path);
      if (paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid approved file');
      paths.add(file.path);
    }
    for (const path of [...source.notices, ...source.skills.flatMap(skill => [skill.path, ...skill.dependencies])]) if (!paths.has(safe(path))) throw new Error('Missing approved dependency or notice');
  }
}
async function candidate(root, policy, bindings) {
  policyCheck(policy);
  const files = [];
  const sources = [];
  for (const source of policy.sources) {
    const base = bindings[source.id];
    if (typeof base !== 'string') throw new Error(`Missing binding: ${source.id}`);
    if ((await lstat(base)).isSymbolicLink()) throw new Error('Symlink root refused');
    const metadata = JSON.parse(await ordinary(base, source.metadata));
    if (metadata.name !== source.package || metadata.version !== source.version || metadata.license !== source.license || metadata.repository !== source.origin) throw new Error(`Source identity/version/licence changed: ${source.id}`);
    if (source.revisionEvidence) {
      const evidence = JSON.parse(await ordinary(base, source.revisionEvidence));
      if (evidence.revision !== source.revision || evidence.source !== `${source.origin}.git`) throw new Error(`Source revision changed: ${source.id}`);
    }
    const tree = await discover(base);
    const discovered = tree.filter(path => path.endsWith('/SKILL.md'));
    const isNotice = path => /^(LICENSE|LICENCE|NOTICE|COPYING)([.-].*)?$/i.test(posix.basename(path));
    const notices = [...tree.filter(isNotice), ...(await readdir(base)).filter(isNotice)].sort();
    if (canonical(notices) !== canonical([...source.notices].sort())) throw new Error(`Licence inventory changed: ${source.id}`);
    for (const skill of source.skills) if (!discovered.includes(skill.path)) throw new Error(`Approved skill deleted: ${source.id}/${skill.path}`);
    const approved = new Set(source.files.map(file => file.path));
    for (const skill of source.skills) {
      const directory = `${posix.dirname(skill.path)}/`;
      if (tree.some(path => path.startsWith(directory) && !approved.has(path))) throw new Error(`Unreviewed closure file: ${source.id}`);
    }
    for (const file of source.files) {
      const bytes = await ordinary(base, file.path);
      if (digest(bytes) !== file.sha256) throw new Error(`Unreviewed bytes or licence: ${source.id}/${file.path}`);
      if (file.path.endsWith('.md')) {
        for (const match of bytes.toString('utf8').matchAll(/\]\(([^)]+)\)/g)) {
          const link = match[1].split(/[?#]/)[0];
          if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
          const target = posix.normalize(posix.join(posix.dirname(file.path), decodeURIComponent(link)));
          if (!approved.has(target)) throw new Error(`Undeclared dependency: ${source.id}/${target}`);
        }
      }
      files.push({ path: `${source.id}/${file.path}`, sha256: digest(bytes), bytes: bytes.length, content: bytes.toString('base64') });
    }
    sources.push({ ...source, discovered, registration: 'unverified' });
  }
  const body = { schemaVersion: 1, policySha256: digest(policy), sources, files: files.map(({ content, ...file }) => file) };
  return { ...body, snapshot: digest(body), content: files };
}
export async function checkInventory(root) {
  const index = JSON.parse(await ordinary(root, 'registry/skills.json'));
  const { snapshot, observedAt, ...body } = index;
  if (!/^[a-f0-9]{64}$/.test(snapshot) || digest(body) !== snapshot || !Number.isFinite(Date.parse(observedAt))) throw new Error('Invalid snapshot index');
  const policy = JSON.parse(await ordinary(root, 'registry/skill-sources.json'));
  policyCheck(policy);
  if (digest(policy) !== index.policySha256) throw new Error('Snapshot differs from reviewed allowlist');
  const expectedFiles = policy.sources.flatMap(source => source.files.map(file => ({ path: `${source.id}/${file.path}`, sha256: file.sha256 })));
  if (canonical(index.files.map(({ path, sha256 }) => ({ path, sha256 }))) !== canonical(expectedFiles)) throw new Error('Snapshot file closure differs from policy');
  if (index.sources.length !== policy.sources.length || index.sources.some((source, i) => {
    const { discovered, registration, ...approved } = source;
    return canonical(approved) !== canonical(policy.sources[i]) || registration !== 'unverified' || !Array.isArray(discovered) || policy.sources[i].skills.some(skill => !discovered.includes(skill.path));
  })) throw new Error('Snapshot source identity differs from policy');
  for (const file of index.files) {
    const bytes = await ordinary(root, `vendor/skills/${snapshot}/${safe(file.path)}`);
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`Corrupt copied file: ${file.path}`);
  }
  return { status: 'complete', snapshot, observedAt, sources: index.sources.length, skills: index.sources.reduce((n, source) => n + source.skills.length, 0), registration: 'unverified' };
}
export async function refreshInventory(root, bindings) {
  const home = join(root, '.local/skill-inventory');
  await mkdir(home, { recursive: true });
  const lock = join(home, 'writer.lock');
  await mkdir(lock);
  const attempt = join(home, 'last-attempt.json');
  const startedAt = new Date().toISOString();
  let stage;
  let selectedSnapshot = null;
  try {
    await writeFile(attempt, json({ status: 'pending', startedAt }));
    const policy = JSON.parse(await ordinary(root, 'registry/skill-sources.json'));
    const built = await candidate(root, policy, bindings);
    const second = await candidate(root, policy, bindings);
    if (canonical(built) !== canonical(second)) throw new Error('Source changed during collection');
    const { content, ...index } = built;
    const target = join(root, 'vendor/skills', index.snapshot);
    stage = join(root, 'vendor/skills', `.staging-${process.pid}`);
    await mkdir(stage, { recursive: true });
    for (const file of content) {
      const path = join(stage, file.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from(file.content, 'base64'), { flag: 'wx' });
    }
    try { await rename(stage, target); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      for (const file of content) if (digest(await ordinary(target, file.path)) !== file.sha256) throw new Error('Existing snapshot corrupt');
    }
    for (const file of content) if (digest(await ordinary(target, file.path)) !== file.sha256) throw new Error('Staged snapshot readback mismatch');
    let prior;
    try { prior = JSON.parse(await ordinary(root, 'registry/skills.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    index.observedAt = prior?.snapshot === index.snapshot ? prior.observedAt : startedAt;
    if (digest(JSON.parse(await ordinary(root, 'registry/skill-sources.json'))) !== index.policySha256) throw new Error('Allowlist changed during refresh');
    const temporaryIndex = join(root, 'registry', `.skills-${process.pid}.json`);
    await writeFile(temporaryIndex, json(index), { flag: 'wx' });
    await rename(temporaryIndex, join(root, 'registry/skills.json'));
    selectedSnapshot = index.snapshot;
    const result = await checkInventory(root);
    await writeFile(attempt, json({ status: 'complete', startedAt, checkedAt: new Date().toISOString(), snapshot: index.snapshot }));
    return result;
  } catch (error) {
    error.selectedSnapshot = selectedSnapshot;
    await writeFile(attempt, json({ status: 'failed', startedAt, selectedSnapshot, error: error.message }));
    throw error;
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true });
    await rm(lock, { recursive: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...args] = process.argv.slice(2);
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    let result;
    if (action === 'check' && !args.length) result = await checkInventory(root);
    else if (action === 'refresh' && args.length === 1) result = await refreshInventory(root, JSON.parse(await readFile(args[0], 'utf8')));
    else throw new Error('Use check or refresh <private-bindings.json>');
    console.log(json(result).trim());
  } catch (error) { console.error(json({ status: 'failed', selectedSnapshot: error.selectedSnapshot ?? null, error: error.message }).trim()); process.exitCode = 2; }
}
