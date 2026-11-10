import { planningCases, evaluateCase } from './domain.mjs';

export function planningGraph(modules) {
  const states = [{ phase: 'awaiting', accepted: false, shouldRefuse: false, shouldAccept: false, roundedWrong: false, selectionWrong: false }];
  const edges = [];
  for (const row of planningCases()) {
    const from = states.length;
    states.push({ phase: 'supplied', case: row, accepted: false, shouldRefuse: false, shouldAccept: false, roundedWrong: false, selectionWrong: false });
    edges.push({ from: 0, to: from, action: 'SupplyContext' });
    const assessed = evaluateCase(modules, row);
    const expected = row.rounding ? Math.floor((row.rounding.actual + 29) / 30) * 30 : null;
    const roundedWrong = assessed.ready && expected !== null && (assessed.booking?.scheduledDurationMinutes !== expected || row.rounding.scheduled !== expected);
    const selected = assessed.resolution?.selected?.map(value => value.revision);
    states.push({ phase: assessed.ready ? 'accepted' : 'refused', case: row, assessed, accepted: assessed.ready, shouldRefuse: !row.expected, shouldAccept: row.expected, roundedWrong, selectionWrong: assessed.ready && row.revisions && JSON.stringify(selected) !== JSON.stringify(row.revisions) || false });
    edges.push({ from, to: from + 1, action: 'AssessPolicy' });
    edges.push({ from: from + 1, to: from + 1, action: 'RetainResult' });
  }
  return { states, edges };
}

export function planningSpec(graph) {
  const tuple = values => `<<${values.join(', ')}>>`;
  const bools = key => tuple(graph.states.map(row => row[key] ? 'TRUE' : 'FALSE'));
  const actions = [...new Set(graph.edges.map(row => row.action))];
  return `---- MODULE PlanningPolicy ----\nEXTENDS Naturals\nVARIABLE node\nAccepted == ${bools('accepted')}\nShouldRefuse == ${bools('shouldRefuse')}\nShouldAccept == ${bools('shouldAccept')}\nRoundedWrong == ${bools('roundedWrong')}\nSelectionWrong == ${bools('selectionWrong')}\nInit == node = 1\n${actions.map(action => `${action} ==\n${graph.edges.filter(row => row.action === action).map(row => `  \\/ /\\ node = ${row.from + 1} /\\ node' = ${row.to + 1}`).join('\n')}`).join('\n\n')}\nNext == ${actions.join(' \\/ ')}\nResolvedAdmission == ~(Accepted[node] /\\ ShouldRefuse[node])\nViableAdmission == ShouldAccept[node] => Accepted[node]\nRoundedExact == ~RoundedWrong[node]\nScopedSelection == ~SelectionWrong[node]\n====\n`;
}
export const planningConfig = 'INIT Init\nNEXT Next\nINVARIANT ResolvedAdmission\nINVARIANT ViableAdmission\nINVARIANT RoundedExact\nINVARIANT ScopedSelection\n';
