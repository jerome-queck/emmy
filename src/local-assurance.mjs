import { spawnSync, execFileSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, digest } from './content.mjs';
import { boundedFile, strictJson } from './bounded-json.mjs';
import { assurancePlan, assurancePlanDigest, assuranceTransition, beginAssurance } from './assurance.mjs';

const hash = value => digest(canonical(value));
const need = (condition, message) => { if (!condition) throw new Error(message); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (root, ref) => git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);

async function fileIdentity(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return { type: 'symlink', target: await readlink(path) };
  need(info.isFile(), `Expected ordinary file ${path}`);
  const bytes = await readFile(path);
  return { type: 'file', executable: Boolean(info.mode & 0o111), bytes: bytes.length, sha256: digest(bytes) };
}

async function dependencyIdentity(root) {
  const path = join(root, 'node_modules');
  let directory;
  try { directory = await realpath(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const files = [];
  const visit = async (at, prefix = '') => {
    for (const name of (await readdir(at)).sort()) {
      const relative = `${prefix}${name}`;
      const info = await lstat(join(at, name));
      if (info.isDirectory()) await visit(join(at, name), `${relative}/`);
      else {
        if (info.isSymbolicLink()) need((await realpath(join(at, name))).startsWith(`${directory}${sep}`), 'External dependency links are unsupported');
        files.push({ path: relative, ...await fileIdentity(join(at, name)) });
      }
    }
  };
  await visit(directory);
  return { directory, files };
}

async function toolIdentity(path, args) {
  const resolved = await realpath(path);
  const result = spawnSync(resolved, args, { encoding: 'utf8', timeout: 10_000 });
  need(result.status === 0 && !result.signal && !result.error, `Cannot observe tool ${resolved}`);
  return { path: resolved, ...await fileIdentity(resolved), version: `${result.stdout}${result.stderr}`.trim() };
}

async function formalTools(root) {
  const coverage = JSON.parse(await readFile(join(root, 'verification/publication/coverage.json'), 'utf8'));
  const candidates = [process.env.EMMY_JAVA_BIN, process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin/java'), process.env.JAVA_HOME_21_X64 && join(process.env.JAVA_HOME_21_X64, 'bin/java')].filter(Boolean);
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['java'], { encoding: 'utf8' });
  if (found.status === 0) candidates.push(found.stdout.trim().split('\n')[0]);
  if (process.platform === 'darwin' && !process.env.EMMY_JAVA_BIN) {
    const home = spawnSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' });
    if (home.status === 0) candidates.push(join(home.stdout.trim(), 'bin/java'));
    const brew = spawnSync('brew', ['--prefix', 'openjdk@21'], { encoding: 'utf8' });
    if (brew.status === 0) candidates.push(join(brew.stdout.trim(), 'bin/java'));
  }
  let java;
  for (const path of candidates) {
    try { const tool = await toolIdentity(path, ['-version']); if (/version "21\./.test(tool.version)) { java = tool; break; } }
    catch {}
    if (process.env.EMMY_JAVA_BIN) break;
  }
  need(java, 'Existing Java 21 required; no tool installation is performed');
  const jarPath = await realpath(resolve(process.env.EMMY_TLC_JAR ?? join(root, '.local/tools', coverage.tool.filename)));
  const jar = await fileIdentity(jarPath);
  need(jar.sha256 === coverage.tool.sha256, 'Existing TLC jar differs from pinned release; no download is performed');
  return { java, tlc: { path: jarPath, ...jar } };
}

export async function observeAssurance(root, baseRef = 'HEAD') {
  root = await realpath(root);
  need(await realpath(git(root, ['rev-parse', '--show-toplevel'])) === root, 'Assurance root must be the repository root');
  need(typeof baseRef === 'string' && baseRef.length > 0 && baseRef.length <= 1024, 'Explicit valid base reference required');
  const paths = [...new Set(execFileSync('git', ['-C', root, 'ls-files', '-c', '-o', '--exclude-standard', '-z'], { maxBuffer: 32 * 1024 * 1024 }).toString().split('\0').filter(Boolean))].sort();
  const files = [];
  for (const path of paths) {
    if (path === 'node_modules') continue;
    need(!path.split('/').includes('..') && !path.startsWith('/'), 'Unsafe source path');
    try {
      const identity = await fileIdentity(join(root, path));
      need(identity.type === 'file', 'Source symlinks require separate closure evidence');
      files.push({ path, ...identity });
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; files.push({ path, type: 'missing' }); }
  }
  const head = commit(root, 'HEAD'); const base = commit(root, baseRef);
  const context = { schemaVersion: 1, source: { root, head, baseRef, base, mergeBase: git(root, ['merge-base', head, base]), files }, planDigest: assurancePlanDigest, host: { hostname: hostname(), platform: process.platform, arch: process.arch }, node: await toolIdentity(process.execPath, ['--version']), dependencies: await dependencyIdentity(root), formal: await formalTools(root), environment: Object.fromEntries(['NODE_OPTIONS', 'NODE_PATH', 'TZ', 'LANG', 'LC_ALL', 'EMMY_JAVA_BIN', 'EMMY_TLC_JAR', 'JAVA_HOME', 'JAVA_HOME_21_X64'].map(key => [key, process.env[key] ?? null])) };
  return { context, contextDigest: hash(context) };
}

async function artifact(directory, name) {
  need(typeof name === 'string' && /^[a-z0-9-]+\.(stdout|stderr)$/.test(name), 'Unsafe assurance artifact name');
  const path = join(directory, name);
  need((await lstat(path)).isFile(), 'Assurance output must be an ordinary file');
  return { file: name, ...await fileIdentity(path) };
}

export async function runAssurance(root, { baseRef = 'HEAD' } = {}) {
  root = await realpath(root);
  const directory = join(root, '.local/local-assurance', randomUUID());
  await mkdir(directory, { recursive: true });
  const events = []; const startedAt = new Date().toISOString();
  try {
    const initial = await observeAssurance(root, baseRef);
    await writeFile(join(directory, 'initial.json'), `${canonical(initial)}\n`, { flag: 'wx' });
    let state = beginAssurance(initial.contextDigest);
    for (const suite of assurancePlan) {
      const before = await observeAssurance(root, baseRef);
      await writeFile(join(directory, `${suite.id}-before.json`), `${canonical(before)}\n`, { flag: 'wx' });
      const start = { kind: 'start', id: suite.id, contextDigest: before.contextDigest };
      events.push(start); state = assuranceTransition(state, start);
      if (state.phase !== 'running') break;
      process.stdout.write(`Checking ${suite.id}\n`);
      const stdout = `${suite.id}.stdout`; const stderr = `${suite.id}.stderr`;
      const out = openSync(join(directory, stdout), 'wx'); const err = openSync(join(directory, stderr), 'wx');
      let result;
      try { result = spawnSync(process.execPath, suite.args, { cwd: root, stdio: ['ignore', out, err], timeout: 1_200_000 }); }
      finally { closeSync(out); closeSync(err); }
      const after = await observeAssurance(root, baseRef);
      await writeFile(join(directory, `${suite.id}-after.json`), `${canonical(after)}\n`, { flag: 'wx' });
      const finish = { kind: 'finish', id: suite.id, contextDigest: after.contextDigest, code: result.status, signal: result.signal, error: result.error?.code ?? null, stdout: await artifact(directory, stdout), stderr: await artifact(directory, stderr) };
      events.push(finish); state = assuranceTransition(state, { ...finish, evidenceValid: true });
      if (state.phase === 'refused') break;
    }
    const final = await observeAssurance(root, baseRef);
    await writeFile(join(directory, 'final.json'), `${canonical(final)}\n`, { flag: 'wx' });
    events.push({ kind: 'inspect', contextDigest: final.contextDigest });
    state = assuranceTransition(state, events.at(-1));
    const receipt = { schemaVersion: 1, kind: 'local-assurance-run', startedAt, finishedAt: new Date().toISOString(), plan: assurancePlan, initial, events };
    const bytes = `${canonical(receipt)}\n`; const receiptFile = join(directory, 'receipt.json');
    await writeFile(receiptFile, bytes, { flag: 'wx' });
    return { status: state.phase === 'passed' ? 'passed-local' : 'refused', state, receiptFile, receiptDigest: digest(bytes), assurance: 'observed-local-check-processes', limits: limits() };
  } catch (error) {
    await writeFile(join(directory, 'failure.json'), `${canonical({ startedAt, events, error: error.message })}\n`, { flag: 'wx' });
    return { status: 'refused', reason: error.message, evidence: directory, limits: limits() };
  }
}

const limits = () => ['Local cooperative source/base/environment checks are not atomic filesystem pinning or hostile-code attestation.', 'Hashes bind bytes; supplied receipts cannot authenticate authorship, independent review or native host identity.', 'No merge/protection change, provider effect, installation, other-machine access or future execution is established.'];

export async function assessAssurance(root, request) {
  need(request && Object.keys(request).sort().join(',') === 'receiptDigest,receiptFile' && typeof request.receiptFile === 'string' && sha(request.receiptDigest), 'Select one exact assurance receipt and SHA-256');
  const path = resolve(request.receiptFile); const directory = dirname(path);
  need((await lstat(path)).isFile(), 'Assurance receipt must be an ordinary file');
  const bytes = await boundedFile(path, 16 * 1024 * 1024);
  need(digest(bytes) === request.receiptDigest, 'Assurance receipt digest mismatch');
  const receipt = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  need(receipt.schemaVersion === 1 && receipt.kind === 'local-assurance-run' && Array.isArray(receipt.events) && receipt.events.length <= assurancePlan.length * 2 + 1 && sha(receipt.initial?.contextDigest) && hash(receipt.initial.context) === receipt.initial.contextDigest, 'Invalid assurance receipt');
  need(receipt.initial.context.planDigest === assurancePlanDigest, 'Assurance check plan changed');
  need(canonical(receipt.plan) === canonical(assurancePlan), 'Exact original suite arguments required');
  let state = beginAssurance(receipt.initial.contextDigest);
  const findings = [];
  const before = await observeAssurance(root, receipt.initial.context.source.baseRef);
  for (const event of receipt.events) {
    need(event && typeof event === 'object', 'Invalid assurance event');
    let evidenceValid = false;
    if (event.kind === 'finish') {
      const suite = assurancePlan.find(row => row.id === event.id);
      need(suite && event.stdout?.file === `${suite.id}.stdout` && event.stderr?.file === `${suite.id}.stderr`, 'Exact suite output required');
      evidenceValid = canonical(await artifact(directory, event.stdout.file)) === canonical(event.stdout) && canonical(await artifact(directory, event.stderr.file)) === canonical(event.stderr);
    }
    state = assuranceTransition(state, { ...event, evidenceValid });
  }
  if (state.phase !== 'passed' || receipt.events.at(-1)?.kind !== 'inspect') findings.push(state.reason ?? 'incomplete-suite-coverage');
  state = assuranceTransition(state, { kind: 'inspect', contextDigest: before.contextDigest });
  const after = await observeAssurance(root, receipt.initial.context.source.baseRef);
  state = assuranceTransition(state, { kind: 'inspect', contextDigest: after.contextDigest });
  if (state.phase !== 'passed') findings.push(state.reason ?? 'current-context-unverified');
  return { status: findings.length ? 'refused' : 'current-local-reported', findings: [...new Set(findings)], state, receiptFile: path, receiptDigest: request.receiptDigest, assurance: 'exact-retained-receipt-replayed-against-observed-local-context', limits: limits() };
}
