import { digest } from '../src/records.mjs';

export const fleetTime = '2026-10-25T12:00:00.000Z';
export const fleetScope = { service: 'fixture-service', account: 'fixture-owner', environment: 'fixture-parent', surface: 'browser', resource: 'protected-read' };
export const fleetEntities = [
  { id: 'monitor', kind: 'monitor', scope: { ...fleetScope, resource: 'monitor' } },
  { id: 'protected', kind: 'authentication', scope: fleetScope, monitorId: 'monitor' },
  { id: 'routine', kind: 'schedule', scope: { ...fleetScope, surface: 'schedule', resource: 'routine' }, requiresDelivery: true, dueAt: '2026-10-25T11:59:59.000Z' }
];
export const fleetRoot = { schemaVersion: 1, type: 'fleet-root', responsibilityId: 'fixture-fleet', definitionHash: digest('definition'), effectKey: digest('effect'), hash: digest('root'), requestDigest: digest('configure'), at: fleetTime, epochHash: null, action: { operation: 'configure', entities: fleetEntities } };
export function fleetReceipt(entityId = 'protected', at = fleetTime, overrides = {}) {
  return { sourceRef: `fixture-${entityId}`, sha256: digest(`fixture ${entityId}`), observedAt: at, capturedAt: at, observer: 'Synthetic parent receipt', coverage: { complete: true, gaps: [] }, scope: fleetEntities.find(entity => entity.id === entityId).scope, ...overrides };
}
export function fleetCapture(entityId = 'protected', condition = 'healthy', at = fleetTime, overrides = {}) {
  return { entityId, condition, issueKey: condition, nextAction: condition === 'healthy' ? 'No owner action needed.' : 'Parent must inspect the exact scoped failure.', receipt: fleetReceipt(entityId, at), ...(entityId === 'protected' ? { protectedContent: true } : {}), ...(entityId === 'routine' ? { enabled: true, execution: 'completed', runRef: 'fixture-run', outcomeRef: 'fixture-outcome', deliveryRef: 'fixture-delivery' } : {}), ...(condition === 'login-expired' ? { authResponse: 'Synthetic issuing-service login required response' } : {}), ...overrides };
}
export function fleetJob(id = 'read-one', priority = 'interactive', overrides = {}) {
  return { id, kind: 'health-read', occurrence: 'fixture-occurrence', priority, entityIds: ['protected'], purpose: 'One synthetic bounded protected read.', maxReads: 1, maxBytes: 4096, steps: 1, ...overrides };
}
