# Recover and dispatch native coding objectives

Use the trusted installed runner with the existing private home. This command recovers saved state and returns advice. Supported native tools perform creation and supervision.

```sh
agent dispatch --project <project-key> --as-of <UTC>
agent dispatch --id <objective-id> --as-of <UTC>
agent dispatch --id <objective-id> --context-needed --as-of <UTC>
```

Project recovery returns the selected dispatcher and known objective bindings. It does not establish current native eligibility. Objective recovery pins the journal inputs and returns one next action. The command writes no records and invokes no native executor. Exit 0 means usable advice or recovered inventory, 2 means invalid input, and 3 means observation or resolution is needed.

## Save the private selection

Keep the selected dispatcher under `bindings.json` at `projects.<project-key>.dispatcher`. Use actual native discovery and the human's existing source authorization. The binding has this shape:

```json
{
  "threadId": "<ready-native-dispatcher-id>",
  "hostId": "<actual-native-host-id>",
  "nativeProjectId": "<saved-native-project-id>",
  "selectionRef": "<private-selection-readback>",
  "childAccessIntent": "full-access-inherit",
  "authorityRef": {
    "reference": "<private-standing-human-source>",
    "action": "dispatch-native-child",
    "resource": "<project-key>",
    "destination": "<saved-native-project-id>"
  }
}
```

`full-access-inherit` records the explicit human scope for qualifying children to inherit unrestricted local filesystem and network access without sandbox approvals. It grants no permission and proves no inheritance. Preserve existing global defaults, other threads, and separate connector and Computer Use grants. Reuse current authorization within its exact scope. An actual expansion requires scoped human confirmation.

Keep the selected dispatcher pinned and use it for coordination. Fresh native project children own implementation. The parent supervises through the existing authorized control connection. A coding child does not need to message or wake either coordinator.

## Retain one objective and its native evidence

Adopt one ordinary responsibility definition per distinct coding objective through `responsibility --file`. Its existing target, authority, criteria, freshness and lifecycle still apply. Add a `dispatch` extension:

```json
{
  "correlationKey": "<private-unique-objective-marker>",
  "dispatcher": "<copy-the-selected-binding-object>",
  "skill": { "path": "<resolved-absolute-SKILL.md>", "sha256": "<installed-skill-digest>" },
  "requestedSettings": {
    "model": "gpt-6.1-sol",
    "effort": "high",
    "sourceRef": "<private-model-policy-or-human-source>"
  }
}
```

The dispatcher placeholder represents the complete object above. Resolve and hash the actual installed skill. The create proposal begins with `[$pstack:poteto-mode](/absolute/resolved/path/SKILL.md)` followed by the objective details. Never copy a placeholder path into a native task.

Omitting `requestedSettings` uses ordinary Sol High. Stronger scoped human settings apply to that objective and its named helpers. A model outside the ordinary default or an effort below its floor needs `scopedOverrideRef`. A later changed request needs that explicit source in a descendant definition. Its dispatcher, correlation key and skill binding stay fixed. Retain the original request and first-turn evidence.

Retain native evidence through existing `reconcile --import`. Use a `tasks` observation with real evidence paths and digests. Its `dispatch` extension contains `phase`, `correlationKey`, the dispatcher readback, and an `attemptKey` for every phase except initial absence. The create proposal derives a unique attempt key from its objective and pinned discovery and includes it in the child prompt. Retain that key plus `requestDigest`, the SHA-256 of the exact request, in attempted state. Existing `supersedes` links connect observations to that launch. No new record category or private ledger exists.

| Phase | Existing task and effect data | Additional dispatch data |
| --- | --- | --- |
| `absent` | Empty tasks, one matching `absent` effect | Fresh complete targeted discovery. Settling an earlier attempt requires its `attemptKey`, explicit `resolution: "confirmed-no-effect"`, source evidence and supersession. |
| `attempted` | Empty tasks, one matching `pending` effect | Proposal attempt key, exact `requestDigest`, and retained launch intent before the native call. |
| `pending` | Empty tasks, one matching `pending` effect | `clientThreadId`, never a ready task ID. |
| `uncertain` | One matching `uncertain` effect | Retained attempt identity and any known native IDs. |
| `ready` | Exactly one running or completed task with its native ID and matching effect key, no competing effects | Correlated child readback, attempt chain and optional `afterCursor`. |

