import { canonical } from '../../src/content.mjs';

export function assuranceGraph({ beginAssurance, assuranceTransition, assurancePlan }) {
  const states = []; const edges = []; const ids = new Map();
  const intern = value => {
    const key = canonical(value);
    if (!ids.has(key)) { ids.set(key, states.length); states.push(value); }
    return ids.get(key);
  };
  intern({ state: beginAssurance('same'), bad: false, refusalBroken: false });
  for (let from = 0; from < states.length; from++) {
    const previous = states[from]; const state = previous.state;
    const expected = assurancePlan[state.completed]?.id ?? 'after-last';
    const started = { kind: 'start', id: expected, contextDigest: 'same' };
    const finished = { kind: 'finish', id: state.active ?? expected, contextDigest: 'same', code: 0, signal: null, error: null, evidenceValid: true };
    const events = [
      ['StartNext', started], ['WrongSuite', { ...started, id: 'wrong-suite' }],
      ['StartChangedContext', { ...started, contextDigest: 'different' }],
      ['SuitePass', finished], ['SuiteFail', { ...finished, code: 1 }],
      ['FinishChangedContext', { ...finished, contextDigest: 'different' }],
      ['SuiteSignal', { ...finished, signal: 'SIGTERM' }], ['SpawnError', { ...finished, error: 'ENOENT' }],
      ['OutputChanges', { ...finished, evidenceValid: false }],
      ['Inspect', { kind: 'inspect', contextDigest: 'same' }],
      ['SourceChanges', { kind: 'inspect', contextDigest: 'different' }],
    ];
    for (const [action, event] of events) {
      const illicit = event.contextDigest !== 'same' || event.kind === 'start' && (state.phase !== 'prepared' || event.id !== expected) || event.kind === 'finish' && (state.phase !== 'running' || event.id !== state.active || event.code !== 0 || event.signal !== null || event.error !== null || !event.evidenceValid);
      const next = assuranceTransition(state, event);
      const to = intern({ state: next, bad: previous.bad || illicit, refusalBroken: previous.refusalBroken || state.phase === 'refused' && next.phase !== 'refused' });
      edges.push({ from, to, action, event });
    }
    if (states.length > 5000) throw new Error('Assurance graph exceeds explicit 5000-state bound');
  }
  return { states, edges, suiteCount: assurancePlan.length };
}

export function graphSpec(graph) {
  const tuple = values => `<<${values.join(', ')}>>`;
  const actions = [...new Set(graph.edges.map(row => row.action))];
  const definitions = actions.map(action => `${action} ==\n${graph.edges.filter(row => row.action === action).map(row => `  \\/ /\\ node = ${row.from + 1} /\\ node' = ${row.to + 1}`).join('\n')}`).join('\n\n');
  return `---- MODULE Assurance ----\nEXTENDS Naturals\nVARIABLE node\nPhase == ${tuple(graph.states.map(row => JSON.stringify(row.state.phase)))}\nCompleted == ${tuple(graph.states.map(row => row.state.completed))}\nBad == ${tuple(graph.states.map(row => row.bad ? 'TRUE' : 'FALSE'))}\nRefusalBroken == ${tuple(graph.states.map(row => row.refusalBroken ? 'TRUE' : 'FALSE'))}\nInit == node = 1\n${definitions}\nNext == ${actions.join(' \\/ ')}\nPassedComplete == Phase[node] = "passed" => Completed[node] = ${graph.suiteCount}\nPassedClean == Phase[node] = "passed" => ~Bad[node]\nRefusalTerminal == ~RefusalBroken[node]\n====\n`;
}

export const graphConfig = 'INIT Init\nNEXT Next\nINVARIANT PassedComplete\nINVARIANT PassedClean\nINVARIANT RefusalTerminal\n';
