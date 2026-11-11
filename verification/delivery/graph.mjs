import { canonical } from '../../src/content.mjs';

export const deliveryEvents = [
  ['BeginChecks', { kind: 'check-start' }], ['ChecksPass', { kind: 'check-result', valid: true }],
  ['ChecksFail', { kind: 'check-result', valid: false }], ['IndependentReview', { kind: 'review', valid: true }],
  ['FakeReview', { kind: 'review', valid: false }], ['ScopeAccepted', { kind: 'ready', valid: true }],
  ['ScopeDenied', { kind: 'ready', valid: false }], ['AuthorizeMerge', { kind: 'authorize-merge', valid: true }],
  ['DenyMerge', { kind: 'authorize-merge', valid: false }], ['Drift', { kind: 'drift' }],
  ...['publish', 'open-pr', 'attest', 'merge'].flatMap((action, index) => [
    [`Intent${index}`, { kind: 'intent', action, valid: true }],
    [`DeniedIntent${index}`, { kind: 'intent', action, valid: false }],
    [`Confirm${index}`, { kind: 'observe', action, confirmed: true, exact: true }],
    [`Absent${index}`, { kind: 'observe', action, confirmed: false, exact: true }],
    [`WrongReceipt${index}`, { kind: 'observe', action, confirmed: true, exact: false }],
    [`Resolve${index}`, { kind: 'resolve-absence', action, valid: true, exact: true, absent: true, attemptMatches: true }],
    [`StaleResolution${index}`, { kind: 'resolve-absence', action, valid: false, exact: true, absent: true, attemptMatches: true }],
    [`UncertainResolution${index}`, { kind: 'resolve-absence', action, valid: true, exact: true, absent: false, attemptMatches: true }],
    [`WrongAttempt${index}`, { kind: 'resolve-absence', action, valid: true, exact: true, absent: true, attemptMatches: false }],
  ]),
];

export function deliveryGraph({ beginDelivery, deliveryTransition }) {
  const states = []; const edges = []; const ids = new Map();
  const intern = row => {
    const key = canonical(row);
    if (!ids.has(key)) { ids.set(key, states.length); states.push(row); }
    return ids.get(key);
  };
  intern({ state: beginDelivery(), checked: false, reviewed: false, scoped: false, mergeAuthorized: false, attempts: {}, resolutions: {}, unsafe: false, lostUnknown: false, unconfirmedMerge: false });
  for (let from = 0; from < states.length; from++) {
    const prior = states[from];
    if (Object.entries(prior.attempts).some(([action, n]) => n > 1 + (prior.resolutions[action] ?? 0))) { edges.push({ from, to: from, action: 'ExcessAttemptBoundary', event: { kind: 'bound' } }); continue; }
    for (const [action, event] of deliveryEvents) {
      const next = deliveryTransition(prior.state, event);
      const entering = event.kind === 'intent' && next !== prior.state && next.phase === 'unknown';
      const attempts = { ...prior.attempts };
      if (entering) attempts[event.action] = Math.min(3, (attempts[event.action] ?? 0) + 1);
      const resolutionValid = prior.state.phase === 'unknown' && event.action === prior.state.active && event.kind === 'resolve-absence'
        && event.valid === true && event.exact === true && event.absent === true && event.attemptMatches === true
        && (prior.attempts[event.action] ?? 0) === 1 && !(prior.resolutions[event.action] > 0);
      const resolutions = { ...prior.resolutions };
      if (resolutionValid && next.phase !== 'unknown') resolutions[event.action] = 1;
      const to = intern({
        state: next,
        checked: prior.checked || prior.state.phase === 'checking' && event.kind === 'check-result' && event.valid === true,
        reviewed: prior.reviewed || prior.state.phase === 'checked' && event.kind === 'review' && event.valid === true,
        scoped: prior.scoped || prior.state.phase === 'reviewed' && event.kind === 'ready' && event.valid === true,
        mergeAuthorized: prior.mergeAuthorized || prior.state.phase === 'pr-open' && event.kind === 'authorize-merge' && event.valid === true,
        attempts, resolutions,
        unsafe: prior.unsafe || entering && (!prior.checked || !prior.reviewed || !prior.scoped || !event.valid || event.action === 'merge' && !prior.mergeAuthorized),
        lostUnknown: prior.lostUnknown || prior.state.phase === 'unknown' && next.phase !== 'unknown'
          && !(event.kind === 'observe' && event.action === prior.state.active && event.exact === true && event.confirmed === true) && !resolutionValid,
        unconfirmedMerge: prior.unconfirmedMerge || next.phase === 'merged' && prior.state.phase !== 'merged'
          && !(event.kind === 'observe' && event.action === 'merge' && event.exact === true && event.confirmed === true),
      });
      edges.push({ from, to, action, event });
    }
    if (states.length > 5000) throw new Error('Delivery graph exceeds explicit 5000-state bound');
  }
  return { states, edges };
}

export function deliverySpec(graph) {
  const tuple = fn => `<<${graph.states.map(fn).join(', ')}>>`;
  const bool = value => value ? 'TRUE' : 'FALSE';
  const actions = [...new Set(graph.edges.map(row => row.action))];
  return `---- MODULE Delivery ----\nEXTENDS Naturals\nVARIABLE node\nUnsafe == ${tuple(row => bool(row.unsafe))}\nLostUnknown == ${tuple(row => bool(row.lostUnknown))}\nUnconfirmed == ${tuple(row => bool(row.unconfirmedMerge))}\nDuplicate == ${tuple(row => bool(Object.entries(row.attempts).some(([action,n]) => n > 1 + (row.resolutions[action] ?? 0))))}\nInit == node = 1\n${actions.map(action => `${action} ==\n${graph.edges.filter(row => row.action === action).map(row => `  \\/ /\\ node = ${row.from + 1} /\\ node' = ${row.to + 1}`).join('\n')}`).join('\n\n')}\nNext == ${actions.join(' \\/ ')}\nEffectSafe == ~Unsafe[node]\nUnknownPreserved == ~LostUnknown[node]\nMergeReadback == ~Unconfirmed[node]\nNoDuplicate == ~Duplicate[node]\n====\n`;
}
export const deliveryConfig = 'INIT Init\nNEXT Next\nINVARIANT EffectSafe\nINVARIANT UnknownPreserved\nINVARIANT MergeReadback\nINVARIANT NoDuplicate\n';
