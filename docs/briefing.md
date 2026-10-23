# Check a briefing

Run `node scripts/agent.mjs briefing --home <private-home>` before normal work after resumption and before each briefing. Read the returned guidance. The command accepts one canonical public-main pin and checks its guidance bundle. It downloads data and never executes fetched code or grants authority.

Prepare declared sources, coverage, scoped correction readbacks and structured entries under the existing private home. Set `authoredUnder` to the returned guidance digest. Then run `node scripts/agent.mjs briefing --home <private-home> --file <draft.json>`. Repair revision findings and rerun. Show the returned `body` unchanged. Editing the body requires another check.

Current claims need exact scope, available complete support and content no older than 24 hours. Retrieval and metadata never renew content age. Missing, stale, future or partially covered support stays qualified or unknown. A catalog listing does not inspect work. User completion suppresses an older same-scope reminder with reported assurance. Fresh attributable contrary evidence displays a conflict and a bounded next source check. Capability operation, executor, host and endpoint stay distinct. Budget notices and alerts never imply a spending stop.

Keep corrections in the existing native note or responsibility register. Read back an opaque note reference when available. Conversation-only corrections still affect the draft with persistence uncertainty. Briefing evidence is never a later correction source.

`checked` with exit 0 means current guidance and consistent declared inputs. `revise` with exit 3 returns findings and guidance without a normal body. `degraded` with exit 3 returns a useful qualified body when guidance or correction recovery is unavailable. Invalid input exits 2. Guidance-only mode reports its availability without claiming a draft check. Hashes prove bytes, not understanding, source truth or native recovery.

The command retains complete immutable guidance snapshots and exact per-run artifacts under `<private-home>/briefing/`. Failed refresh keeps the original successful main-check time. Pending or corrupt snapshots cannot replace verified guidance. Responsibility backups exclude these disposable caches and briefing evidence. Native adoption, automatic invocation, schedules and later-turn correction recovery require the actual Dot probes.

The human body contains scoped status, source links, material limits and declared coverage. Source claims remain reported. Unchecked entry labels, opaque references, routine checker prose and the full date inventory stay private. Safe absolute HTTP(S) references become Markdown links. Entity-safe Markdown preserves literal ampersands and entity text in source URLs, scopes, coverage and gaps. Private assessment evidence retains canonical URLs. Unsupported schemes and malformed references remain private with a missing-link limit. Credential-bearing HTTP(S) source, correction and endpoint references are refused before acquisition or draft retention, without echoing the URL.

## Prepare declared input

Use this shape. Replace placeholders with the current guidance digest and actual UTC read times. The synthetic names convey no personal task state.

```json
{
  "schemaVersion": 1,
  "authoredUnder": "<returned SHA-256>",
  "sources": [
    {
      "id": "cedar-pending",
      "scope": { "subject": "Cedar", "effect": "complete report" },
      "reference": "synthetic:older-chat",
      "kind": "chat",
      "contentAt": "<actual content UTC>",
      "retrievedAt": "<actual retrieval UTC>",
      "availability": "available",
      "coverage": { "complete": true, "gaps": [] },
      "claim": "pending",
      "attribution": "attributed"
    },
    {
      "id": "cedar-completion",
      "scope": { "subject": "Cedar", "effect": "complete report" },
      "reference": "synthetic:user-correction",
      "kind": "user",
      "contentAt": "<actual user correction UTC>",
      "retrievedAt": "<actual retrieval UTC>",
      "availability": "available",
      "coverage": { "complete": true, "gaps": [] },
      "claim": "complete",
      "attribution": "reported"
    }
  ],
  "coverage": {
    "selection": "Cedar chat and scoped correction only",
    "catalogListed": [],
    "chatsRead": ["cedar-pending"],
    "repositoriesInspected": [],
    "otherSourcesRead": ["cedar-completion"],
    "gaps": ["Other projects were not read"]
  },
  "correctionReadback": [
    {
      "scope": { "subject": "Cedar", "effect": "complete report" },
      "state": "reported-readback",
      "reference": "opaque-note:cedar",
      "completionSourceId": "cedar-completion"
    }
  ],
  "entries": [
    {
      "kind": "reminder",
      "scope": { "subject": "Cedar", "effect": "complete report" },
      "label": "Cedar report reminder",
      "state": "pending",
      "sourceIds": ["cedar-pending"]
    }
  ]
}
```

