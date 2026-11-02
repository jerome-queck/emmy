export const title = 'Automation reporting: published bytes and recorded claims';
export function state(v) {
  if (v.canonical.some(id => id !== 'bad' && !v.committed.includes(id))) return 'Partial canonical record visible';
  if (v.authority) return 'Producer claim treated as authenticated';
  if (v.reader === 'done' && v.staleInput && !v.staleObserved) return 'Old recorded claim looks fresh';
  const invalid = v.captured.includes('bad') || (v.captured.includes('b') || v.captured.includes('c')) && !v.captured.includes('a');
  const conflict = v.captured.includes('b') && v.captured.includes('c');
  if (v.accepted && (!v.complete || invalid || conflict)) return 'Incomplete or disputed input accepted';
  if (v.reader === 'new') return 'Waiting to scan';
  if (v.reader === 'captured') return 'Captured inputs await classification';
  if (v.staleObserved) return 'Old recorded claim visibly stale';
  return v.accepted ? 'Usable recorded claims' : 'Incomplete or disputed inputs held';
}
export function step(action) {
  return ({ Start: 'Producer starts writing', Write: 'Producer finishes private bytes', Link: 'Producer publishes complete bytes', Reply: 'Producer returns local readback', Crash: 'Producer stops', Retry: 'Producer retries same record', CorruptSync: 'Corrupt sync arrives', Scan: 'Reader captures bounded inputs', Classify: 'Reader classifies recorded claims' })[action] ?? action;
}
