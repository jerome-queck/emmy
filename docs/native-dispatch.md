# Recover and dispatch native coding objectives

Use the trusted installed runner with the existing private home. This command recovers saved state and returns advice. Supported native tools perform creation and supervision.

```sh
agent dispatch --resolve name:<exact-saved-label> --discovery <private-discovery.json> --as-of <UTC>
agent dispatch --project <project-key> --as-of <UTC>
agent dispatch --id <objective-id> --discovery <private-discovery.json> --as-of <UTC>
agent dispatch --id <objective-id> --discovery <private-discovery.json> --context-needed --as-of <UTC>
```

Project recovery returns the selected dispatcher and known objective bindings. It does not establish current native eligibility. Objective recovery pins the journal inputs and returns one next action. The command writes no records and invokes no native executor. Exit 0 means a resolved destination, usable advice, or recovered inventory, 2 means invalid input, and 3 means observation or resolution is needed.

## Resolve the saved destination

Capture the complete result of the designated coordinator's supported native `list_projects`. Preserve every returned row, acquisition time, source, and coverage limits privately. The inspected API has no pagination arguments. Its returned inventory is the known scope, not proof of an undiscoverable project's absence.

Wrap the native `projects` array in this data envelope:

```json
{
  "schemaVersion": 1,
  "observedAt": "<actual-UTC-acquisition-time>",
  "sourceRef": "<private-native-discovery-receipt>",
  "coverage": { "complete": true, "gaps": [] },
  "projects": [
    { "projectId": "<saved-ID>", "projectKind": "local", "label": "<exact-label>", "hostId": "<configured-host>", "path": "<absolute-checkout>" }
  ]
}
```

Use an explicit `key:`, `id:`, `name:`, `path:`, or `repository:` selector. Names and paths match exactly. Repository selectors match private canonical repository bindings, then actual local source inspection checks the result. Multiple matches require an explicit destination choice. Missing, duplicate, stale, future, partial, or conflicting discovery cannot yield action advice. Discovery expires after five minutes or the objective's tighter freshness limit. After restore, acquire it again in the new epoch.

Resolution returns the saved identity even when source or authority is unavailable. A non-Git saved root remains identifiable, but an existing coding definition requires a verified Git root, canonical origin, revision, and dirty digest. Resolve the actual source before constructing that definition. Never manufacture a revision or substitute another project.

For Studio-local destinations, the resolver and objective operation inspect the current repository directly. Advice refuses changed source bytes. The command invokes no native executor and executes no project checks. Retain the discovery file with the private job evidence. It remains reported native input; its digest does not authenticate a native account or authority.

## Separate coordinator and configured host

`dispatcher.hostId` and `dispatcher.nativeProjectId` identify the coordinator itself. The job's `target.hostId` and `target.nativeProjectId` identify the destination. Each destination binding may select the same coordinator identity with its own exact destination authority. The dispatcher owner is the unique private project with that host and native project ID. Its own selection, scope, machine, live project row, and thread readback must agree independently.

The supported native `create_thread` project route accepts the discovered destination ID. Its `environment.type = "local"` means the saved project's configured host. That host can be a Studio-connected remote host. This route does not switch the Dot's connected computer, use `cloud_threads`, or create a cloud environment. Supervision uses the actual returned `hostId`. Destination-host model compatibility is checked by the native tool when called.

A remote destination additionally requires `dispatcher.remoteAuthorityRef` on both its selected binding and immutable objective snapshot:

```json
{
  "reference": "<explicit-host-and-project-human-source>",
  "action": "dispatch-native-remote-child",
  "resource": "<destination-project-key>",
  "destination": "<configured-remote-host-ID>"
}
```

The ordinary `authorityRef` still binds the destination project key and saved native project ID. The remote grant binds that destination's configured host. No wildcard or Studio-only grant authorizes another host. Preserve separate app and Computer Use grants and actual denials.

The CLI never inspects a remote path on Studio. Before remote advice, import current complete target evidence with actual native source bytes through the existing journal. Remote source assurance stays reported. Unsuperseded contrary reports hold action; timestamps alone cannot erase them. The current tasks dispatch metadata also needs `destinationSkill` with the destination `hostId`, actual installed `path`, `sha256`, `observedAt`, and `sourceRef`. Its host/path/digest must match the objective skill, its acquisition must fit five minutes and the objective limit, and it must follow restore. Studio's copy cannot verify remote installed bytes. Missing remote source or skill evidence holds that job.

ChatGPT conversational Projects, saved Codex coding projects, and cloud Work environments have distinct membership contracts. Native discovery can identify ChatGPT Projects, but this command returns `chatgpt-coding-membership-unsupported`. The separate `chatgptWorkCloud` creation target is cloud work, not ordinary conversational chat creation or saved native coding membership. Optional support is excluded here.

