#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { join } from 'node:path';
import { selectTaskRunner, taskCallerArguments } from '../src/task-runner.mjs';

try {
  const [option, binding, ...args] = process.argv.slice(2);
  if (option !== '--binding' || !binding) throw new Error('Task caller requires its fixed --binding path');
  taskCallerArguments(args);
  const selected = await selectTaskRunner(binding);
  process.stderr.write(`${JSON.stringify({ type: 'task-runner-selection', ...selected, verification: 'passed', execution: 'not-yet-started', accepted: false })}\n`);
  const child = spawn(selected.runtime, [join(selected.sourceRoot, 'scripts/agent.mjs'), ...args, '--home', selected.privateHome, '--root', selected.sourceRoot], { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
  const forward = signal => { child.kill(signal); };
  const interrupt = () => forward('SIGINT'); const terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  await new Promise(resolve => {
    child.on('error', error => {
      process.stderr.write(`${JSON.stringify({ type: 'task-runner-execution', status: 'spawn-error', message: error.message, automaticRetry: false, accepted: false })}\n`); process.exitCode = 2;
    });
    child.on('close', (code, signal) => {
      process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
      if (signal) process.stderr.write(`${JSON.stringify({ type: 'task-runner-execution', status: 'signalled', signal, automaticRetry: false, accepted: false })}\n`);
      process.exitCode ??= code ?? (signal ? 128 + constants.signals[signal] : 2); resolve();
    });
  });
} catch (error) {
  process.stderr.write(`${JSON.stringify({ type: 'task-runner-refusal', message: error.message, execution: 'none', accepted: false })}\n`); process.exitCode = 2;
}
