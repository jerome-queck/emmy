import { constants } from 'node:fs';
import { open, lstat, realpath, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { boundedFile, strictJson } from './bounded-json.mjs';
import { digest } from './content.mjs';

const need = (condition, message) => { if (!condition) throw new Error(message); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
function shape(value, fields) {
  need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), 'Unknown or missing task caller field');
}
function absolute(path) { need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path && !path.includes('\0'), 'Task caller paths must be normalized absolute paths'); }
async function directory(path) {
  absolute(path);
  const stat = await lstat(path);
  need(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(path) === path, 'Task caller directory must have ordinary ancestors');
}
async function file(path, maximum) {
  absolute(path); await directory(resolve(path, '..'));
  return boundedFile(path, maximum);
}
const json = bytes => strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
async function runtimeHash(path) {
  absolute(path); await directory(resolve(path, '..'));
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    need(stat.isFile() && (stat.mode & 0o111) !== 0 && stat.size <= 256 * 1024 * 1024, 'Task runtime must be a bounded executable ordinary file');
    const hash = createHash('sha256'); const buffer = Buffer.alloc(65536); let count = 0;
    while (true) {
      const result = await handle.read(buffer, 0, buffer.length, null); if (!result.bytesRead) break;
      count += result.bytesRead; need(count <= 256 * 1024 * 1024, 'Task runtime grew beyond bound'); hash.update(buffer.subarray(0, result.bytesRead));
    }
    return hash.digest('hex');
  } finally { await handle.close(); }
}
async function sourceFiles(root, relative) {
  const path = join(root, relative); await directory(path); const files = [];
  for (const name of (await readdir(path)).sort()) {
    const next = join(relative, name); const stat = await lstat(join(root, next));
    if (stat.isDirectory()) files.push(...await sourceFiles(root, next));
    else { need(stat.isFile() && !stat.isSymbolicLink(), 'Task source must contain ordinary files'); files.push(next); }
  }
  return files;
}
async function verifyTarget(target, privateHome) {
  shape(target, ['sourceRoot', 'sourceManifest', 'sourceManifestSha256', 'revision', 'runtime', 'runtimeSha256']);
  need(commit(target.revision) && sha(target.sourceManifestSha256) && sha(target.runtimeSha256), 'Invalid task source/runtime identity');
  await directory(target.sourceRoot);
  const raw = await file(target.sourceManifest, 2 * 1024 * 1024);
  need(digest(raw) === target.sourceManifestSha256, 'Task source manifest hash mismatch');
  const manifest = json(raw); shape(manifest, ['schemaVersion', 'revision', 'privateHome', 'files']);
  need(manifest.schemaVersion === 1 && manifest.revision === target.revision && manifest.privateHome === privateHome, 'Task source revision/private-home mismatch');
  need(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 2000, 'Invalid task source inventory');
  const seen = new Set(); let total = 0;
  for (const row of manifest.files) {
    shape(row, ['path', 'sha256', 'bytes']);
    need(typeof row.path === 'string' && row.path.length <= 1024 && !/[\\\x00]/.test(row.path) && row.path.split('/').every(part => part && part !== '.' && part !== '..') && !seen.has(row.path), 'Unsafe or duplicate task source path');
    need(sha(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 8 * 1024 * 1024, 'Invalid task source file identity');
    seen.add(row.path); total += row.bytes; need(total <= 64 * 1024 * 1024, 'Task source exceeds bound');
    const bytes = await file(join(target.sourceRoot, row.path), 8 * 1024 * 1024);
    need(bytes.length === row.bytes && digest(bytes) === row.sha256, 'Task source integrity mismatch');
  }
  need(seen.has('scripts/agent.mjs'), 'Task source inventory omits entry point');
  for (const path of ['package.json', 'registry/catalog.json', 'docs/cli.md', 'docs/catalog.md', 'docs/verification-index.json', 'docs/briefing-guidance.json', 'docs/operating-brief.md', 'docs/briefing.md', '.agents/skills/verify/features/README.md', '.agents/skills/sign-in/SKILL.md']) need(seen.has(path), 'Task source inventory omits required runtime data');
  for (const root of ['src', 'scripts', 'registry', 'docs', '.agents']) {
    for (const path of await sourceFiles(target.sourceRoot, root)) need(seen.has(path), 'Task source inventory omits executable source or runtime data');
  }
  let procedures = false;
  try { await lstat(join(target.sourceRoot, 'procedures')); procedures = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (procedures) for (const path of await sourceFiles(target.sourceRoot, 'procedures')) need(seen.has(path), 'Task source inventory omits procedure data');
  need(await runtimeHash(target.runtime) === target.runtimeSha256, 'Task runtime integrity mismatch');
  return { ...target, filesVerified: seen.size };
}

export function taskCallerArguments(args) {
  const [command, ...options] = args;
  const commands = { doctor: [], dispatch: ['id', 'project', 'resolve', 'discovery', 'as-of', 'context-needed'], 'task-workflow': ['file'] };
  need(Object.hasOwn(commands, command), 'Task caller permits doctor, dispatch and task-workflow only');
  const seen = new Set();
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    need(/^--[a-z-]+$/.test(option) && [...commands[command], 'json'].includes(option.slice(2)) && !seen.has(option), 'Unknown, duplicate or overriding task caller option');
    seen.add(option);
    if (!['--json', '--context-needed'].includes(option)) need(typeof options[++i] === 'string' && options[i].length > 0 && !options[i].startsWith('--'), 'Missing task caller option value');
  }
  return args;
}

export async function selectTaskRunner(bindingPath) {
  const bindingBytes = await file(bindingPath, 16384); const binding = json(bindingBytes);
  shape(binding, ['schemaVersion', 'privateHome', 'baseline']);
  need(binding.schemaVersion === 1, 'Unsupported task caller binding version'); await directory(binding.privateHome);
  const selectionPath = join(binding.privateHome, 'task-runner.json'); let selectionBytes;
  try { selectionBytes = await boundedFile(selectionPath, 16384); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let target = binding.baseline;
  if (selectionBytes) {
    const selection = json(selectionBytes); shape(selection, ['schemaVersion', 'target']);
    need(selection.schemaVersion === 1, 'Unsupported task runner selection version'); target = selection.target;
  }
  const verified = await verifyTarget(target, binding.privateHome);
  need((await file(bindingPath, 16384)).equals(bindingBytes), 'Task caller binding changed during verification');
  let after;
  try { after = await boundedFile(selectionPath, 16384); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  need(selectionBytes ? after?.equals(selectionBytes) : after === undefined, 'Task runner selection changed during verification');
  return { ...verified, privateHome: binding.privateHome, selection: selectionBytes ? 'selected' : 'baseline', bindingSha256: digest(bindingBytes), selectionSha256: selectionBytes ? digest(selectionBytes) : null, verifiedAt: new Date().toISOString() };
}

export function taskCallerLauncher({ runtime, caller, binding }) {
  for (const path of [runtime, caller, binding]) { absolute(path); need(!/[\r\n]/.test(path), 'Invalid launcher path'); }
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  return `#!/bin/sh\nset -eu\nNODE_OPTIONS= NODE_PATH= exec ${quote(runtime)} ${quote(caller)} --binding ${quote(binding)} "$@"\n`;
}
