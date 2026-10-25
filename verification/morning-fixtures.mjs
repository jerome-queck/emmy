import { digest } from '../src/records.mjs';
import { fleetInitial, fleetTransition } from '../src/fleet-state.mjs';
export const morningAt = '2026-10-25T01:00:00.000Z';
export const morningWindow = { start: '2026-10-24T16:00:00.000Z', end: '2026-10-25T16:00:00.000Z' };
export const morningEntities = [
  { id: 'gmail', kind: 'authentication', scope: { service: 'gmail', account: 'owner@example.test', environment: 'parent-cloud', surface: 'connector', resource: 'inbox' } },
  { id: 'outlook', kind: 'authentication', scope: { service: 'outlook', account: 'student@example.test', environment: 'parent-cloud', surface: 'browser', resource: 'inbox' } },
  ...['calendar-inventory', 'task-inventory', 'calendar', 'tasks'].map(id => ({ id, kind: 'cloud-job', scope: { service: 'calendar', environment: 'parent-cloud', surface: 'connector', resource: id } }))
];
export const morningDelivery = { scope: { service: 'slack', account: 'workspace-fixture', environment: 'parent-cloud', surface: 'connector', resource: 'dm-fixture' }, ownerRef: 'synthetic-owner-account-scope' };
export const morningRoot = { schemaVersion: 1, type: 'fleet-root', responsibilityId: 'synthetic-morning', definitionHash: digest('definition'), effectKey: digest('morning-effect'), hash: digest('root'), requestDigest: digest('configure'), at: morningAt, epochHash: null, action: { operation: 'configure', entities: morningEntities } };
export const morningOpen = { step: 'open', runId: '2026-10-25', day: '2026-10-25', policyVersion: 2, delivery: morningDelivery, ownerRef: 'synthetic-owner-account-scope', accounts: { gmail: { account: 'owner@example.test', entityId: 'gmail' }, outlook: { account: 'student@example.test', entityId: 'outlook' } }, sources: morningEntities.map(row => ({ id: row.id, role: row.id, entityId: row.id })), rules: [{ id: 'foodpanda-promotions', version: 1, ownerRef: 'synthetic-narrow-owner-rule' }] };
export const morningReceipt = (id, at = morningAt) => ({ sourceRef: `synthetic-${id}`, sha256: digest(`raw-${id}`), observer: 'Synthetic parent; no native execution', scope: morningEntities.find(row => row.id === id)?.scope ?? { service: 'assessment', environment: 'parent-cloud', surface: 'cloud', resource: id }, observedAt: at, capturedAt: at, coverage: { complete: true, gaps: [] } });
export function morningItem(adapter = 'gmail', overrides = {}) {
  const context = Object.fromEntries(['actionRequired', 'reviewRequired', 'ambiguous', 'seriousSecurity', 'unresolved', 'consequential', 'academic', 'research', 'personal', 'billing', 'terms', 'securityWarning', 'orderReceipt', 'invitation', 'directMessage', 'recognizedLogin'].map(key => [key, false]));
  return { adapter, before: { nativeId: `${adapter}-one`, threadId: `${adapter}-thread`, subject: 'A harmless promotion', sender: 'contact@info.foodpanda.sg', unread: true, ...(adapter === 'gmail' ? { labels: ['INBOX', 'UNREAD', 'STARRED'] } : { folder: 'Inbox', folderId: 'inbox-native' }) }, receipt: morningReceipt(adapter), context: { ...context, complete: true, safeUnreadInspection: true, informational: true, category: 'promotion', threadDigest: digest('whole thread') }, facts: [], ruleId: adapter === 'gmail' ? 'foodpanda-promotions' : null, ...overrides };
}
export const morningCommand = (step, fields = {}) => ({ step, runId: morningOpen.runId, ...(['send-ack', 'send-resolve', 'edit-ack', 'edit-resolve'].includes(step) ? { scope: morningDelivery.scope, acquiredAt: morningAt } : {}), ...fields });
export function morningFixture() {
  let state = fleetInitial(morningRoot);
  const transition = (action, at = morningAt) => { const result = fleetTransition(state, action, morningRoot, at); state = result.state; return result; };
  const command = (step, fields = {}, at = morningAt) => transition({ operation: 'morning', command: morningCommand(step, fields) }, at);
  command('open', Object.fromEntries(Object.entries(morningOpen).filter(([key]) => !['step', 'runId'].includes(key))));
  for (const entity of morningEntities) {
    transition({ operation: 'submit', job: { id: `read-${entity.id}`, kind: 'briefing-source-read', occurrence: morningOpen.runId, priority: 'morning', entityIds: [entity.id], purpose: 'Synthetic acquisition through the actual fleet state machine', maxReads: 1, maxBytes: 4096, steps: 1 } });
    const admitted = transition({ operation: 'claim', ownerRef: 'synthetic-parent' }); const ticket = admitted.ticket;
    transition({ operation: 'result', jobKey: ticket.key, ticket: ticket.ticket, checkpoint: 1, outcome: 'completed', usage: { reads: 1, bytes: 32 }, receipt: morningReceipt(entity.id) });
    command('source', { sourceId: entity.id, jobKey: ticket.key, receipt: morningReceipt(entity.id), paginationComplete: true, cached: false, resourceIds: entity.id === 'calendar-inventory' ? ['calendar'] : entity.id === 'task-inventory' ? ['tasks'] : [], messageIds: ['gmail', 'outlook'].includes(entity.id) ? [`${entity.id}-one`] : [], window: ['calendar', 'tasks'].includes(entity.id) ? morningWindow : null });
  }
  const seal = () => command('seal', morningAssessments());
  const deliver = () => { seal(); const run = state.morningRuns[0]; command('send-intent', { sendRef: 'synthetic-send', bodyDigest: run.sealed.bodyDigest }); command('send-ack', { sendRef: 'synthetic-send', bodyDigest: run.sealed.bodyDigest, deliveredBodyDigest: run.sealed.bodyDigest, readbackRef: 'synthetic-separate-readback', nativeId: 'synthetic-message' }); };
  return { command, transition, seal, deliver, get state() { return state; }, get run() { return state.morningRuns[0]; } };
}

export function morningAssessments(at = morningAt, window = morningWindow) {
  const body = 'Timed commitments, conflicts, deadlines, owed replies and decisions from declared sources.\n';
  const briefingInput = { synthetic: true }; const calendarInput = { intent: { window: { ...window, timeZone: 'Asia/Singapore' } } };
  const briefingInputReceipt = { ...morningReceipt('briefing-input', at), sha256: digest(JSON.stringify(briefingInput)) }; const calendarInputReceipt = { ...morningReceipt('calendar-input', at), sha256: digest(JSON.stringify(calendarInput)) };
  return { briefing: { receipt: morningReceipt('briefing', at), input: briefingInput, inputReceipt: briefingInputReceipt, assessmentReceipt: morningReceipt('briefing-generated-receipt', at), assessment: { schemaVersion: 1, mode: 'draft', status: 'checked', assurance: 'advisory-reported-inputs', checkedAt: at, inputDigest: briefingInputReceipt.sha256, bodyDigest: digest(body) }, result: { mode: 'draft', status: 'checked', body, bodyDigest: digest(body) } }, calendar: { receipt: morningReceipt('calendar-assessment', at), input: calendarInput, inputReceipt: calendarInputReceipt, result: { schemaVersion: 1, ruleVersion: 1, status: 'checked', execution: 'none', assurance: 'declared-calendar-evidence', evaluatedAt: at, inputDigest: calendarInputReceipt.sha256, findings: [], fieldResults: [], inventoryResults: [], morningResults: [] } } };
}
