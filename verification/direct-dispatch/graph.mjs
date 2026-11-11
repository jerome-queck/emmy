import { cases, evaluateCase } from './domain.mjs';

export const rules = ['AuthorityHeld', 'ProvenanceHeld', 'HistoryHeld', 'RouteHeld', 'ViableRoute'];
export function dispatchGraph(modules) {
  const states = [{ phase: 'awaiting' }]; const edges = [];
  for (const test of cases) {
    const from = states.length;
    states.push({ phase: 'supplied', case: test.name });
    edges.push({ from: 0, to: from, action: 'SupplyEvidence' });
    const assessed = evaluateCase(modules, test);
    states.push({ phase: 'assessed', case: test.name, rule: test.rule, expected: test.expected, assessed, disagrees: assessed.next !== test.expected });
    edges.push({ from, to: from + 1, action: 'AssessDispatch' });
    edges.push({ from: from + 1, to: from + 1, action: 'RetainResult' });
  }
  return { states, edges };
}

export function dispatchSpec(graph) {
  const tuple = values => `<<${values.join(', ')}>>`;
  const actions = [...new Set(graph.edges.map(row => row.action))];
  return `---- MODULE DirectDispatch ----\nEXTENDS Naturals\nVARIABLE node\nInit == node = 1\n${rules.map(rule => `${rule} == ~${tuple(graph.states.map(row => row.rule === rule && row.disagrees ? 'TRUE' : 'FALSE'))}[node]`).join('\n')}\n${actions.map(action => `${action} ==\n${graph.edges.filter(row => row.action === action).map(row => `  \\/ /\\ node = ${row.from + 1} /\\ node' = ${row.to + 1}`).join('\n')}`).join('\n\n')}\nNext == ${actions.join(' \\/ ')}\n====\n`;
}
export const dispatchConfig = `INIT Init\nNEXT Next\n${rules.map(rule => `INVARIANT ${rule}\n`).join('')}`;
