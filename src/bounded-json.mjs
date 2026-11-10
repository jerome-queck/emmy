import { lstat, readFile } from 'node:fs/promises';

import { strictJson } from './strict-json.mjs';
export { strictJson } from './strict-json.mjs';

export async function boundedFile(path, maxBytes = 262144) {
  const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw new Error('Input must be a bounded ordinary file');
  const bytes = await readFile(path); if (bytes.length > maxBytes) throw new Error('Input grew beyond bound'); return bytes;
}
export async function boundedJson(path, maxBytes = 262144) { return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(await boundedFile(path, maxBytes))); }
