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
