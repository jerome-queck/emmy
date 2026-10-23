#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const args of [
  ['scripts/agent.mjs', 'maintain', '--check'],
  ['scripts/verify-behavior.mjs'],
  ['--test', 'test/github-auto-merge.test.mjs'],
  ['scripts/verify-formal.mjs'],
  ['verification/merge-policy.mjs'],
  ['scripts/verify-publication.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
