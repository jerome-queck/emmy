import { test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { driveAssurance } from '../verification/local-assurance/drive.mjs';

test('actual package and fresh CLI refuse incomplete, failed, changed and corrupted assurance evidence', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const directory = join(root, '.local/local-assurance-drive', randomUUID());
  await mkdir(directory, { recursive: true });
  await driveAssurance(root, directory);
});
