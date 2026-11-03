export const operatingContract = Object.freeze({
  id: 'emmy-operating-foundation',
  version: 2,
  state: 'staged',
  procedure: 'docs/operating-procedure.md',
  runtime: 'scripts/agent.mjs',
  pureEntry: 'src/briefing-core.mjs',
  acquisitionEntry: 'src/briefing-acquisition.mjs',
  effectOwner: 'src/morning.mjs',
  procedureEntry: 'src/automation-procedure.mjs',
  plannerEntry: 'src/automation-plan.mjs',
  reportOwner: 'src/automation-reporting.mjs',
  reportRead: 'automation read exact canonical artifact; no whole-root discovery',
  pilot: 'daily-briefing-only-parent-observed-then-hold',
  effectsAuthorized: false
});

export const briefingChecksV1 = {
  maintenance: { automationId: 'emmy-daily-maintenance', minute: 195, start: '2026-10-31', maxAgeSeconds: 43200 },
  suggestions: { automationId: 'emmy-daily-opportunities', minute: 270, start: '2026-10-31', maxAgeSeconds: 43200 },
  cleanup: { automationId: 'daily-project-chat-cleanup', minute: 300, start: '2026-10-31', maxAgeSeconds: 43200 },
  token: { automationId: 'emmy-token-optimisation', minute: 120, start: '2026-11-02', weekdays: [1, 4], maxAgeSeconds: 432000 },
  weekly: { automationId: 'weekly-emmy-upkeep', minute: 120, start: '2026-11-01', weekdays: [0], maxAgeSeconds: 604800 },
  lifecycle: { automationId: null, minute: 360, start: '2026-10-31', once: true, maxAgeSeconds: 43200 }
};

for (const rule of Object.values(briefingChecksV1)) { if (rule.weekdays) Object.freeze(rule.weekdays); Object.freeze(rule); }
Object.freeze(briefingChecksV1);
