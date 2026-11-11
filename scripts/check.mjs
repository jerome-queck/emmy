#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAssurance } from '../src/local-assurance.mjs';

if (!(process.argv.length === 2 || process.argv.length === 4 && process.argv[2] === '--base')) throw new Error('Use npm run check [-- --base <ref>]');
const result = await runAssurance(join(dirname(fileURLToPath(import.meta.url)), '..'), { baseRef: process.argv[3] ?? 'HEAD' });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.status === 'passed-local' ? 0 : 1;
