import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { history, fixtures, evaluate } from './graph.mjs';

const [directory] = process.argv.slice(2); assert.ok(directory && process.argv.length === 3, 'Pass one retained run directory');
const names = ['work', 'records', 'responsibilities'];
const cases = ['epoch', 'missing-category', 'supersession', 'expiry', 'local-provenance', 'reconcile-gate'];
const output = [];
for (const name of cases) {
  const modules = Object.fromEntries(await Promise.all(names.map(async n => [n, await import(pathToFileURL(join(directory, `source-${name}`, `${n}.mjs`)).href)])));
  const graph = history(modules); const report = await readFile(join(directory, name, 'statechart/report.md'), 'utf8');
  for (const section of report.split(/(?=^## )/m).filter(text => /^## \w+ breaks/m.test(text))) {
    const rule = section.match(/^## (\w+) breaks/m)[1]; const actions = [...section.matchAll(/^\d+\. (\w+): /gm)].map(m => m[1]);
    assert.ok(actions.length, `${name} ${rule} path`); let index = 0; const steps = [];
    for (const action of actions) {
      const choices = graph.edges.filter(e => e.from === index && e.action === action); assert.equal(choices.length, 1, `unique ${name} ${rule} ${action}`);
      index = choices[0].to; const node = graph.nodes[index];
      if (node.result) assert.deepEqual(evaluate(modules, fixtures(modules.records), node.state), node.result, 'actual broken-source replay');
      steps.push({ action, state: node.state, result: node.result });
    }
    const { state, result } = graph.nodes[index]; assert.ok(result && !result.restored.suspended || rule === 'ReconcileGate');
    const harm = { EpochEvidence: () => state.masks[state.epoch] !== 15, CurrentEvidence: () => state.revocations[state.epoch] === 1, FreshEvidence: () => state.expired, CategoryEvidence: () => state.fault?.generation === state.epoch, ReconcileGate: () => result.restored.suspended && result.proposals.length > 0 };
    assert.ok(harm[rule](), `intended ${rule} harm`); output.push({ name, rule, steps });
  }
}
await writeFile(join(directory, 'statechart-replays.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ status: 'passed', paths: output.length, evidence: join(directory, 'statechart-replays.json') }));
