import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest } from '../src/records.mjs';
import { calendarFixture } from './calendar-fixtures.mjs';

export async function driveCalendar({ home, run, scenario, report }) {
  const directory = join(home, 'calendar'); await mkdir(directory, { recursive: true });
  const before = await readdir(join(home, 'records'));
  report.calendar = { evidence: 'synthetic', controls: [] };
  const check = async (name, input, expected, verify) => {
    const file = join(directory, `${name}.json`); const bytes = `${JSON.stringify(input, null, 2)}\n`; await writeFile(file, bytes);
    const result = await run(['calendar', '--file', file], expected);
    assert.equal(await readFile(file, 'utf8'), bytes, 'Calendar input bytes stay unchanged');
    assert.equal(result.inputDigest, digest(bytes)); assert.equal(result.execution, 'none'); assert.equal(result.assurance, 'declared-calendar-evidence');
    await verify(result); report.calendar.controls.push({ name, status: result.status, findings: result.findings.map(finding => finding.code), inputDigest: result.inputDigest });
    return result;
  };
  await check('exact-notes', calendarFixture(), 0, result => assert.equal(result.fieldResults.find(field => field.field === 'notes').status, 'exact'));
  const popup = calendarFixture(); popup.readbacks[0].fields.notes = { origin: 'label', raw: 'Description: Close', value: 'Description: Close' };
  await check('generic-popup', popup, 3, result => assert.equal(result.fieldResults.find(field => field.field === 'notes').status, 'wrong-provenance'));
  assert.deepEqual(await readdir(join(home, 'records')), before, 'Calendar assessment writes no journal records');
  await cp(directory, join(report.evidenceDir, 'calendar'), { recursive: true });
  scenario('calendar-acceptance', 'Real read-only CLI compares synthetic saved fields. This is declared evidence, not native acceptance.');
}
