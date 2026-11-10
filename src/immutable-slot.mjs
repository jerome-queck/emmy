import { constants } from 'node:fs';
import { lstat, open, link, unlink, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, join, dirname, parse } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => createHash('sha256').update(value).digest('hex');
export async function ordinary(path, maximum) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat(); need(stat.isFile() && stat.size <= maximum, 'Expected bounded ordinary file');
    const bytes = Buffer.alloc(maximum + 1); let count = 0;
    while (count < bytes.length) { const read = await handle.read(bytes, count, bytes.length - count, null); if (!read.bytesRead) break; count += read.bytesRead; }
    need(count <= maximum, 'File exceeds size bound');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { await handle.close(); }
}
export async function directory(path) {
  need(isAbsolute(path) && !path.split(/[\\/]/).includes('..'), 'Select an absolute private directory without traversal');
  const selected = resolve(path);
  need((await lstat(selected)).isDirectory(), 'Private directory must already exist and cannot be a symlink');
  const actual = await realpath(selected);
  let current = selected;
  while (current !== parse(current).root) {
    need(!(await lstat(current)).isSymbolicLink(), 'Symlinked private directory paths are unsupported'); current = dirname(current);
  }
  need(actual === selected, 'Private directory must be canonical');
  return actual;
}
export async function publishSlot(directory, name, bytes, { maximum, validateConflict }) {
  need(/^[a-f0-9]{64}\.json$/.test(name), 'Invalid exact slot name');
  need(Buffer.byteLength(bytes) <= maximum, 'Slot exceeds bound');
  const temporary = join(directory, `.pending-${randomUUID()}`); const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
  try {
    try { await link(temporary, join(directory, name)); return 'published'; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const original = await ordinary(join(directory, name), maximum);
      if (original === bytes) return 'identical';
      const marker = join(directory, `conflict-${name}`);
      try { await link(temporary, marker); } catch (other) {
        if (other.code !== 'EEXIST') throw other;
        await validateConflict(marker, name.slice(0, -5), original);
      }
      const conflict = `conflict-${name.slice(0, -5)}-${hash(bytes)}.json`;
      try { await link(temporary, join(directory, conflict)); } catch (other) { if (other.code !== 'EEXIST') throw other; need(await ordinary(join(directory, conflict), maximum) === bytes, 'Conflict evidence collision'); }
      return 'conflict';
    }
  } finally { await unlink(temporary); }
}
