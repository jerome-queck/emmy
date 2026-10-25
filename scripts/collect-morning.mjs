#!/usr/bin/env node
import { strictJson } from '../src/bounded-json.mjs';
import { readFileSync } from 'node:fs';
import { collectionBegin, collectionCollect, collectionFinish } from '../src/morning-collection.mjs';
const [step, directory, metadata, rawPath] = process.argv.slice(2);
try {
  if (!['begin', 'collect', 'finish'].includes(step) || !directory || !metadata) throw new Error('Usage: node scripts/collect-morning.mjs begin|collect|finish PRIVATE_DIRECTORY METADATA_JSON [RAW_RESPONSE_FILE]');
  const value = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(metadata)));
  const result = step === 'begin' ? collectionBegin(directory, value) : step === 'collect' ? collectionCollect(directory, value, rawPath) : collectionFinish(directory, value);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