A readback contains `threadId`, actual `hostId`, explicit saved `nativeProjectId`, `observedAt`, and `sourceRef`. Use null for unavailable host or membership. The dispatcher readback also needs `pinned: true`. A child readback includes the objective's `correlationKey`.

`recordedSettings` is separate evidence with `model`, `effort`, `sandboxMode`, `approvalPolicy`, its actual acquisition time `observedAt`, and `sourceRef`. Optional `recordedAt` preserves the original native source timestamp. Omit settings or use null when unavailable. After restore, both native and settings acquisition must occur in the new epoch. Wrapping an old readback in a new observation does not refresh it. Eligibility compares the recorded model and effort with the scoped request and checks the expected `danger-full-access` and `never` record. Missing, stale or contrary evidence requires inspection. It never changes settings or proves provider execution or effective access.

Evidence imports remain reported. Retained byte hashes cannot authenticate native state, human authority or provider execution. Keep raw readbacks, exact policy/model timestamps, source digests, machine paths, dispatcher identity and job bindings private. Existing backup includes bindings, definitions, observations and retained evidence. Restores remain suspended pending fresh epoch observations.

## Execute through the selected dispatcher

1. Load current approved guidance and recover the private selection and objective. Discover the selected dispatcher's actual host, saved project, pin and current recorded policy/model through supported reads. Stop that action on a mismatch. Preserve missing evidence as unverified.
2. Classify the human request. A distinct objective gets a new definition and unique marker, then a fresh project child. Continue a known child only for the same objective when its context is needed and existing objective authority covers the follow-up. `--context-needed` supplies no authority itself.
3. Use fresh targeted native discovery. State its request window, marker, project and coverage. A partial page cannot establish absence. Pending, uncertain, uncorrelated, stale or conflicting launch history requires rediscovery. A later source revision cannot erase it.
4. For `create-via-dispatcher`, retain attempted state through the existing importer before the native call. The eligible selected dispatcher uses that previously pinned proposal once through `mcp__codex_app__create_thread`. The proposal and intent are not a reservation or native at-most-once guarantee. Do not substitute a durable cloud task.
5. Inspect the result before retry. Keep pending client IDs separate until native discovery resolves the ready ID. Correlate the actual creator, request, attempt, marker and returned child. Reopen the ready child and independently list its saved project membership. Correct association on the same ID when authorized, then read it back. Never create a replacement to repair uncertainty.
6. Retain the first-turn recorded policy and model with their actual source times. Keep requested settings, resolved defaults, recorded session settings, effective access and provider execution separate. The inspected native create schema has no permission field. Add none.
7. The parent owns bounded `read_thread` or `wait_threads` progress through the existing connection. Preserve the ready ID, actual host and cursor. Carry `afterCursor` forward, back off unchanged state, and inspect completion and useful outcome independently. Native completed status defaults to `inspect-outcome`; it cannot establish a release. An authorized same-objective follow-up with needed context may continue that completed native chat.

Multiple objective bindings for one child, multiple unsuperseded native observations, or contradictory source records hold further action. Preserve the records and resolve them explicitly. Repository similarity never establishes objective equality. The command cannot stop a caller acting outside this procedure or recover a native effect whose history was never retained.

A ready result for one attempt cannot settle a different unresolved attempt. An implementation child cannot be the selected dispatcher. A confirmed no-effect observation settles only its named attempt; retain the entire chain and every original failure.

## Install and verify recovery

Ship executable changes through exact-head review, hosted checks and protected release. Install the reviewed published bytes in a versioned private runner. Keep the pinned runtime and private home. Add a general `run-agent` launcher alongside the existing `run-briefing` route and verify their actual targets and hashes.

The stable private bootstrap first loads `briefing`, then uses `run-agent dispatch --project <project-key> --as-of <UTC>` before coding routing. Recover the matching objective before any native instruction. Save and read back this short procedure through the existing native note mechanism when available. Preserve all existing corrections, schedules and access boundaries.

Verify the actual installed invocation against the saved private selection and an existing native job. Fixtures, generated guidance, a proposed note and a merge cannot substitute for that readback. Reuse the current authorized implementation job for setup acceptance; create no rehearsal child. Later ordinary-human adoption remains a separate [native acceptance](dot-verification.md#verify-persistent-native-dispatch-recovery).
