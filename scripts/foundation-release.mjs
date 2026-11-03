#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFoundation, readFoundation, materializeFoundation } from '../src/foundation-release.mjs';
import { canonical, digest } from '../src/content.mjs';

try {
  const [action, ...args] = process.argv.slice(2);
  if (['build', 'build-portable'].includes(action) && args.length === 3) {
    const [root, revision, output] = args;
    const bytes = `${canonical(buildFoundation(resolve(root), revision, { portableOnly: action === 'build-portable' }))}\n`;
    await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ output, revision, bytes: Buffer.byteLength(bytes), sha256: digest(bytes), deployment: 'staged' }));
  } else if (action === 'verify' && args.length === 2) {
    const release = await readFoundation(...args);
    console.log(JSON.stringify({ revision: release.revision, files: release.files.length, portable: release.portable, effectsAuthorized: false }));
  } else if (action === 'materialize' && args.length === 4) {
    const [path, hash, destination, kind] = args;
    console.log(JSON.stringify(await materializeFoundation(await readFoundation(path, hash), destination, kind)));
  } else throw new Error('Use build|build-portable <root> <full-commit> <new-file>, verify <file> <trusted-sha256>, or materialize <file> <trusted-sha256> <new-directory> <runtime|pure|acquisition>');
} catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 2; }