Include separate optional `metadataAt` on a source when known. Omit unknown `contentAt`; it then cannot establish a current state. Every timestamp uses real UTC with seconds and optional three-digit milliseconds. A new retrieval never renews content. Newer metadata leaves current content unverified.

Declare sources only within the read coverage that occurred. `catalogListed`, `chatsRead` and `repositoriesInspected` reference their corresponding source kinds. `otherSourcesRead` accepts `native`, `user` and `budget`. A listing cannot establish current work status. Available source coverage must also be complete for current support. Keep partial coverage gaps visible.

Use `available`, `unavailable`, `denied` or `unknown` for source availability. Use `reported` or `attributed` for declared attribution. The checker treats both as reported input. It cannot authenticate the attribution.

Use `reported-readback` with an opaque `reference`, `conversation-only` or `unavailable` for each scoped correction readback. Set `completionSourceId` only to its matching covered `user` source with claim `complete`. Omit it when no completion was recovered. An older user completion still suppresses an older same-scope reminder as it ages. Missing or future completion support cannot establish that suppression. Conversation-only corrections still affect the briefing, with persistence uncertainty. Missing correction readback for a status or reminder degrades the result.

Use these entry kinds and states. Each supplied source must match the entry's exact scope and state. Different effects remain distinct even for one subject.

| Kind | States | Scope |
| --- | --- | --- |
| `status` | `complete`, `pending`, `unknown` | `subject`, `effect` |
| `reminder` | `pending` | `subject`, `effect` |
| `capability` | `working`, `authentication-required`, `denied`, `untested` | Also requires `operation`, `executor`, `host`, `endpoint` |
| `budget` | `notice`, `alert`, `spending-stopped` | `subject`, `effect` |

An entry with no support renders unknown. Declare a contrary report as another covered source. A fresh attributed `pending` report later than a scoped user completion produces a visible conflict and next source check. A budget notice or alert cannot produce `spending-stopped`. A separately supplied stop remains reported, with enforcement unverified. Free-text labels remain in private evidence and cannot replace the structured state.

Keep the draft below 262144 bytes. Each array accepts at most 128 items. Text fields contain one nonempty line, at most 1000 characters. Duplicate decoded field names in any object, including escaped aliases, are rejected before guidance fetch or draft retention. Duplicate IDs, duplicate coverage references, duplicate correction scopes, missing fields and unexpected fields are rejected. An arbitrary complete `body` is not accepted. References to absent source IDs or mismatched scopes return revision findings without a body.

## Repair or retain a limit

For `revise`, read the returned guidance and repair the actual draft. Do not change only the digest to silence a revision. Run the command again after the source or draft changes. For `degraded`, retain its explicit limits in the exact returned body.

The refresh shares one ten-second network deadline and allows at most 1048576 bytes per API response. The bundle itself is at most 262144 bytes. The canonical GitHub API supplies one main commit, its pinned tree and the bundle's pinned blob. One additional GET is allowed in total, at the failed stage, for recognized transient machine causes or HTTP 502, 503 or 504. An accepted main pin is never resolved again. A valid `Retry-After` must fit the remaining deadline. Unknown transport failures, aborts, permanent HTTP failures, redirects, byte limits, JSON, pin, integrity and version failures cannot retry. No fixed delay or new deadline is added.

Embedded approved paths, bytes and content digests must match. An incompatible schema or checker version requests an installed-checker upgrade. Review and install that code through [the coding delivery workflow](change-delivery.md). Downloaded guidance never executes it. Recovery establishes only that this acquisition succeeded.

Guidance-only mode returns its availability and, when current or cached guidance is usable, `guidance.text`. An unavailable state returns its reason without readable guidance. Draft mode returns `status`, `guidance`, `findings` and, when usable, `body` and `bodyDigest`. `evidence` names the immutable receipt, `refresh` trace, draft-only `assessment` and exact body file. Keep these technical fields private. Only the returned body is the human briefing.

One assessment owns eligibility, scope, correction and status decisions for both private evidence and rendering. Its retained bytes bind the input digest, guidance digest, evaluation time and exact body digest. The receipt also hashes the assessment and refresh files. Revision findings have no body digest. The refresh trace retains accepted pins, stage attempts, phases, HTTP status, bounded machine cause codes, timing and every retry or refusal decision, including failures followed by successful recovery. It excludes remote error bodies, arbitrary error messages, headers and stacks. The guidance cache receipt remains schema 1.
