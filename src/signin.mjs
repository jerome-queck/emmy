import { boundedJson } from './bounded-json.mjs';
import { insist, shape, stamp, text } from './fleet-schema.mjs';

export function signinDecision(input, at) {
  shape(input, ['schemaVersion', 'service', 'account', 'environment', 'surface', 'sourceRef', 'observedAt', 'state', 'provider', 'loginService', 'secureForm', 'authHandoff', 'mfa', 'issuingService', 'protectedAccount', 'protectedContent', 'denial', 'retry'], 'sign-in decision');
  insist(input.schemaVersion === 1 && stamp(input.observedAt) && ['browser', 'connector'].includes(input.surface), 'Invalid sign-in source');
  for (const field of ['service', 'environment', 'sourceRef']) insist(text(input[field]), `Missing sign-in ${field}`);
  for (const field of ['account', 'provider', 'loginService', 'issuingService', 'protectedAccount']) if (input[field] !== undefined) insist(text(input[field]), `Invalid ${field}`);
  for (const field of ['secureForm', 'authHandoff', 'protectedContent']) if (input[field] !== undefined) insist(typeof input[field] === 'boolean', `Invalid ${field}`);
  insist(['login-required', 'password', 'mfa', 'verify', 'authenticated', 'denied', 'uncertain', 'unavailable'].includes(input.state), 'Invalid sign-in state');
  insist(input.state === 'denied' || input.denial === undefined && input.retry === undefined, 'Denial metadata requires the denied state');
  insist(input.state === 'mfa' || input.mfa === undefined && input.issuingService === undefined && input.loginService === undefined, 'MFA metadata requires the mfa state');
  if (input.state === 'mfa') insist(['otp', 'number-matching', 'owner-approval'].includes(input.mfa), 'Unsupported MFA handoff');
  if (input.state === 'denied') {
    shape(input.denial, ['sourceRef', 'scope', 'knownUnexecuted', 'persistent'], 'denial');
    insist(text(input.denial.sourceRef) && text(input.denial.scope) && typeof input.denial.knownUnexecuted === 'boolean' && typeof input.denial.persistent === 'boolean', 'Retain exact denied action scope');
    if (input.retry !== undefined) { shape(input.retry, ['count', 'authorizationRef', 'scope', 'materialChange'], 'retry'); insist(Number.isSafeInteger(input.retry.count) && input.retry.count >= 0 && input.retry.count <= 1 && text(input.retry.scope) && text(input.retry.authorizationRef) && text(input.retry.materialChange), 'Invalid bounded retry authorization'); }
  }
  const common = { service: input.service, account: input.account ?? null, environment: input.environment, surface: input.surface, sourceRef: input.sourceRef, persistence: 'No secrets accepted or retained. Decision output is advisory.', assurance: 'reported', otherSurface: 'unverified' };
  const result = (status, nextAction, prompt = null) => ({ ...common, status, nextAction, prompt });
  const age = Date.parse(at) - Date.parse(input.observedAt);
  if (age < 0 || age > 300000) return result('source-needed', 'Reinspect the actual issuing-service login and account in this environment.');
  if (input.state === 'uncertain') return result('inspect-before-retry', 'Inspect the actual outcome before repeating any action.');
  if (input.state === 'unavailable') return result('unavailable-tool', 'Tell the owner which supported sign-in tool or handoff is unavailable and the exact next action.');
  if (input.state === 'denied') {
    const retry = input.retry;
    if (input.denial.persistent || !input.denial.knownUnexecuted || !retry || retry.count !== 0 || retry.scope !== input.denial.scope || retry.authorizationRef === input.denial.sourceRef) return result('denied-stop', 'Stop this exact denied scope. Preserve the denial and promptly tell the owner the required action.');
    return result('one-bounded-retry', 'Retain the materially relevant new scoped authorization. Attempt this known-unexecuted action once, then inspect its result. A persistent denial stops this scope.');
  }
  if (!input.account || !input.provider) return result('identity-needed', 'Consult the current owner source or private nonsecret recipe. Never guess provider or account.', `Sign-in is needed for ${input.service} in ${input.environment}. Confirm its provider and account here.`);
  if (input.state === 'authenticated') {
    if (input.protectedContent !== true || input.protectedAccount !== input.account) return result('verification-needed', 'Verify protected content and the exact intended account through this same surface. A login page or other account is insufficient.');
    return result('recovered', 'Record a nonsecret scoped recovery receipt. Browser and connector authentication remain separate.');
  }
  if (input.state === 'verify') return result('verification-needed', 'Read protected same-account content through this surface and retain a nonsecret readback.');
  if (input.state === 'mfa') {
    if (!input.loginService || input.issuingService !== input.loginService || ![input.service, input.provider].includes(input.loginService)) return result('issuer-mismatch-stop', 'Do not use or replay this challenge. Reinspect the matching issuing-service login.');
    if (input.mfa === 'number-matching') return result('owner-mfa-needed', 'Show the current number matching challenge from the verified issuing service for owner approval. Do not approve it yourself.', `Approve the current ${input.loginService} sign-in for ${input.account}, for access to ${input.service}, in your authenticator. Check its displayed number.`);
    if (input.mfa === 'otp') return result('current-otp-needed', 'Prompt the owner here for the current ordinary Authenticator OTP. Use it once only at this matching issuing-service login. Never save or replay it.', `The current ${input.loginService} login for ${input.account}, for access to ${input.service}, needs your Authenticator code here. I will use it once at that login.`);
    return result('owner-mfa-needed', 'Prompt the owner here to approve the current service challenge.', `Approve the current ${input.service} sign-in for ${input.account}.`);
  }
  if (input.secureForm === true) return result('secure-form-needed', 'Expose the supported secure password form in this conversation, then continue the ordinary service login. Never copy its secret into files or notes.', `Sign-in expired for ${input.service}, ${input.account}, in ${input.environment}. Enter your password using the secure form here.`);
  if (input.authHandoff === true) return result('auth-handoff-needed', 'Open the supported authentication handoff and promptly tell the owner here. Continue ordinary SSO and supported remember-device choices.', `Sign-in expired for ${input.service}, ${input.account}, in ${input.environment}. Complete the authentication handoff here.`);
  return result('secure-handoff-unavailable', 'Prompt the owner here with the exact supported sign-in action. Do not request a password in ordinary chat. Preserve the secure-form/handoff gap.', `Sign-in is needed for ${input.service}, ${input.account}, in ${input.environment}. No supported secure form or authentication handoff is exposed. Complete the service sign-in in its supported UI.`);
}
export async function signin({ file }) { return signinDecision(await boundedJson(file), new Date().toISOString()); }
