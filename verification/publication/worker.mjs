import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
const records = await import(pathToFileURL(input.source));
const result = input.operation === 'import'
  ? await records.retainImport(input.home, input.bundle)
  : await records.publishRecord(input.home, input.payload, input.files);
process.stdout.write(`${JSON.stringify(result)}\n`);
