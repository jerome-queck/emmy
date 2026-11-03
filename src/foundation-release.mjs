import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonical, digest } from './content.mjs';
import { strictJson } from './strict-json.mjs';
import { boundedFile } from './bounded-json.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const pathOK = path => typeof path === 'string' && /^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(path) && path.split('/').every(part => part !== '.' && part !== '..');
const legacyEntries = { pure: 'src/briefing-core.mjs', acquisition: 'src/briefing-acquisition.mjs' };
const entries = { automation: 'src/automation-plan.mjs', pure: 'src/briefing-core.mjs', acquisition: 'src/briefing-acquisition.mjs' };
function closure(files, entry) {
  const found = new Set();
  const visit = path => {
    if (found.has(path)) return;
    const source = files.find(file => file.path === path);
    need(source, `Missing module ${path}`); found.add(path);
    const code = Buffer.from(source.base64, 'base64').toString('utf8');
    need(!/\bimport\s*\(/.test(code), `Dynamic imports forbidden in portable closure ${path}`);
    for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier === 'node:crypto') continue;
      need(/^\.\/[a-z0-9-]+\.mjs$/.test(specifier), `Nonportable dependency ${path}: ${specifier}`);
      visit(`${dirname(path)}/${specifier.slice(2)}`);
    }
  };
  visit(entry); return [...found].sort();
}
function validate(release) {
  need(['emmy-foundation-v1', 'emmy-foundation-v2'].includes(release?.format) && /^[a-f0-9]{40}$/.test(release.revision) && release.minimumNode === 24 && release.effectsAuthorized === false && (release.format === 'emmy-foundation-v1' && release.distribution === undefined || ['runtime', 'portable'].includes(release.distribution)), 'Unsupported source release');
  need(Array.isArray(release.files) && release.files.length > 0 && release.files.length <= 1000, 'Bounded source inventory required');
  let previous = '';
  for (const file of release.files) {
    need(pathOK(file.path) && file.path > previous && ['100644', '100755'].includes(file.mode), 'Ordered unique ordinary source paths required'); previous = file.path;
    need(typeof file.base64 === 'string', 'Encoded source bytes required');
    const bytes = Buffer.from(file.base64, 'base64');
    need(bytes.toString('base64') === file.base64 && bytes.length === file.bytes && digest(bytes) === file.sha256, `Source bytes differ ${file.path}`);
  }
  need(canonical(release.entries) === canonical(release.format === 'emmy-foundation-v1' ? legacyEntries : entries), 'Release entry points differ');
  for (const [kind, entry] of Object.entries(release.entries)) need(canonical(closure(release.files, entry)) === canonical(release.portable[kind]), `Portable closure differs ${kind}`);
  need(release.files.some(file => file.path === 'src/operating-contract.mjs'), 'Operating contract required');
  return release;
}
export function buildFoundation(root, revision, { portableOnly = false } = {}) {
  need(/^[a-f0-9]{40}$/.test(revision), 'Explicit full source commit required');
  const git = args => execFileSync('git', ['-C', root, ...args], { maxBuffer: 16777216 });
  need(git(['rev-parse', `${revision}^{commit}`]).toString().trim() === revision, 'Exact commit required');
  const files = git(['ls-tree', '-rz', '--full-tree', revision]).toString().split('\0').filter(Boolean).map(row => {
    const match = row.match(/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/); need(match, 'Only ordinary tracked source files supported');
    const bytes = git(['cat-file', 'blob', match[2]]);
    return { path: match[3], mode: match[1], bytes: bytes.length, sha256: digest(bytes), base64: bytes.toString('base64') };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const portable = Object.fromEntries(Object.entries(entries).map(([kind, entry]) => [kind, closure(files, entry)]));
  const selected = portableOnly ? files.filter(file => Object.values(portable).some(paths => paths.includes(file.path))) : files;
  return validate({ format: 'emmy-foundation-v2', distribution: portableOnly ? 'portable' : 'runtime', revision, minimumNode: 24, effectsAuthorized: false, entries, portable, files: selected });
}
export async function readFoundation(path, expectedHash) {
  need(/^[a-f0-9]{64}$/.test(expectedHash), 'Trusted capsule SHA-256 required before parsing');
  const bytes = await boundedFile(path, 16777216); need(digest(bytes) === expectedHash, 'Capsule hash differs');
  return validate(strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
export async function materializeFoundation(release, destination, kind) {
  validate(release); need(['runtime', ...Object.keys(release.entries)].includes(kind), 'Use runtime, automation, pure or acquisition');
  need(kind !== 'runtime' || release.distribution !== 'portable' && release.files.some(file => file.path === 'scripts/agent.mjs'), 'Runtime materialization requires complete runtime distribution');
  await mkdir(destination, { mode: 0o700 });
  const selected = kind === 'runtime' ? release.files : release.files.filter(file => release.portable[kind].includes(file.path));
  for (const file of selected) {
    const path = join(destination, file.path); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, Buffer.from(file.base64, 'base64'), { flag: 'wx', mode: file.mode === '100755' ? 0o700 : 0o600 });
    need(digest(await readFile(path)) === file.sha256, `Materialized bytes differ ${file.path}`);
  }
  return { revision: release.revision, kind, files: selected.length, entry: kind === 'runtime' ? 'scripts/agent.mjs' : release.entries[kind], effectsAuthorized: false, deployment: 'staged' };
}
