import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest } from '../src/records.mjs';

export async function guidanceReleaseFixture(home, release = 'emmy-fixture-one') {
  const root = join(home, 'installed-runners', release);
  await mkdir(join(root, 'docs'), { recursive: true });
  const documents = ['docs/operating-brief.md', 'docs/briefing.md', '.agents/skills/sign-in/SKILL.md'].map(path => {
    const text = `# Synthetic approved local guidance\n\n${release}: ${path}\n`;
    return { path, text, bytes: Buffer.byteLength(text), sha256: digest(text) };
  });
  const bundle = { schemaVersion: 1, checkerVersion: 1, documents, digest: digest(documents) };
  const files = { 'docs/briefing-guidance.json': `${JSON.stringify(bundle, null, 2)}\n`, 'source.txt': 'synthetic immutable source\n', ...Object.fromEntries(documents.map(d => [d.path, d.text])) };
  for (const [path, bytes] of Object.entries(files)) { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), bytes); }
  const launchers = { 'run-agent': '#!/bin/sh\nexit 0\n', 'run-briefing': '#!/bin/sh\nexit 0\n' };
  for (const [name, text] of Object.entries(launchers)) await writeFile(join(root, name), text);
  const manifest = { revision: 'b'.repeat(40), privateHome: home, files: Object.entries(files).map(([path, bytes]) => ({ path, bytes: Buffer.byteLength(bytes), sha256: digest(bytes), mode: '100644' })), launchers: Object.fromEntries(Object.entries(launchers).map(([name, text]) => [name, { sha256: digest(text) }])) };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`; await writeFile(join(root, 'installation.json'), manifestBytes);
  return { root, bundle, manifest, request: { schemaVersion: 1, action: 'activate', expectedPinDigest: null, release, revision: manifest.revision, installationSha256: digest(manifestBytes), bundleSha256: digest(files['docs/briefing-guidance.json']), guidanceDigest: bundle.digest, authorityRef: 'synthetic-explicit-owner-approval' } };
}
