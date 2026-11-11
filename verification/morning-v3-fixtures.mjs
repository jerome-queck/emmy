import { digest } from '../src/records.mjs';
import { morningOpen, morningAt, morningReceipt } from './morning-fixtures.mjs';
import { preparePolicyBriefing } from '../src/briefing-plan.mjs';

const authority = { sourceRef: 'synthetic-owner-direction', date: '2026-10-25', scope: 'Synthetic briefing only' };
export const morningV3Policy = {
  schemaVersion: 3, version: 'synthetic-policy-v3', authority,
  accounts: morningOpen.accounts,
  delivery: { ownerRef: authority.sourceRef, scope: { service: 'chatgpt', account: 'synthetic-owner', environment: 'dot-cloud', surface: 'native', resource: 'synthetic-room' } },
  exceptions: [{ id: 'exact-retained-reading', match: { adapter: 'outlook', nativeId: 'retained-reading', threadId: null, sender: null, subject: null, category: null }, action: 'keep', requiresFacts: false, overrideProtected: true, authority }],
  rules: [{ id: 'synthetic-bulk', match: { adapter: 'either', nativeId: null, threadId: null, sender: 'notices@vendor.example', subject: null, category: 'promotion' }, action: 'trash', requiresFacts: false, overrideProtected: false, authority }],
  unboundExceptions: [], dismissedObligations: ['synthetic-dismissed-thanks'],
  learning: { minimumIndependentObservations: 2, excludeActors: ['emmy', 'known-agent'], forbiddenBroadening: ['serious-security', 'financial'] }
};
export const morningV3Open = {
  ...morningOpen, policyVersion: 3, cleanupMode: 'batched-v1', delivery: morningV3Policy.delivery, policy: morningV3Policy,
  migration: { sourceRef: 'synthetic-migration-acceptance', predecessorOwner: 'morning-v2', predecessorInactive: true, predecessorStateDigest: digest([]), policyDigest: digest(morningV3Policy), acceptedAt: morningAt }
};
export function morningV3Plan(run, at = morningAt) {
  const start = new Date(`${run.day}T00:00:00+08:00`).toISOString(); const window = { start, end: new Date(Date.parse(start) + 86400000).toISOString() };
  const daySource = role => ({ observedAt: at, capturedAt: at, complete: true, paginationComplete: true, gaps: [], window, resourceIds: [role], acquiredResourceIds: [role], items: [] });
  const input = {
    schemaVersion: 3, day: run.day, asOf: at, policy: run.policy,
    mail: ['gmail', 'outlook'].map(adapter => {
      const capture = run.sources.find(source => source.role === adapter).capture;
      const items = run.items.filter(item => item.adapter === adapter).map(item => Object.fromEntries(['adapter', 'before', 'receipt', 'context', 'ruleId', 'facts', ...(item.policyEvidence ? ['policyEvidence'] : [])].map(key => [key, item[key]])));
      return { adapter, account: run.accounts[adapter].account, surface: adapter === 'gmail' ? 'connector' : 'browser', environment: 'dot-cloud', observedAt: capture.receipt.observedAt, capturedAt: capture.receipt.capturedAt, complete: capture.receipt.coverage.complete, paginationComplete: capture.paginationComplete, gaps: capture.receipt.coverage.gaps, inboxIds: capture.messageIds, items, expandedContextCount: items.length };
    }),
    calendar: daySource('calendar'), tasks: daySource('tasks'), obligations: [], checks: [],
    ...(run.items.some(item => item.attempts.length) ? { mailOutcomes: run.items.filter(item => item.attempts.length).map(item => ({ adapter: item.adapter, nativeId: item.before.nativeId, action: item.attempts.at(-1).action, status: item.attempts.at(-1).status })) } : {})
  };
  return { input, result: preparePolicyBriefing(input), inputReceipt: morningReceipt('deterministic-input', at), receipt: morningReceipt('deterministic-result', at) };
}
