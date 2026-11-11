#!/usr/bin/env node
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildFoundation, materializeFoundation } from '../src/foundation-release.mjs';
import { digest } from '../src/content.mjs';

const [revision] = process.argv.slice(2);
const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'emmy-skill-consumer-'));
try {
  const release = buildFoundation(root, revision);
  const destination = join(temporary, 'consumer');
  await materializeFoundation(release, destination, 'runtime');
  const output = execFileSync(process.execPath, ['scripts/skill-inventory.mjs', 'check'], { cwd: destination, encoding: 'utf8' });
  const index = JSON.parse(await readFile(join(destination, 'registry/skills.json')));
  const reads = [];
  for (const source of index.sources) for (const skill of source.skills) {
    for (const path of [skill.path, ...skill.dependencies, ...source.notices]) {
      const bytes = await readFile(join(destination, 'vendor/skills', index.snapshot, source.id, path));
      const expected = source.files.find(file => file.path === path);
      if (digest(bytes) !== expected.sha256) throw new Error('Consumer hash mismatch');
      reads.push({ source: source.id, path, bytes: bytes.length, sha256: digest(bytes) });
    }
  }
  const evidence = join(root, '.local/verification/skill-consumer');
  await mkdir(evidence, { recursive: true });
  const report = { revision: release.revision, snapshot: index.snapshot, check: JSON.parse(output), reads, registration: 'unverified', execution: 'fresh local runtime, no installed source bindings' };
  await writeFile(join(evidence, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, revision: release.revision, snapshot: index.snapshot, reads: reads.length, report: join(evidence, 'report.json') }));
} finally { await rm(temporary, { recursive: true, force: true }); }
