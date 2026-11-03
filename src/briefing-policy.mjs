import { canonical, digest } from './records.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2000 && !/[\x00-\x1f\x7f]/.test(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const array = (value, limit = 128) => Array.isArray(value) && value.length <= limit;
const purposes = ['invoice', 'receipt', 'statement', 'notice', 'other'];
const actions = ['keep', 'archive', 'trash'];
function shape(value, fields) { need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), `Policy members must be ${fields.join(', ')}`); }
function authority(value) { shape(value, ['sourceRef', 'date', 'scope']); need(text(value.sourceRef) && /^\d{4}-\d\d-\d\d$/.test(value.date) && text(value.scope), 'Narrow dated owner provenance required'); }
function match(value, exact = false) {
  shape(value, ['adapter', 'nativeId', 'threadId', 'sender', 'subject', 'category']);
  need(['gmail', 'outlook', 'either'].includes(value.adapter), 'Invalid rule adapter');
  for (const key of ['nativeId', 'threadId', 'sender', 'subject', 'category']) need(value[key] === null || text(value[key]), 'Invalid rule selector');
  need(Object.entries(value).some(([key, val]) => key !== 'adapter' && val !== null), 'Empty mail selector');
  if (exact) need(value.nativeId !== null || value.threadId !== null && value.sender !== null && value.subject !== null, 'Exact exception needs a native ID or exact thread/sender/subject');
}
export function validateBriefingPolicy(policy) {
  shape(policy, ['schemaVersion', 'version', 'authority', 'accounts', 'delivery', 'exceptions', 'rules', 'unboundExceptions', 'dismissedObligations', 'learning']);
  need(policy.schemaVersion === 3 && text(policy.version), 'Versioned briefing policy v3 required'); authority(policy.authority);
  shape(policy.accounts, ['gmail', 'outlook']);
  for (const adapter of ['gmail', 'outlook']) { shape(policy.accounts[adapter], ['account', 'entityId']); need(text(policy.accounts[adapter].account) && text(policy.accounts[adapter].entityId), 'Exact primary accounts required'); }
  need(policy.accounts.gmail.account !== policy.accounts.outlook.account, 'Mailbox identities must differ');
  shape(policy.delivery, ['scope', 'ownerRef']); shape(policy.delivery.scope, ['service', 'account', 'environment', 'surface', 'resource']);
  need(policy.delivery.scope.service === 'chatgpt' && policy.delivery.scope.surface === 'native' && policy.delivery.scope.environment === 'dot-cloud' && Object.values(policy.delivery.scope).every(text) && text(policy.delivery.ownerRef), 'Only owner-bound cloud ChatGPT delivery supported');
  for (const key of ['exceptions', 'rules']) {
    need(array(policy[key]) && new Set(policy[key].map(row => row.id)).size === policy[key].length, 'Bounded unique policy rules required');
    for (const rule of policy[key]) {
      shape(rule, ['id', 'match', 'action', 'requiresFacts', 'overrideProtected', 'authority']);
      need(text(rule.id) && actions.includes(rule.action) && typeof rule.requiresFacts === 'boolean' && typeof rule.overrideProtected === 'boolean', 'Invalid rule disposition');
      authority(rule.authority); match(rule.match, key === 'exceptions');
      need(key === 'exceptions' || !rule.overrideProtected || rule.id === 'paypal-nonreceipt' || rule.id === 'blackboard-notifications', 'Broad protected-context override refused');
    }
  }
  need(array(policy.unboundExceptions) && policy.unboundExceptions.every(row => { shape(row, ['id', 'description', 'action', 'authority']); authority(row.authority); return text(row.id) && text(row.description) && actions.includes(row.action); }), 'Invalid unbound exceptions');
  need(array(policy.dismissedObligations) && policy.dismissedObligations.every(text), 'Invalid dismissed obligations');
  shape(policy.learning, ['minimumIndependentObservations', 'excludeActors', 'forbiddenBroadening']);
  need(Number.isSafeInteger(policy.learning.minimumIndependentObservations) && policy.learning.minimumIndependentObservations >= 2 && array(policy.learning.excludeActors) && policy.learning.excludeActors.every(text) && array(policy.learning.forbiddenBroadening) && policy.learning.forbiddenBroadening.includes('serious-security') && policy.learning.forbiddenBroadening.includes('financial'), 'Learning requires repeated independent low-risk evidence');
  return policy;
}
export function briefingPolicyDigest(policy) { validateBriefingPolicy(policy); return digest(policy); }
export function validatePolicyEvidence(evidence) {
  if (evidence === undefined) return { recordPurpose: 'other', duplicate: null, priorFactsDelivery: null };
  shape(evidence, ['recordPurpose', 'duplicate', 'priorFactsDelivery']); need(purposes.includes(evidence.recordPurpose), 'Unknown record purpose');
  if (evidence.duplicate !== null) {
    shape(evidence.duplicate, ['nativeId', 'recordPurpose', 'contentSha256', 'copySha256', 'contentBase64', 'copyBase64', 'verified', 'sourceRef', 'currentCaptureSha256', 'copyCaptureSha256', 'currentMessagePointer', 'copyMessagePointer', 'contentPointer', 'copyContentPointer']);
    need(text(evidence.duplicate.nativeId) && purposes.includes(evidence.duplicate.recordPurpose) && sha(evidence.duplicate.contentSha256) && sha(evidence.duplicate.copySha256) && typeof evidence.duplicate.verified === 'boolean' && text(evidence.duplicate.sourceRef), 'Duplicate proof requires exact identities, purpose and bytes');
    for (const [field, hashField] of [['contentBase64', 'contentSha256'], ['copyBase64', 'copySha256']]) {
      const encoded = evidence.duplicate[field];
      need(typeof encoded === 'string' && encoded.length > 0 && encoded.length <= 349528 && Buffer.from(encoded, 'base64').toString('base64') === encoded && digest(Buffer.from(encoded, 'base64')) === evidence.duplicate[hashField], 'Duplicate hashes must bind retained exact content bytes');
    }
    need(sha(evidence.duplicate.currentCaptureSha256) && sha(evidence.duplicate.copyCaptureSha256) && ['currentMessagePointer', 'copyMessagePointer', 'contentPointer', 'copyContentPointer'].every(key => typeof evidence.duplicate[key] === 'string' && (evidence.duplicate[key] === '' || evidence.duplicate[key].startsWith('/')) && evidence.duplicate[key].length <= 500), 'Exact raw capture digests and extraction pointers required');
  }
  if (evidence.priorFactsDelivery !== null) {
    shape(evidence.priorFactsDelivery, ['bodyDigest', 'contextDigest', 'messageId', 'verified']);
    need(sha(evidence.priorFactsDelivery.bodyDigest) && sha(evidence.priorFactsDelivery.contextDigest) && text(evidence.priorFactsDelivery.messageId) && typeof evidence.priorFactsDelivery.verified === 'boolean', 'Prior facts need exact unchanged context and delivered message');
  }
  return evidence;
}
function matches(rule, review) {
  const selector = rule.match;
  if (selector.adapter !== 'either' && selector.adapter !== review.adapter) return false;
  return ['nativeId', 'threadId', 'sender', 'subject'].every(key => selector[key] === null || selector[key] === review.before[key]) && (selector.category === null || selector.category === review.context.category);
}
export function classifyBriefingMail(review, policy) {
  validateBriefingPolicy(policy);
  const evidence = validatePolicyEvidence(review.policyEvidence);
  const { before, context, adapter } = review;
  need(['gmail', 'outlook'].includes(adapter) && before && context && array(review.facts, 20) && review.facts.every(text), 'Mail review required');
  const result = (action, reason, rule = null) => ({ action, reason, rule, policyVersion: 3, policyDigest: digest(policy) });
  const keep = reason => result('keep', reason);
  if (adapter === 'gmail' ? !before.labels.includes('INBOX') : before.folder !== 'Inbox') return keep('already-outside-inbox');
  if (!context.complete || !context.safeUnreadInspection) return keep('incomplete-or-unsafe-thread-inspection');
  const protectedItem = ['actionRequired', 'reviewRequired', 'ambiguous', 'seriousSecurity', 'unresolved', 'consequential', 'personal', 'academic', 'research', 'securityWarning'].some(key => context[key]) || context.invitation || context.directMessage;
  const exact = policy.exceptions.filter(rule => matches(rule, review));
  need(exact.length <= 1 || exact.every(rule => rule.action === exact[0].action && rule.requiresFacts === exact[0].requiresFacts && rule.overrideProtected === exact[0].overrideProtected), 'Conflicting exact exceptions need owner review');
  const selected = exact[0];
  if (selected?.action === 'keep') return result('keep', selected.id, { id: selected.id, version: policy.version, ownerRef: selected.authority.sourceRef });
  if (selected && (!protectedItem || selected.overrideProtected)) return selected.requiresFacts && !review.facts.length ? keep('useful-facts-required') : result(selected.action, selected.id, { id: selected.id, version: policy.version, ownerRef: selected.authority.sourceRef });
  const receipt = ['invoice', 'receipt'].includes(evidence.recordPurpose) || context.orderReceipt;
  if (receipt) {
    if (protectedItem) return keep('protected-current-receipt');
    if (!review.facts.length) return keep('useful-receipt-facts-required');
    const duplicate = evidence.duplicate;
    if (duplicate) need(duplicate.currentCaptureSha256 === context.threadDigest, 'Duplicate current content must bind inspected raw thread bytes');
    if (duplicate?.verified && duplicate.nativeId !== before.nativeId && duplicate.recordPurpose === evidence.recordPurpose && duplicate.contentSha256 === duplicate.copySha256) return result('trash', 'verified-duplicate-copy', { id: 'verified-duplicate-copy', version: policy.version, ownerRef: policy.authority.sourceRef });
    return result('archive', 'useful-facts-before-archive');
  }
  const candidates = policy.rules.filter(rule => matches(rule, review));
  const overrides = candidates.filter(rule => rule.overrideProtected);
  need(candidates.length <= 1 || candidates.every(rule => rule.action === candidates[0].action && rule.requiresFacts === candidates[0].requiresFacts && rule.overrideProtected === candidates[0].overrideProtected) || overrides.length === 1 && candidates.filter(rule => !rule.overrideProtected).every(rule => rule.action === 'keep'), 'Conflicting category rules require explicit scoped precedence');
  const rule = overrides[0] ?? candidates[0];
  if (rule?.overrideProtected && (context.seriousSecurity || context.personal || context.directMessage || context.research || context.invitation || context.billing && context.unresolved)) return keep('latest-owner-protection-conflict');
  if (rule?.id === 'paypal-nonreceipt' && ['actionRequired', 'reviewRequired', 'ambiguous', 'unresolved', 'consequential', 'academic'].some(key => context[key])) return keep('latest-owner-protection-conflict');
  if (protectedItem && !rule?.overrideProtected) return keep('protected-context');
  if (rule) {
    if (rule.id === 'blackboard-notifications' && (context.personal || context.directMessage || context.invitation)) return keep('personal-instructor-mail-excluded');
    if (rule.id === 'seerr-available') need(before.sender.toLowerCase() === policy.accounts[adapter].account.toLowerCase() && before.subject.includes('[Seerr]') && before.subject.includes('Request Now Available'), 'Seerr rule requires actual self-sender and both exact subject markers');
    if (rule.requiresFacts && !review.facts.length) return keep('useful-facts-required');
    return result(rule.action, rule.id, { id: rule.id, version: policy.version, ownerRef: rule.authority.sourceRef });
  }
  if (evidence.recordPurpose === 'statement') return keep('statement-review');
  if (context.category === 'successful-login' && !context.recognizedLogin) return keep('unrecognized-successful-login-notice');
  if ((context.recognizedLogin || context.category === 'account-notice') && !review.facts.length) return keep('useful-facts-required');
  return context.informational ? result('archive', 'harmless-informational') : keep('insufficient-judgment');
}
export function assessBriefingLearning(policy, entry, history = []) {
  validateBriefingPolicy(policy);
  shape(entry, ['id', 'kind', 'authority', 'scope', 'risk', 'action', 'observations', 'counterexamples']); authority(entry.authority);
  need(text(entry.id) && ['owner-correction', 'observed-preference'].includes(entry.kind) && text(entry.scope) && ['low-risk', 'financial', 'serious-security', 'consequential'].includes(entry.risk) && actions.includes(entry.action) && array(entry.observations) && array(entry.counterexamples), 'Invalid decision history entry');
  need(array(history, 1000), 'Bounded decision history required');
  if (history.some(row => row.id === entry.id)) { const prior = history.find(row => row.id === entry.id); need(canonical(prior) === canonical(entry), 'Conflicting decision history identity requires a new correction revision'); return { status: 'retained', historyDigest: digest(history), entry: prior }; }
  if (entry.kind === 'observed-preference') {
    if (entry.risk !== 'low-risk' || policy.learning.forbiddenBroadening.includes(entry.scope) || entry.counterexamples.length) return { status: 'held', reason: 'Protected scope or counterexamples require owner correction' };
    for (const row of entry.observations) {
      shape(row, ['actor', 'actorVerified', 'labelOnly', 'sourceRef', 'sourceDigest', 'account', 'nativeId', 'observedAt', 'scope', 'action']);
      need(text(row.actor) && typeof row.actorVerified === 'boolean' && typeof row.labelOnly === 'boolean' && text(row.sourceRef) && sha(row.sourceDigest) && text(row.account) && text(row.nativeId) && typeof row.observedAt === 'string' && Number.isFinite(Date.parse(row.observedAt)) && text(row.scope) && actions.includes(row.action), 'Attributable exact move observation required');
    }
    const independent = new Set(entry.observations.filter(row => row.actorVerified && !row.labelOnly && !policy.learning.excludeActors.includes(row.actor) && row.action === entry.action && row.scope === entry.scope).map(row => `${row.account}/${row.nativeId}`));
    if (independent.size < policy.learning.minimumIndependentObservations) return { status: 'held', reason: 'Repeated independent attributable observations required' };
  }
  return { status: 'append', entry, previousDigest: digest(history), historyDigest: digest([...history, entry]) };
}
export const sameBriefingValue = (a, b) => canonical(a) === canonical(b);
export function briefingHumanText(value) {
  need(text(value), 'Bounded human text required');
  need(!/(?:\b(?:code|OTP|2FA)\b.{0,25}\b(?=[A-Z0-9]*\d)[A-Z0-9]{4,12}\b|\b(?=[A-Z0-9]*\d)[A-Z0-9]{4,12}\b.{0,35}\b(?:verification|login|security|authentication|one[ -]time)\s+code\b|https?:\/\/\S*(?:unsubscribe|\/login|[?&](?:token|code|key|sig|signature|auth|password)=)|\bBearer\s+\S+|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,})/i.test(value), 'Private codes or personalized account links refused in briefing body');
  return value.replace(/[\\`*_{}\[\]<>#|!]/g, '\\$&');
}

function pointer(value, path) {
  for (const token of path === '' ? [] : path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) { need(!['__proto__', 'prototype', 'constructor'].includes(token) && value && Object.hasOwn(value, token), 'Invalid exact extraction pointer'); value = value[token]; }
  return value;
}
export function validateDuplicateCaptures(review, currentRaw, copyRaw) {
  const evidence = validatePolicyEvidence(review.policyEvidence); const proof = evidence.duplicate; need(proof, 'Duplicate extraction proof required');
  need(digest(currentRaw) === proof.currentCaptureSha256 && digest(copyRaw) === proof.copyCaptureSha256 && proof.currentCaptureSha256 === review.context.threadDigest, 'Duplicate extraction raw bytes differ from inspected captures');
  const current = pointer(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(currentRaw)), proof.currentMessagePointer);
  const copy = pointer(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(copyRaw)), proof.copyMessagePointer);
  need((current.nativeId ?? current.id) === review.before.nativeId && (copy.nativeId ?? copy.id) === proof.nativeId && proof.recordPurpose === evidence.recordPurpose && pointer(current, proof.contentPointer) === proof.contentBase64 && pointer(copy, proof.copyContentPointer) === proof.copyBase64, 'Duplicate exact message identity, purpose or extracted content differs');
  return true;
}
