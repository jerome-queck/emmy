# Structured agent-task workflow

`task-workflow --file <private-envelope.json>` validates a compact user-owned task record and renders a deterministic six-section prompt. `src/task-workflow.mjs` owns the schema and assessment. Native Studio owns actual task state. Keep the same original record and original receipt references under ignored `.local/`, or in existing private responsibility evidence. There is no new journal, controller, native collector, writer or automatic retry.

## Structured contract

One envelope uses `schemaVersion: 1`, `action: "assess"`, `evaluatedAt` and `maxAgeMs`, plus `record`. Clocks are valid UTC ISO instants ending in `Z`, with optional one-to-three fractional digits. Age limits are safe nonnegative integers in milliseconds. File input is one ordinary UTF-8 JSON file, at most 1 MiB; duplicate keys refuse.

The record requires original `objectiveId`, accountable `owner`, exact `scope: {hostId, projectId}`, `phase` (`prepare`, `monitor`, `review`), `native`, and `sections`. These are supplied declarations, not authenticated identity or permission. Missing required fields, unsupported versions/states, malformed clocks and duplicate criterion IDs refuse with exit 2. Unknown supplementary fields do not change assessment.

The six sections are structured fields in this order:

| Field | Required shape |
| --- | --- |
| `goal` | Nonempty outcome text. |
| `verification` | `criteria: [{id, text}]` with at least one unique criterion; `checks: [string]`; `independentReview: boolean`. |
| `subgoals` | Array of text naming observable results, criteria and dependencies; empty when unnecessary. |
| `boundaries` | `authorized: [string]`, `excluded: [string]`, `sourceRef: string` naming the exact source. |
| `output` | Nonempty array of deliverable/evidence descriptions. |
| `delegation` | Monitoring `parent: string`, `helpers: [string]` describing each role, count, scope, model family and effort; empty when unnecessary. |

Optional `skills: [{name, path}]` belongs to the record. Resolve each actual absolute `SKILL.md` path on the destination host first. Rendering prefixes `[$name](/absolute/path/SKILL.md)` before the six sections; spaces and Markdown delimiters in the original path are percent-encoded. Validation checks path shape, not existence or installation. Roughly 500 words remains advisory. Prose correctness, embedded instructions, source-revision meaning, permission, model selection and useful delegation remain parent/agent judgments.

`native` always names `state`, nullable `taskId`, nullable `clientThreadId`, and `readbacks: []`. A readback is `{hostId, projectId, taskId, state, ref, acquiredAt}`. `projectId: null` explicitly retains unavailable membership. `ref` points to the original retained supported native response; the command never opens it. These state labels summarize supplied observations, not native status enums. Keep native opaque statuses in their original receipts.

| Native state | Enforced assessment |
| --- | --- |
| `planned` | `prepare` only; no task/client identity or readbacks. Returns `prepared`, never authority to create. |
| `attempted`, `pending`, `uncertain` | Always `rediscovery-only`, even with a supplied task ID or passing review. No retry proposal. |
| `known`, `running`, `completed` | Require task ID, no unresolved client ID, and original readbacks with exact host/project/task identity, matching declared state and current acquisitions. Missing, stale, future or contrary evidence yields `rediscovery-only`. |
| `failed` | Retains failure and requires rediscovery. It cannot become ready from a passing artifact check. |

Do not delete contrary observations to obtain a favorable assessment. This stateless boundary cannot detect a caller rewriting the original record or omitting history. Preserve prior responses separately; resolving contradictions needs supported native evidence and parent judgment. There is no cross-invocation transition or at-most-once guarantee.

For `phase: "review"`, `native.state` must be `completed`. Supply `review: {reviewer, ref, acquiredAt, criteria: [{id, outcome, evidence: [{ref, acquiredAt}]}]}`. Outcomes are `passed`, `failed`, or `unknown`. Every original criterion needs a passing outcome and at least one current original evidence reference; review itself needs a current original reference. Requested independent review needs a reviewer name different from the owner. Missing or failed criteria stay gaps. Names and references cannot prove actual independence, artifact correctness or native truth.

Returns `prepared`, `reported-native-known`, `reported-review-complete`, `evidence-gaps`, or `rediscovery-only`, with criterion mappings, gaps and rendered `prompt`. Every result declares `accepted: false`, `automaticRetry: false`, `execution: "none"`, and supplied-only assurance. Exit 0 means declared checks pass; 3 retains gaps. Even `reported-review-complete` requires parent review of original artifacts before actual acceptance.

## Route and supervise

1. Read the destination standing context and [model policy](../AGENTS.md#standing-thread-and-model-policy). Recover any selected authorized dispatcher through existing [private dispatch recovery](native-dispatch.md). Distinct objectives need fresh project-bound tasks; same-objective continuation needs its context. Independent tasks remain observation-only.
2. Fill the original record, criteria and resolved skill paths. Run the assessor. Parent checks authority, exact destination, supported model ID, effort and service tier separately. A prepared prompt is a proposal.
3. Retain exact intent/request and attempt reference before the call. Parent passes the returned `prompt` to the designated host's supported native `create_thread` with discovered saved project ID and local environment, following [native creation](change-delivery.md#create-through-the-native-host-service). No CLI/native adapter is added here.
4. Retain the separate native response unchanged. Update the same original record with its attempted/pending/uncertain state or exact returned identity. Resolve pending IDs and ambiguous launches through supported exact-objective discovery before any retry. Never create a replacement to repair uncertain membership.
5. Parent obtains supported same-ID host/membership readbacks, retains original acquisitions/references, and amends that record. A requested project or cwd does not prove saved membership. Use the supported operation on the same task within authority if membership needs repair; then reread. Retain contrary evidence. Recorded model, effort, tier and effective execution remain separate readbacks.
6. Parent monitors the actual ready ID through supported `read_thread` or bounded `wait_threads`, carrying cursors forward. No child callback is required. Review original changed artifacts and map every criterion to receipts. Failed/partial evidence stays visible. Acceptance, deployment and ordinary adoption remain separate decisions.

## Project projection

`action: "project"` replaces `record` with `scope`, `records: []`, and `discovery` containing the existing [Studio capture envelope](../.agents/skills/verify/features/routing.md#disposable-studio-task-discovery). Discovery must use the exact same scope, evaluation clock and age limit. All supplied records validate; only exact host/project members are assessed. Duplicate selected objective IDs refuse.

The result reuses `studioDiscovery`, preserving its partial pagination, original acquisition clocks, unknown membership and conflicts. Selected known task IDs must correlate to fresh, nonconflicting project observations. Missing or conflicting rows require rediscovery, never retry. Partial discovery or assessment gaps yields `projected-partial` and exit 3. `projected` means a consistent supplied projection, not complete inventory or safe absence. Foreign records remain `excludedRecords` identities; native project tasks without supplied records remain `independentNativeTasks`. No records are adopted and `intervention` is always `none`.

## Review the handoff

Retain source/result revision, dirty state, original request/response/readbacks, criterion-to-receipt mapping, failures, gaps, next owner and scope. Distinguish reported claims from observed artifacts. A completion message or passing check cannot establish deployment, delivery or access. Missing telemetry holds the claims that need it. The [verification recipe](../.agents/skills/verify/SKILL.md#agent-task-workflow-acceptance) drives this CLI; actual supported native calls remain a separate parent exercise.
