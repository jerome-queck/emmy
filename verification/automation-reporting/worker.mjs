import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
const api = await import(pathToFileURL(input.source));
if (input.marker) process.env.EMMY_REPORT_MODEL_MARKER = input.marker;
process.stdout.write(`${JSON.stringify(await api.automationReporting(input.request, { evaluatedAt: input.evaluatedAt }))}\n`);