## Save the private selection

Keep the selected dispatcher under `bindings.json` at `projects.<project-key>.dispatcher`. Use actual native discovery and the human's existing source authorization. The `nativeProjectId` below belongs to the dispatcher owner. Its authority destination belongs to the selected child destination. The binding has this shape:

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

Omitting `requestedSettings` requests exact Sol Medium. Explicit Sol High is available for heavy reasoning. Child and coordinator readbacks must match their respective requested model and effort exactly. A different model or effort below Medium still needs `scopedOverrideRef`. Changed requests need that explicit source in a descendant definition. Dispatcher, correlation key and skill bindings remain fixed. Preserve original requests and launch evidence.

`dispatch.coordinatorRequestedSettings` selects the coordinator independently and requires `scope` naming this objective and the `coordinator` role. Omission also requests exact Sol Medium. Child settings cannot select coordinator settings, or conversely.

Above High or any other coding model requires `oneTimePermission` inside that role's settings, with exact `objectiveId`, `role` (`child` or `coordinator`), `model`, `effort`, and a nonempty `sourceRef` to explicit one-time owner permission. For example, an explicitly authorized exception can carry `{"objectiveId":"example-objective","role":"child","model":"gpt-6.1-sol","effort":"xhigh","sourceRef":"exact-owner-permission"}`. Generic "or higher", `sourceRef` alone and `scopedOverrideRef` alone do not authorize escalation. Permission cannot cross objective, role, model or effort. The CLI checks declared scope, not source truth. The coordinator must authenticate owner permission and resolve a supported concrete model before dispatch. No default Astra or automatic XHigh escalation exists.

Historical records stay readable and pending launches stay unresolved. Current advice applies the corrected policy; it cannot silently reinterpret earlier recorded settings or change existing native sessions. Project defaults configure new sessions and helpers only. Unrelated automation selections remain unchanged.

```json
{
  "coordinatorRequestedSettings": {
    "model": "gpt-6.1-sol",
    "effort": "medium",
    "sourceRef": "Owner's selected coordinator policy",
    "scopedOverrideRef": "Explicit owner instruction for this objective's coordinator",
    "scope": { "objectiveId": "the-existing-objective-id", "role": "coordinator" }
  }
}
```

Place this field beside `requestedSettings` inside the existing definition's `dispatch`. `scope.objectiveId` must equal that definition's `id`; `scope.role` must be `coordinator`. Missing or wrong scope is rejected. Sol Medium, Sol Low or Luna Max can be selected only with that scoped owner source. These fields describe intent and cannot authenticate owner authority. Preserve the source evidence privately.

Revise the same objective through `parents`, with an explicit `scopedOverrideRef` for every changed model request. Model policy stays outside the immutable dispatcher, correlation and skill binding. Preserve those identities, the effect key, authority and every launch observation. A revision cannot settle a pending or uncertain launch. Fresh acquisition of the actual coordinator's `recordedSettings`, with its `sourceRef` and `observedAt`, must match the selected policy before new advice. Missing, stale, future, mismatched or pre-restore readbacks still refuse. Requested settings, recorded settings and provider execution remain separate.


Retain native evidence through existing `reconcile --import`. Use a `tasks` observation with real evidence paths and digests. Its `dispatch` extension contains `phase`, `correlationKey`, the dispatcher readback, and an `attemptKey` for every phase except initial absence. The create proposal derives a unique attempt key from its objective and pinned discovery and includes it in the child prompt. Retain that key plus `requestDigest`, the SHA-256 of the exact request, in attempted state. Existing `supersedes` links connect observations to that launch. No new record category or private ledger exists.

| Phase | Existing task and effect data | Additional dispatch data |
| --- | --- | --- |
| `absent` | Empty tasks, one matching `absent` effect | Fresh complete targeted discovery. Settling an earlier attempt requires its `attemptKey`, explicit `resolution: "confirmed-no-effect"`, source evidence and supersession. |
| `attempted` | Empty tasks, one matching `pending` effect | Proposal attempt key, exact `requestDigest`, and retained launch intent before the native call. |
| `pending` | Empty tasks, one matching `pending` effect | `clientThreadId`, never a ready task ID. |
| `uncertain` | One matching `uncertain` effect | Retained attempt identity and any known native IDs. |
| `ready` | Exactly one running or completed task with its native ID and matching effect key, no competing effects | Correlated child readback, attempt chain and optional `afterCursor`. |

