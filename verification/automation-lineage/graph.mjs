import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item);
const copy = value => structuredClone(value);
const slot = time => `slot-${hash(canonical(['sample-briefing', 'daily-briefing', time]))}`;
const scheduledFor = '2026-11-03T00:00:00.000Z';
const binding = { scheduledFor, occurrenceKey: slot(scheduledFor), observationDueAt: '2026-11-03T01:00:00.000Z', nominalSlotEvidenceRef: 'synthetic-slot', observedAt: '2026-11-02T23:00:00.000Z', validThrough: '2026-11-04T00:00:00.000Z' };
const initial = { action: 'producer', namespace: 'sample-briefing', automationId: 'daily-briefing', invocation: { id: 'run-123', source: 'producer-generated' }, origin: 'scheduled', binding, predecessorChain: [], at: '2026-11-03T00:01:00.000Z', execution: 'running', coverage: 'partial', availability: 'available', summary: 'Synthetic bounded work.', artifactLinks: [], sourceWindow: null, sourceEvidence: { observedAt: null, recordedAt: null }, timing: null, telemetry: null, evidenceRefs: [] };
export const rules = ['InitialExact', 'ChainExact', 'OccurrenceTerminal', 'NullTerminal'];
const good = () => Object.fromEntries(rules.map(x => [x, true]));
export const limits = { nodes: 40, edges: 39, depth: 4, suppliedRuns: 3 };
const choices = path => {
  const p = path.join('/');
  if (!p) return ['start', 'early'];
  if (p === 'start') return ['terminal', 'foreign', 'missing-binding', 'expired', 'moved'];
  if (p === 'start/terminal') return ['extend', 'missing-first', 'wrong-digest', 'wrong-revision', 'terminal-change'];
  if (p === 'start/terminal/extend') return ['gap', 'historical-occurrence', 'historical-terminal'];
  if (p === 'early') return ['attach'];
  return [];
};
export function inputFor(state, choice) {
  const input = copy(initial); const chain = copy(state.chain);
  input.predecessorChain = chain; input.at = '2026-11-03T01:02:00.000Z'; input.execution = 'completed';
  if (choice === 'start') { input.predecessorChain = []; input.at = initial.at; input.execution = 'running'; }
  if (choice === 'early') { input.predecessorChain = []; input.at = '2026-11-02T23:59:00.000Z'; }
  if (choice === 'terminal') input.at = '2026-11-03T01:00:00.000Z';
  if (choice === 'extend') { input.at = '2026-11-03T01:01:00.000Z'; input.summary = 'Changed synthetic metadata.'; }
  if (choice === 'foreign') chain[0].key = 'other-run';
  if (choice === 'missing-first') input.predecessorChain = [chain[1]];
  if (choice === 'wrong-digest') chain[1].previous = 'a'.repeat(64);
  if (choice === 'wrong-revision') chain[1].revision = 3;
  if (choice === 'gap') input.predecessorChain = [chain[0], chain[2]];
  if (choice === 'historical-occurrence') { chain[1].data.occurrenceKey = 'other-slot'; chain[2].previous = hash(canonical(chain[1])); }
  if (choice === 'historical-terminal') { chain[1].data.execution = 'failed'; chain[1].data.report.status = 'failed'; chain[2].previous = hash(canonical(chain[1])); }
  if (choice === 'terminal-change') input.execution = 'failed';
  if (choice === 'missing-binding') input.binding = null;
  if (choice === 'expired') input.binding.validThrough = '2026-11-03T01:01:59.000Z';
  if (choice === 'moved') { input.binding.scheduledFor = '2026-11-03T02:00:00.000Z'; input.binding.occurrenceKey = slot(input.binding.scheduledFor); input.binding.observationDueAt = '2026-11-03T03:00:00.000Z'; }
  return input;
}
const refusals = { foreign: ['ChainExact', 'Own exact run predecessor required'], 'missing-first': ['ChainExact', 'Incomplete or conflicting own predecessor chain'], 'wrong-digest': ['ChainExact', 'Incomplete or conflicting own predecessor chain'], 'wrong-revision': ['ChainExact', 'Incomplete or conflicting own predecessor chain'], gap: ['ChainExact', 'Incomplete or conflicting own predecessor chain'], 'historical-occurrence': ['OccurrenceTerminal', 'Predecessor occurrence or terminal execution changed'], 'historical-terminal': ['OccurrenceTerminal', 'Predecessor occurrence or terminal execution changed'], 'terminal-change': ['OccurrenceTerminal', 'Invocation occurrence or terminal execution is immutable'], 'missing-binding': ['OccurrenceTerminal', 'Invocation occurrence or terminal execution is immutable'], expired: ['OccurrenceTerminal', 'Invocation occurrence or terminal execution is immutable'], moved: ['OccurrenceTerminal', 'Invocation occurrence or terminal execution is immutable'], attach: ['NullTerminal', 'Retrospective attachment to terminal report:null is not authorized'] };
export function step(api, state, choice) {
  const input = inputFor(state, choice), before = copy(input), checks = good(); let output, error;
  try { output = api.assessAutomationReporting(input); } catch (e) { error = e.message; }
  assert.deepEqual(input, before, 'input or prior evidence mutated');
  const expected = refusals[choice];
  if (expected) {
    if (error && error !== expected[1]) throw new Error(`${choice}: unexpected refusal ${error}`);
    checks[expected[0]] = error === expected[1];
  } else if (error) throw new Error(`${choice}: unexpected exception ${error}`);
  if (output) {
    assert.equal(output.effectsAuthorized, false); assert.equal(output.publication, 'unverified'); assert.equal(output.delivery, 'unverified');
    for (const artifact of output.artifacts) {
      assert.equal(artifact.bytes, `${canonical(artifact.record)}\n`); assert.equal(artifact.id, hash(canonical(artifact.record))); assert.equal(artifact.byteSha256, hash(artifact.bytes)); assert.equal(artifact.byteCount, Buffer.byteLength(artifact.bytes)); assert.equal(artifact.filename, `${artifact.id}.json`);
    }
    if (!expected) {
      const record = output.artifacts.at(-1).record, prior = state.chain.at(-1);
      if (choice === 'start' || choice === 'early') checks.InitialExact = output.artifacts.length === 2 && output.artifacts[0].record.kind === 'occurrence' && output.artifacts[0].record.key === binding.occurrenceKey && output.artifacts[0].record.data.scheduledFor === binding.scheduledFor && output.artifacts[0].record.data.expiresAt === binding.observationDueAt && record.kind === 'run' && record.namespace === input.namespace && record.automationId === input.automationId && record.key === input.invocation.id && record.recordedAt === input.at && record.revision === 0 && record.previous === null && record.data.occurrenceKey === binding.occurrenceKey && (choice !== 'start' || record.data.execution === 'running' && record.data.report === null);
      else checks.ChainExact = output.artifacts.length === 1 && record.revision === prior.revision + 1 && record.previous === hash(canonical(prior)) && record.data.occurrenceKey === prior.data.occurrenceKey;
      if (choice === 'terminal' || choice === 'extend') checks.OccurrenceTerminal = record.data.execution === 'completed' && record.data.report?.status === 'completed' && record.data.report.summary === input.summary;
      if (choice === 'early') checks.NullTerminal = record.data.execution === 'completed' && record.data.report === null;
    }
  }
  return { input: before, output: output ?? null, error: error ?? null, chain: output && !expected ? [...state.chain, output.artifacts.at(-1).record] : copy(state.chain), rules: checks, path: [...state.path, choice] };
}
export function graph(api) {
  const states = [{ chain: [], path: [], rules: good() }], edges = [], frontier = [0];
  while (frontier.length) {
    const from = frontier.shift(), state = states[from];
    for (const choice of choices(state.path)) {
      const next = step(api, state, choice), to = states.length;
      assert.ok(next.path.length <= limits.depth && next.chain.length <= limits.suppliedRuns);
      states.push(next); edges.push({ from, to, choice });
      assert.ok(states.length <= limits.nodes && edges.length <= limits.edges, 'graph bound exceeded');
      if (Object.values(next.rules).every(Boolean) && !refusals[choice]) frontier.push(to);
    }
  }
  return { states, edges, limits };
}
export function spec(g) {
  const successors = g.states.map(() => []); for (const e of g.edges) successors[e.from].push(e.to + 1);
  return `---- MODULE AutomationLineage ----\nEXTENDS Naturals, Sequences\nVARIABLE node\nSuccessors == <<${successors.map((s, i) => `{${(s.length ? s : [i + 1]).join(',')}}`).join(',')}>>\nInit == node = 1\nStep == node' \\in Successors[node]\nNext == Step\n${rules.map(rule => `${rule} == node \\notin {${g.states.flatMap((s, i) => s.rules[rule] ? [] : [i + 1]).join(',')}}`).join('\n')}\n====\n`;
}
export const cfg = `INIT Init\nNEXT Next\n${rules.map(x => `INVARIANT ${x}`).join('\n')}\n`;
