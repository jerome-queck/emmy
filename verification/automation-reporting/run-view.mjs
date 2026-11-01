export const title = 'Recorded run and receipt transitions';
export function state(v) {
  if (v.inferred) return 'Expected slot wrongly shown completed';
  if (v.terminalBroken) return 'Terminal execution changed';
  if (v.receiptBroken) return 'Verified receipt regressed';
  return v.present ? `Reported ${v.execution}; receipt ${v.receipt}` : 'Expected slot, no reported run';
}
export const step = action => ({ CreateRun: 'Producer records a run', ReviseRun: 'Producer revises the same run', ReviseReceipt: 'Producer revises the receipt', ReadMissing: 'Reader inspects the missing run' })[action] ?? action;