A readback contains `threadId`, actual `hostId`, explicit saved `nativeProjectId`, `observedAt`, and `sourceRef`. Use null for unavailable host or membership. The dispatcher readback also needs `pinned: true`. A child readback includes the objective's `correlationKey` and `creatorThreadId`. Verify that creator from the actual coordinator creation record. It must equal the pinned dispatcher. Missing provenance holds the existing child without replacement.

`recordedSettings` is separate evidence with `model`, `effort`, `sandboxMode`, `approvalPolicy`, its actual acquisition time `observedAt`, and `sourceRef`. Optional `recordedAt` preserves the original native source timestamp. Omit settings or use null when unavailable. After restore, both native and settings acquisition must occur in the new epoch. Wrapping an old readback in a new observation does not refresh it. Eligibility compares the recorded model and effort with the scoped request and checks the expected `danger-full-access` and `never` record. Missing, stale or contrary evidence requires inspection. It never changes settings or proves provider execution or effective access.

Evidence imports remain reported. Retained byte hashes cannot authenticate native state, human authority or provider execution. Keep raw readbacks, exact policy/model timestamps, source digests, machine paths, dispatcher identity and job bindings private. Existing backup includes bindings, definitions, observations and retained evidence. Restores remain suspended pending fresh epoch observations.

## Execute through the selected dispatcher

1. Load current approved guidance and recover the private selection and objective. Resolve the requested destination from current native discovery and repository evidence. Discover the selected dispatcher's own actual host, saved project, pin and current recorded policy/model through supported reads. Stop that action on a mismatch. Preserve missing evidence as unverified.
2. Classify the human request. A distinct objective gets a new definition and unique marker, then a fresh project child. Continue a known child only for the same objective when its context is needed and existing objective authority covers the follow-up. `--context-needed` supplies no authority itself.
3. Use fresh targeted native discovery. State its request window, marker, project and coverage. A partial page cannot establish absence. Pending, uncertain, uncorrelated, stale or conflicting launch history requires rediscovery. A later source revision cannot erase it.
4. For `create-via-dispatcher`, retain attempted state through the existing importer before the native call. The eligible selected dispatcher uses that previously pinned proposal once through `mcp__codex_app__create_thread`. The proposal and intent are not a reservation or native at-most-once guarantee. Do not substitute a durable cloud task.
5. Inspect the result before retry. Keep pending client IDs separate until native discovery resolves the ready ID. Correlate the actual creator, request, attempt, marker and returned child. Reopen the ready child and independently list its saved project membership. Correct association on the same ID when authorized, then read it back. Never create a replacement to repair uncertainty.
6. Retain the first-turn recorded policy and model with their actual source times. Keep requested settings, resolved defaults, recorded session settings, effective access and provider execution separate. The inspected native create schema has no permission field. Add none.
7. The parent owns bounded `read_thread` or `wait_threads` progress through the existing connection. Preserve the ready ID, actual host and cursor. Carry `afterCursor` forward, back off unchanged state, and inspect completion and useful outcome independently. Native completed status defaults to `inspect-outcome`; it cannot establish a release. An authorized same-objective follow-up with needed context may continue that completed native chat.

Multiple objective bindings for one child, multiple unsuperseded native observations, or contradictory source records hold further action. Preserve the records and resolve them explicitly. Repository similarity never establishes objective equality. The command cannot stop a caller acting outside this procedure or recover a native effect whose history was never retained.

Standalone pending, uncertain or completed effect records require targeted rediscovery before creation or continuation. Partial or stale replacement evidence cannot erase their history. Child reuse checks include existing objectives without the optional dispatch extension. A ready result for one attempt cannot settle a different unresolved attempt. An implementation child cannot be the selected dispatcher. A confirmed no-effect observation settles only its named attempt; retain the entire chain and every original failure.

## Install and verify recovery

Ship executable changes through exact-head review, hosted checks and protected release. Install the reviewed published bytes in a versioned private runner. Keep the pinned runtime and private home. Add a general `run-agent` launcher alongside the existing `run-briefing` route and verify their actual targets and hashes.

The stable private bootstrap first loads `briefing`, then uses `run-agent dispatch --project <project-key> --as-of <UTC>` before coding routing. Recover the matching objective before any native instruction. Save and read back this short procedure through the existing native note mechanism when available. Preserve all existing corrections, schedules and access boundaries.

Verify the actual installed invocation against the saved private selection and an existing native job. Fixtures, generated guidance, a proposed note and a merge cannot substitute for that readback. Reuse the current authorized implementation job for setup acceptance; create no rehearsal child. Later ordinary-human adoption remains a separate [native acceptance](dot-verification.md#verify-persistent-native-dispatch-recovery).
