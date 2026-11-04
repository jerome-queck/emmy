import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

import { strictJson } from './strict-json.mjs';
export { strictJson } from './strict-json.mjs';

export async function boundedFile(path, maxBytes = 262144) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => {
    if (error.code === 'ELOOP') throw new Error('Input must be a bounded ordinary file', { cause: error });
    throw error;
  });
  try {
    const info = await handle.stat(); if (!info.isFile() || info.size > maxBytes) throw new Error('Input must be a bounded ordinary file');
    const bytes = Buffer.alloc(maxBytes + 1); let count = 0;
    while (count < bytes.length) { const read = await handle.read(bytes, count, bytes.length - count, null); if (!read.bytesRead) break; count += read.bytesRead; }
    if (count > maxBytes) throw new Error('Input grew beyond bound');
    return bytes.subarray(0, count);
  } finally { await handle.close(); }
}
export async function boundedJson(path, maxBytes = 262144) { return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(await boundedFile(path, maxBytes))); }
