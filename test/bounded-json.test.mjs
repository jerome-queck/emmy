import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { boundedFile, boundedJson } from '../src/bounded-json.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'emmy-bounded-json-'));
  t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); await fs.rm(directory, { recursive: true, force: true }); });
  return join(directory, 'input.json');
}

function afterInspection(t, path, action, observeRead = () => {}) {
  const lstat = fs.lstat; const open = fs.open; const readFile = fs.readFile;
  let triggered = false;
  const inspect = async (selected, info) => {
    if (selected === path && !triggered) { triggered = true; await action(); }
    return info;
  };
  t.mock.method(fs, 'lstat', async (selected, ...args) => inspect(selected, await lstat(selected, ...args)));
  t.mock.method(fs, 'readFile', async (...args) => { const bytes = await readFile(...args); observeRead(bytes.length); return bytes; });
  t.mock.method(fs, 'open', async (selected, ...args) => {
    const handle = await open(selected, ...args);
    const stat = handle.stat.bind(handle); const read = handle.read.bind(handle);
    handle.stat = async (...options) => inspect(selected, await stat(...options));
    handle.read = async (...options) => { const result = await read(...options); observeRead(result.bytesRead, options[2]); return result; };
    return handle;
  });
  syncBuiltinESMExports();
  return () => triggered;
}

test('bounded files accept empty and exact-byte limits and reject oversized input', async t => {
  const path = await fixture(t);
  await fs.writeFile(path, ''); assert.equal((await boundedFile(path, 0)).length, 0);
  await fs.writeFile(path, 'é'); assert.deepEqual(await boundedFile(path, 2), Buffer.from('é'));
  await assert.rejects(boundedFile(path, 1));
  await fs.writeFile(path, Buffer.alloc(262145)); await assert.rejects(boundedFile(path));
});

test('pathname replacement after inspection cannot redirect an acquired file', async t => {
  const path = await fixture(t); const other = `${path}.other`; const original = '{"safe":true}';
  await fs.writeFile(path, original); await fs.writeFile(other, '{"safe":false}');
  const triggered = afterInspection(t, path, async () => { await fs.rename(path, `${path}.original`); await fs.symlink(other, path); });
  assert.equal((await boundedFile(path, 32)).toString(), original);
  assert.equal(triggered(), true);
});

test('growth after inspection refuses after at most limit plus one acquired bytes', async t => {
  const path = await fixture(t); const maximum = 32; const growth = Buffer.alloc(1024 * 1024, ' ');
  await fs.writeFile(path, '{}'); let acquired = 0; let largestRequest = 0;
  const triggered = afterInspection(t, path, () => fs.appendFile(path, growth), (count, requested = count) => { acquired += count; largestRequest = Math.max(largestRequest, requested); });
  const allocate = Buffer.alloc; const allocations = [];
  t.mock.method(Buffer, 'alloc', (size, ...args) => { allocations.push(size); return allocate(size, ...args); });
  await assert.rejects(boundedFile(path, maximum));
  assert.equal(triggered(), true);
  t.diagnostic(JSON.stringify({ maximum, acquired, largestRequest, allocations }));
  assert.ok(acquired <= maximum + 1, `acquired ${acquired} bytes exceeds ${maximum + 1}`);
  assert.ok(largestRequest <= maximum + 1);
  assert.ok(allocations.every(size => size <= maximum + 1));
});

test('symlinks, directories and writerless FIFOs refuse promptly', async t => {
  const path = await fixture(t); await fs.writeFile(path, '{}');
  await fs.symlink(path, `${path}.link`); await assert.rejects(boundedFile(`${path}.link`));
  await assert.rejects(boundedFile(join(path, '..')));
  execFileSync('mkfifo', [`${path}.fifo`]);
  const script = `import { boundedFile } from ${JSON.stringify(new URL('../src/bounded-json.mjs', import.meta.url).href)}; try { await boundedFile(process.argv[1]); process.exitCode = 1; } catch { process.exitCode = 0; }`;
  execFileSync(process.execPath, ['--input-type=module', '-e', script, `${path}.fifo`], { timeout: 3000 });
});

test('replacement with a FIFO before open refuses without waiting for a writer', async t => {
  const path = await fixture(t); await fs.writeFile(path, '{}');
  const preload = `${path}.preload.mjs`; const module = new URL('../src/bounded-json.mjs', import.meta.url).href;
  await fs.writeFile(preload, `
    import fs from 'node:fs/promises';
    import { execFileSync } from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const path = process.argv[1]; const lstat = fs.lstat; const open = fs.open;
    let replaced = false;
    async function replace(selected) { if (selected === path && !replaced) { replaced = true; await fs.unlink(path); execFileSync('mkfifo', [path]); } }
    fs.lstat = async (selected, ...args) => { const info = await lstat(selected, ...args); await replace(selected); return info; };
    fs.open = async (selected, ...args) => { await replace(selected); return open(selected, ...args); };
    syncBuiltinESMExports();
    const { boundedFile } = await import(${JSON.stringify(module)});
    try { await boundedFile(path, 32); process.exitCode = 1; } catch { process.exitCode = replaced ? 0 : 2; }
  `);
  execFileSync(process.execPath, ['--import', preload, '--input-type=module', '-e', '', path], { timeout: 3000 });
});

test('short descriptor reads retain the complete input and close on success and refusal', async t => {
  const path = await fixture(t); const input = '{"value":"é"}'; await fs.writeFile(path, input);
  const open = fs.open; const handles = [];
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args); const read = handle.read.bind(handle); const close = handle.close.bind(handle);
    const witness = { closed: false }; handles.push(witness);
    handle.read = (buffer, offset, length, position) => read(buffer, offset, Math.min(length, 3), position);
    handle.close = async () => { await close(); witness.closed = true; };
    return handle;
  }); syncBuiltinESMExports();
  assert.equal((await boundedFile(path, 32)).toString(), input);
  await assert.rejects(boundedFile(path, 1));
  assert.equal(handles.length, 2); assert.ok(handles.every(handle => handle.closed));
});

test('JSON retains fatal UTF-8, duplicate-key and unsafe-key rejection', async t => {
  const path = await fixture(t);
  await fs.writeFile(path, '{"value":"é"}'); assert.deepEqual(await boundedJson(path), { value: 'é' });
  for (const bytes of [Buffer.from([0x22, 0xc3, 0x28, 0x22]), '{"a":1,"a":2}', '{"__proto__":{}}', '{} trailing']) {
    await fs.writeFile(path, bytes); await assert.rejects(boundedJson(path));
  }
});
