#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const args of [
  ['scripts/check-markdown-links.mjs'],
  ['--test', 'test/markdown-links.test.mjs'],
  ['scripts/agent.mjs', 'maintain', '--check'],
  ['--test', 'test/calendar-collection.test.mjs', 'test/calendar-register.test.mjs', 'test/calendar-timing.test.mjs', 'test/calendar-handoff.test.mjs', 'test/academic-os-task-plan.test.mjs'],
  ['--test', 'test/guidance-pin.test.mjs'],
  ['--test', 'test/process-incarnation.test.mjs', 'test/cloud-migration.test.mjs'],
  ['--test', 'test/fleet.test.mjs', 'test/fleet-history.test.mjs', 'test/fleet-semantics.test.mjs', 'test/morning.test.mjs', 'test/morning-compact.test.mjs', 'test/morning-collection.test.mjs'],
  ['--test', 'test/token-review.test.mjs', 'test/improvement-report.test.mjs'],
  ['--test', 'test/automation-reporting.test.mjs', 'test/automation-reporting-cli.test.mjs', 'test/automation-reporting-privacy.test.mjs', 'test/automation-reporting-transport.test.mjs', 'test/automation-reporting-upkeep.test.mjs', 'test/automation-reporting-cloud.test.mjs', 'test/automation-reporting-harness.test.mjs', 'test/automation-reporting-control.test.mjs', 'test/automation-reporting-expectations.test.mjs'],
  ['scripts/verify-automation-reporting.mjs'],
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
