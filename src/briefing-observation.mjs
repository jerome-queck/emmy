const need = (ok, message) => { if (!ok) throw new Error(message); };
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function calendarObservationClock(source, asOf) {
  const observation = source.collectorObservation;
  const fields = ['basis', 'startedAt', 'endedAt'];
  need(observation && Object.keys(observation).length === fields.length && fields.every(key => Object.hasOwn(observation, key)), 'Exact Calendar collector observation required');
  need(['current-read-start', 'original-provider-clock'].includes(observation.basis), 'Unsupported Calendar observation basis');
  need(stamp(asOf) && stamp(observation.startedAt) && stamp(observation.endedAt) && observation.startedAt <= observation.endedAt && observation.endedAt <= asOf, 'Original Calendar collector bounds required without replay refresh');
  if (observation.basis === 'current-read-start') {
    need(source.observedAt === null && source.capturedAt === null, 'Collector observation cannot replace or impersonate provider clocks');
    return observation.startedAt;
  }
  need(stamp(source.observedAt) && stamp(source.capturedAt) && source.observedAt <= source.capturedAt && source.capturedAt <= observation.endedAt, 'Original Calendar provider clocks required');
  return source.observedAt;
}

export function combineCalendarObservations(observations, asOf) {
  need(Array.isArray(observations) && observations.length > 0 && observations.every(value => value && Object.keys(value).length === 3 && ['observedAt', 'capturedAt', 'collectorObservation'].every(key => Object.hasOwn(value, key))), 'Exact retained Calendar provider observations required');
  for (const value of observations) calendarObservationClock(value, asOf);
  const basis = observations[0].collectorObservation.basis;
  need(observations.every(value => value.collectorObservation.basis === basis), 'Calendar observation bases cannot be mixed');
  return {
    observedAt: basis === 'current-read-start' ? null : observations.map(value => value.observedAt).sort()[0],
    capturedAt: basis === 'current-read-start' ? null : observations.map(value => value.capturedAt).sort().at(-1),
    collectorObservation: { basis, startedAt: observations.map(value => value.collectorObservation.startedAt).sort()[0], endedAt: observations.map(value => value.collectorObservation.endedAt).sort().at(-1) }
  };
}

export function mailObservationClock(source, asOf) {
  const observation = source.collectorObservation;
  const fields = ['schemaVersion', 'basis', 'startedAt', 'endedAt'];
  need(observation && Object.keys(observation).length === fields.length && fields.every(key => Object.hasOwn(observation, key)), 'Exact mail collector observation required');
  need(observation.schemaVersion === 1 && observation.basis === 'original-read-start', 'Version one original mail read observation required');
  need(stamp(asOf) && stamp(observation.startedAt) && stamp(observation.endedAt) && observation.startedAt <= observation.endedAt && observation.endedAt <= asOf, 'Original mail collector bounds required without replay refresh');
  need(source.observedAt === null && source.capturedAt === null, 'Mail collector observation cannot replace or impersonate provider clocks');
  return observation.startedAt;
}
