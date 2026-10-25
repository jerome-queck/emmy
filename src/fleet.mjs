import { morningEvidence, deliveryReadback as deliveryReadbackScope } from './morning.mjs';
import { link, mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { boundedFile, boundedJson } from './bounded-json.mjs';
import { canonical, digest, publishRecord, readStore, recordPayload, validateReferences } from './records.mjs';
import { actionInput, hash, insist, shape } from './fleet-schema.mjs';
import { fleetHistory, fleetInitial, fleetState, fleetTransition, fleetView } from './fleet-state.mjs';
import { authorityStatus, definitionHeads, effectKey, restoredState } from './work.mjs';

const epochOf = records => records.filter(record => record.type === 'epoch').sort((a, b) => a.restoredAt.localeCompare(b.restoredAt) || a.hash.localeCompare(b.hash)).at(-1) ?? null;
function scope(records, id, at) {
  const heads = definitionHeads(records.filter(record => record.type === 'definition' && record.id === id));
  insist(heads.length === 1, 'Fleet requires one current responsibility definition'); const definition = heads[0];
  insist(definition.lifecycle.status === 'active' && authorityStatus(definition, at).eligible, 'Fleet requires active exact scoped unexpired authority');
  const epoch = epochOf(records); const restore = restoredState(epoch, records.filter(record => record.type === 'observation' && record.responsibilityId === id), definition, at);
  return { definition, epoch, restore };
}
export function fleetSummary(records, id = null, at = new Date().toISOString()) {
  const ids = id ? records.some(record => record.type === 'fleet-root' && record.responsibilityId === id) ? [id] : [] : [...new Set(records.filter(record => record.type === 'fleet-root').map(record => record.responsibilityId))].sort();
  return ids.map(responsibilityId => {
    const view = fleetView(records, responsibilityId, at);
    try { const current = scope(records, responsibilityId, at); insist(!current.restore.suspended, 'Restored responsibility needs fresh epoch observations'); const root = fleetState(records, responsibilityId).root; insist(root && effectKey(current.definition) === root.effectKey, 'Fleet responsibility effect changed'); return view; }
    catch (error) { return { ...view, status: 'suspended', scopeError: error.message }; }
  });
}
export async function fleetPendingTurns(home, records) {
  const { readdir } = await import('node:fs/promises'); let names;
  try { names = await readdir(join(home, 'fleet-turns')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const pending = [];
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const turn = await boundedJson(join(home, 'fleet-turns', name), 4194304);
    const expected = recordPayload(turn.payload, Object.fromEntries(Object.entries(turn.files).map(([key, value]) => [key, Buffer.from(value, 'base64')])));
    if (!records.some(record => record.hash === expected.hash)) pending.push({ path: join(home, 'fleet-turns', name), requestDigest: turn.payload.requestDigest, nextAction: 'Repeat the exact retained input to finish this pure journal publication. Do not repeat a parent tool read.' });
  }
  return pending;
}
export async function fleet(home, { file }) {
  const input = await boundedJson(file, 1048576);
  shape(input, ['schemaVersion', 'responsibilityId', 'expectedHead', 'action', 'evidence'], 'fleet envelope');
  if (input.action?.operation === 'morning' && input.action.command?.step === 'open') insist(input.action.command.policyVersion === 2 && input.action.command.delivery && input.action.command.cleanupMode === 'batched-v1', 'New morning runs require current pinned policy and exact delivery target');
  if (input.action?.operation === 'group-send-intent') insist(input.action.delivery, 'New grouped sends require an exact authorized delivery target');
  insist(input.schemaVersion === 1 && typeof input.responsibilityId === 'string', 'Invalid fleet envelope'); actionInput(input.action);
  let { records } = await readStore(home); const at = new Date().toISOString();
  if (input.action.operation === 'status') return fleetSummary(records, input.responsibilityId, at)[0] ?? { status: 'unconfigured' };
  const current = scope(records, input.responsibilityId, at); const projected = fleetState(records, input.responsibilityId);
  insist(!current.restore.suspended, 'Fresh exact responsibility epoch observations are required');
  insist(projected.status === 'unconfigured' && input.action.operation === 'configure' || projected.status === 'ready', 'Fleet is unconfigured or has conflicting heads');
  if (projected.root) insist(effectKey(current.definition) === projected.root.effectKey, 'Fleet stable responsibility effect changed');
  if (input.action.operation === 'morning' && !['open', 'status'].includes(input.action.command.step)) insist(projected.state?.morningRuns?.find(run => run.id === input.action.command.runId)?.policyVersion === 2, 'Historical morning policy is replay-only; no new native effects');
  const history = projected.state?.archived ? fleetHistory(records, projected.head) : null;
  const evidence = input.evidence ?? []; insist(Array.isArray(evidence) && evidence.length <= 64, 'Invalid fleet evidence bound');
  const files = {}; let totalBytes = 0;
  for (const [index, ref] of evidence.entries()) {
    shape(ref, ['path', 'sha256', 'sourceRef'], 'fleet evidence'); insist(isAbsolute(ref.path ?? '') && hash(ref.sha256) && typeof ref.sourceRef === 'string', 'Invalid fleet evidence reference');
    const bytes = await boundedFile(ref.path); insist(digest(bytes) === ref.sha256, 'Fleet receipt bytes differ'); totalBytes += bytes.length; insist(totalBytes <= 1048576, 'Fleet total evidence exceeds bound'); files[`evidence-${index}.bin`] = bytes;
  }
  const morning = input.action.operation === 'morning' ? morningEvidence(input.action.command) : { receipts: [], refs: [] };
  const receipts = [...morning.receipts, ...(input.action.captures ?? []).map(capture => capture.receipt), ...(input.action.receipt ? [input.action.receipt] : [])];
  for (const receipt of receipts) insist(evidence.some(ref => ref.sourceRef === receipt.sourceRef && ref.sha256 === receipt.sha256), 'Every receipt requires exact retained bytes and source attribution');
  for (const capture of input.action.captures ?? []) if (capture.actualDigest) insist(evidence.some(ref => ref.sha256 === capture.actualDigest), 'Actual source digest requires retained matching artifact bytes');
  if (input.action.delivery) insist(evidence.some(ref => ref.sourceRef === input.action.delivery.ownerRef), 'Delivery target requires retained owner authority bytes');
  for (const sourceRef of morning.refs) insist(evidence.some(ref => ref.sourceRef === sourceRef), 'Missing attributable morning owner/readback source');
  for (const key of ['sourceRef', 'readbackRef']) if (input.action[key]) insist(evidence.some(ref => ref.sourceRef === input.action[key]), `Missing attributable ${key} evidence`);
  if (['send-intent', 'group-send-intent'].includes(input.action.operation)) insist(evidence.some(ref => ref.sha256 === input.action.bodyDigest), 'Send intent requires the exact message body bytes');
  const deliveryReadback = input.action.operation === 'group-send-ack' ? input.action : input.action.operation === 'morning' && ['send-ack', 'edit-ack', 'edit-resolve'].includes(input.action.command.step) ? { ...input.action.command, sendRef: input.action.command.sendRef ?? input.action.command.editRef } : null;
  if (deliveryReadback) {
    const index = evidence.findIndex(ref => ref.sourceRef === deliveryReadback.readbackRef); let readback;
    try { readback = JSON.parse(files[`evidence-${index}.bin`].toString('utf8')); } catch { throw new Error('Delivery readback requires retained normalized JSON with nativeId, sendRef and exact body'); }
    const run = input.action.operation === 'morning' ? projected.state?.morningRuns?.find(row => row.id === input.action.command.runId) : null;
    const group = input.action.operation === 'group-send-ack' ? projected.state?.deliveryGroups?.find(row => row.sendRef === input.action.sendRef) : null;
    const pending = group ? { scope: group.delivery?.scope, at: group.at } : ['edit-ack', 'edit-resolve'].includes(deliveryReadback.step) ? run?.summary?.delivery : run?.delivery;
    deliveryReadbackScope(deliveryReadback, pending, at);
    insist(canonical(readback.scope) === canonical(deliveryReadback.scope) && readback.acquiredAt === deliveryReadback.acquiredAt, 'Retained readback destination or acquisition time differs');
    insist(readback.nativeId === deliveryReadback.nativeId && readback.sendRef === deliveryReadback.sendRef && typeof readback.body === 'string' && digest(readback.body) === (deliveryReadback.step === 'edit-resolve' ? deliveryReadback.priorBodyDigest : deliveryReadback.bodyDigest), 'Retained delivery readback differs from exact native ID, send or body');
  }
  const noEffect = input.action.operation === 'group-send-resolve' ? input.action : input.action.operation === 'morning' && input.action.command.step === 'send-resolve' ? input.action.command : null;
  if (noEffect) {
    const group = input.action.operation === 'group-send-resolve' ? projected.state?.deliveryGroups?.find(row => row.sendRef === noEffect.sendRef) : null;
    const pending = group ? { scope: group.delivery?.scope, at: group.at } : projected.state?.morningRuns?.find(row => row.id === input.action.command.runId)?.delivery;
    deliveryReadbackScope(noEffect, pending, at);
    const index = evidence.findIndex(ref => ref.sourceRef === noEffect.sourceRef); let readback;
    try { readback = JSON.parse(files[`evidence-${index}.bin`].toString('utf8')); } catch { throw new Error('No-effect resolution requires actual retained scoped discovery JSON'); }
    insist(readback.sendRef === noEffect.sendRef && readback.bodyDigest === noEffect.bodyDigest && readback.outcome === 'known-unexecuted' && readback.acquiredAt === noEffect.acquiredAt && canonical(readback.scope) === canonical(noEffect.scope) && readback.coverage?.complete === true && Array.isArray(readback.coverage.gaps) && readback.coverage.gaps.length === 0, 'No-effect readback must bind exact send/body, current destination and complete discovery');
  }
  if (input.action.operation === 'morning') {
    const command = input.action.command;
    if (command.step === 'review') for (const item of command.items) insist(evidence.some(ref => ref.sha256 === item.context.threadDigest), 'Inspected thread context requires exact retained artifact bytes');
    if (['send-intent', 'edit-intent'].includes(command.step)) insist(evidence.some(ref => ref.sha256 === command.bodyDigest), 'Morning send intent requires exact retained body bytes');
    if (command.step === 'seal') for (const acceptance of [command.briefing, command.calendar]) {
      const index = evidence.findIndex(ref => ref.sha256 === acceptance.receipt.sha256 && ref.sourceRef === acceptance.receipt.sourceRef);
      let raw; try { raw = JSON.parse(files[`evidence-${index}.bin`].toString('utf8')); } catch { throw new Error('Morning assessment receipt must retain its actual JSON result bytes'); }
      insist(canonical(raw.data ?? raw) === canonical(acceptance.result), 'Morning assessment result differs from retained receipt bytes');
      const inputIndex = evidence.findIndex(ref => ref.sha256 === acceptance.inputReceipt.sha256 && ref.sourceRef === acceptance.inputReceipt.sourceRef);
      let assessedInput; try { assessedInput = JSON.parse(files[`evidence-${inputIndex}.bin`].toString('utf8')); } catch { throw new Error('Assessment requires original retained input JSON'); }
      insist(canonical(assessedInput) === canonical(acceptance.input), 'Assessment input differs from retained bytes');
      if (acceptance.assessmentReceipt) {
        const receiptIndex = evidence.findIndex(ref => ref.sha256 === acceptance.assessmentReceipt.sha256 && ref.sourceRef === acceptance.assessmentReceipt.sourceRef);
        let generated; try { generated = JSON.parse(files[`evidence-${receiptIndex}.bin`].toString('utf8')); } catch { throw new Error('Briefing requires actual retained generated receipt JSON'); }
        insist(canonical(generated) === canonical(acceptance.assessment), 'Generated briefing receipt differs from retained bytes');
      }
    }
  }
  if (['result', 'resolve'].includes(input.action.operation)) { const job = projected.state?.jobs.find(job => job.key === input.action.jobKey) ?? history?.jobs.get(input.action.jobKey); insist(job && totalBytes <= job.input.maxBytes && totalBytes <= input.action.usage.bytes, 'Parent result exceeds admitted or declared byte budget'); }
  const requestDigest = digest({ responsibilityId: input.responsibilityId, expectedHead: input.expectedHead ?? null, action: input.action, evidence: evidence.map(ref => ({ sha256: ref.sha256, sourceRef: ref.sourceRef })) });
  const prior = records.find(record => record.type.startsWith('fleet-') && record.requestDigest === requestDigest);
  if (prior) return { ...fleetSummary(records, input.responsibilityId, at)[0], outcome: 'coalesced', ticket: null, nextAction: 'Inspect retained results. A repeated command is not permission to repeat a parent read or send.' };
  if (projected.root) {
    insist(hash(input.expectedHead) && input.expectedHead === projected.head.hash, 'Fleet head changed. Read status and reconcile before retry.');
    insist(projected.state.epochHash === (current.epoch?.hash ?? null) || input.action.operation === 'resume', 'Restored fleet requires explicit resume');
    insist(input.action.operation !== 'configure', 'Fleet is already configured');
  } else insist(input.expectedHead === undefined && !records.some(record => record.type === 'fleet-root'), 'Only one cooperative fleet controller per private home');
  const transitioned = projected.root ? fleetTransition(projected.state, input.action, projected.root, at, current.epoch?.hash ?? null, history) : null;
  const payload = { schemaVersion: 1, type: projected.root ? 'fleet-step' : 'fleet-root', responsibilityId: input.responsibilityId, definitionHash: current.definition.hash, effectKey: effectKey(current.definition), epochHash: current.epoch?.hash ?? null, at, requestDigest, action: input.action, ...(projected.root ? { rootHash: projected.root.hash, parentHash: projected.head.hash, seq: (projected.head.seq ?? 0) + 1, state: transitioned.state, outcome: transitioned.outcome } : {}) };
  if (!projected.root) fleetInitial(payload);
  const turnPath = join(home, 'fleet-turns', `${projected.head?.hash ?? 'configure'}.json`); await mkdir(join(home, 'fleet-turns'), { recursive: true });
  const temporary = join(home, 'fleet-turns', `.pending-${randomUUID()}`);
  const intent = canonical({ payload, files: Object.fromEntries(Object.entries(files).map(([key, bytes]) => [key, bytes.toString('base64')])) });
  insist(Buffer.byteLength(intent) <= 4194304, 'Fleet journal intent exceeds byte bound. No intent was published.'); await writeFile(temporary, intent, { flag: 'wx' });
  let claimed = true;
  try { await link(temporary, turnPath); } catch (error) { if (error.code !== 'EEXIST') throw error; claimed = false; } finally { await rm(temporary, { force: true }); }
  const turn = await boundedJson(turnPath, 4194304); insist(turn.payload.requestDigest === requestDigest, 'Another retained journal turn owns this head. Finish its exact input before another operation.');
  const retainedFiles = Object.fromEntries(Object.entries(turn.files).map(([key, bytes]) => [key, Buffer.from(bytes, 'base64')]));
  ({ records } = await readStore(home)); const live = scope(records, input.responsibilityId, new Date().toISOString()); insist(!live.restore.suspended && live.definition.hash === current.definition.hash, 'Responsibility changed before publication');
  const prepared = recordPayload(turn.payload, retainedFiles); validateReferences([...records, prepared]); await publishRecord(home, turn.payload, retainedFiles);
  ({ records } = await readStore(home)); const view = fleetSummary(records, input.responsibilityId, new Date().toISOString())[0];
  const admitted = claimed && transitioned?.outcome === 'admitted' && view.status !== 'suspended' && Date.now() <= Date.parse(transitioned.ticket.deadline) ? transitioned.ticket : null;
  return { ...view, outcome: claimed ? transitioned?.outcome ?? 'configured' : 'reconciled-publication', ticket: admitted, nextAction: admitted ? 'Parent retains this ticket, performs its declared bounded read once, then supplies an attributable result. Lost responses require reconciliation.' : 'Inspect current state. No parent read or message was executed by this command.' };
}
