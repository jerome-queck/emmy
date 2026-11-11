#!/usr/bin/env node
import { improvementReport, readImprovementRequest } from '../src/improvement-report.mjs';

try {
  if (process.argv.length !== 4 || process.argv[2] !== '--file') throw new Error('Use --file <private-request.json>');
  const data = await improvementReport(await readImprovementRequest(process.argv[3]));
  process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
  process.exitCode = ['claimed', 'released', 'published', 'identical', 'completed-empty', 'completed-findings'].includes(data.status) ? 0 : 3;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exitCode = 2;
}
