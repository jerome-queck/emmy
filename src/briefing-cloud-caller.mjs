import { canonical, digest } from './content.mjs';
import { verifiedPriorBriefingFacts } from './morning.mjs';
import { retainBriefingResponse } from './briefing-acquisition.mjs';
export { retainBriefingInvocation, acquireBriefingSource, acquireBriefingPlanSource, awaitBriefingChecks } from './briefing-acquisition.mjs';
export { projectBriefingPage } from './briefing-source-normalization.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => canonical(a) === canonical(b);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2000;
export async function executeBriefingEffect(request, adapters) {
  const envelope = request?.envelope; const command = envelope?.action?.command;
  need(request?.schemaVersion === 1 && envelope?.action?.operation === 'morning' && ['send-intent', 'edit-intent', 'action-intent'].includes(command?.step), 'Exact existing morning effect intent required');
  need(request.pilotAuthority?.accepted === true && text(request.pilotAuthority.sourceRef) && request.pilotAuthority.environment === 'dot-cloud', 'Parent-supervised pilot authority required; implementation grants none');
  need(typeof adapters?.fleet === 'function' && typeof adapters.retainRaw === 'function', 'Actual existing fleet CLI/bridge adapter and durable raw sink required');
  if (command.step === 'action-intent' && command.action === 'archive' && typeof adapters.chatgpt?.edit !== 'function') {
    const status = await adapters.fleet({ schemaVersion: 1, responsibilityId: envelope.responsibilityId, expectedHead: envelope.expectedHead, action: { operation: 'status' }, evidence: [] });
    const view = status?.data ?? status; const run = view.state?.morningRuns?.find(row => row.id === command.runId); const item = run?.items.find(row => row.adapter === command.adapter && row.before.nativeId === command.nativeId);
    if (!run || !item || !verifiedPriorBriefingFacts(view.state, run, item)) return { status: 'deferred', effects: 0, reason: 'Same-message edits unavailable; new archive facts remain pending until a later run verifies exact prior delivery' };
  }
  const committed = await adapters.fleet(envelope);
  const state = committed?.data ?? committed;
  if (state.outcome !== 'morning-retained' || !/^[a-f0-9]{64}$/.test(envelope.expectedHead ?? '') || !/^[a-f0-9]{64}$/.test(state.headHash ?? '') || state.headHash === envelope.expectedHead) return { status: 'rediscover-only', effects: 0, reason: 'Repeated or unresolved journal publication never grants another effect' };
  const run = state.state?.morningRuns?.find(row => row.id === command.runId);
  need(run?.policyVersion === 3 && state.state.morningMigration && run.policy && same(run.deliveryTarget, run.policy.delivery), 'Accepted v3 migration and sole existing journal owner required');
  const scope = run.deliveryTarget.scope;
  need(scope.service === 'chatgpt' && scope.environment === 'dot-cloud' && scope.surface === 'native', 'Only configured ChatGPT room is authorized');
  let tool; let parameters;
  if (command.step === 'send-intent') {
    need(run.delivery?.status === 'uncertain' && run.delivery.sendRef === command.sendRef && run.sealed.bodyDigest === command.bodyDigest && digest(run.sealed.body) === command.bodyDigest, 'Committed exact send intent required');
    tool = adapters.chatgpt?.send; parameters = { channel: 'chatgpt', room: scope.resource, body: run.sealed.body, sendRef: command.sendRef };
  } else if (command.step === 'edit-intent') {
    need(run.summary?.delivery?.status === 'uncertain' && run.summary.delivery.editRef === command.editRef && run.delivery?.nativeId === command.nativeId && run.summary.bodyDigest === command.bodyDigest, 'Committed exact same-message edit intent required');
    tool = adapters.chatgpt?.edit; parameters = { channel: 'chatgpt', room: scope.resource, nativeId: command.nativeId, body: run.summary.body, editRef: command.editRef };
  } else {
    const item = run.items.find(row => row.adapter === command.adapter && row.before.nativeId === command.nativeId); const intent = item?.attempts.at(-1);
    need(intent?.status === 'uncertain' && same(intent.before, command.before) && intent.action === command.action && same(intent.destination, command.destination), 'Committed exact mail intent required');
    need(command.adapter !== 'outlook' || run.accounts.outlook && item.receipt.scope.environment === 'dot-cloud' && item.receipt.scope.surface === 'browser', 'School mail effects require cloud Outlook UI');
    tool = command.adapter === 'gmail' ? adapters.gmail?.move : adapters.outlookUI?.move;
    parameters = { account: run.accounts[command.adapter].account, nativeId: command.nativeId, before: command.before, action: command.action, destination: command.destination, preserveUnread: command.before.unread };
  }
  if (typeof tool !== 'function') return { status: 'unavailable', effects: 0, intent: 'uncertain', next: 'Reconcile exact intent before any retry; supported adapter unavailable' };
  try {
    const called = await tool(parameters);
    const retained = await retainBriefingResponse(called, { kind: command.step, runId: run.id, capturedAt: adapters.now() }, adapters);
    return { status: 'accepted-unverified', effects: 1, intent: 'uncertain', raw: retained.raw, response: retained.response, next: 'Independently reopen same exact native ID, retain raw bytes and acknowledge through existing fleet command' };
  } catch (error) {
    return { status: 'uncertain', effects: 'unknown', intent: 'uncertain', reason: error.message, next: 'Rediscover same retained identity; never repeat send or move' };
  }
}
