import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function dailyFixture(directory, asOf = new Date().toISOString()) {
  await mkdir(directory, { recursive: true });
  const save = async (name, value) => { const raw = typeof value === 'string' ? value : JSON.stringify(value); const path = join(directory, name); await writeFile(path, raw); return { path, sha256: createHash('sha256').update(raw).digest('hex') }; };
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(asOf));
  const start = new Date(`${day}T00:00:00+08:00`).toISOString(); const end = new Date(Date.parse(start) + 86400000).toISOString();
  const context = await save('context.txt', 'Synthetic full thread context, no account access.');
  const sources = [];
  for (const role of ['gmail', 'outlook', 'calendar', 'tasks']) {
    const mail = ['gmail', 'outlook'].includes(role);
    const source = { schemaVersion: 1, role, account: `${role}@example.invalid`, surface: role === 'outlook' ? 'browser' : 'connector', observedAt: asOf, capturedAt: asOf, complete: true, gaps: [], ...(mail ? { inboxIds: [`${role}-1`], items: [{ nativeId: `${role}-1`, threadId: `${role}-thread`, sender: 'sender@example.invalid', subject: 'Fixture message', unread: true, context: { artifact: context, complete: true, unreadPreserved: true }, judgment: { action: 'keep', reason: 'Synthetic protected correspondence', facts: ['Keep this example.'], flags: [] } }] } : { window: { start, end }, containerIds: [`${role}-container`], containers: [{ nativeId: `${role}-container`, complete: true, entries: [{ title: 'Fixture day item', summary: 'Declared read-only day context.' }] }] }) };
    sources.push({ role, artifact: await save(`${role}.json`, source) });
  }
  return { input: { schemaVersion: 1, identity: { day, provenance: 'manual', scheduledFor: null }, asOf, policy: null, sources }, save };
}
