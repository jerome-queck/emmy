# Emmy's architecture

Emmy coordinates responsibilities through native Dot, Work, and Codex tools. This repository supplies a portable operating brief and a local CLI for orientation, task proposals, evidence assessment, and upkeep. Native task records remain authoritative for execution.

## Caller workflow

1. Read the public project and capability catalog. Import a current native inventory into private storage when available.
2. Prepare a task proposal naming its outcome, source context, authority, project, executor, and completion evidence.
3. Use the native product to dispatch authorized work. Retain its actual identity and location.
4. Inspect the result and current revision. Assess matching evidence and retain limitations.
5. Refresh generated references and run the repository's verification commands after a change.

The CLI prepares and assesses files. It does not create native chats, run a remote worker, install Dot settings, or save provider schedules. An assessment checks structure and selected local artifacts. It does not authenticate a remote claim.

## Data and ownership

One public registry holds project identities, source-backed capability claims, integration priorities, and probe definitions. Private bindings resolve local paths and native references. Scoped, timestamped snapshots retain coverage gaps. Each task and receipt is an independent immutable record.

Pure planning owns route selection and the task packet. Pure assessment owns evidence matching. A storage boundary owns parsing, canonical hashes, and private file publication. One command table owns argument metadata and generates references. Verification metadata connects every public command to its behavior feature.

`src/work.mjs` owns pure `planTask`, `snapshotStatus`, and `assessOutcome`. `src/records.mjs` owns input parsing, local byte checks, canonical hashes, and immutable directories. `src/catalog.mjs` reads public registry data. `src/metadata.mjs` is the sole command and verification metadata source. `src/maintenance.mjs` derives public references from that public input. `scripts/agent.mjs` is the local CLI boundary. The [CLI reference](cli.md) defines JSON and exit codes.

The catalog is public metadata. `.local/bindings.json` supplies designated host, exact native project ID, absolute path, and optional prepared cloud environment. Private bindings can register projects outside the seeded catalog. Snapshot imports require timestamp, observer, executor scope, availability, coverage, and gaps. Normalized and combined native Codex listing shapes are supported. Imports remain reported. A current observation is at most 24 hours old, including the boundary, and is never future-dated.

Proposals record the request, source context, authority, base revision, catalog and binding digests, snapshot ID, exact executor, route status, finish criteria, and limits. Code revisions use full commit SHAs. A task record is `proposal-only`. Receipts and assessments are separate immutable records. Assessment compares current result revision, task, project, executor, and criterion. It reads local artifact bytes for digest claims. Hand-entered native check output remains reported. A contradictory claim prevents support. The caller must separately observe the current native revision.

Publication writes a complete temporary directory, then renames it to the content ID. Concurrent identical publication converges on the same bytes. Existing corrupt records fail. An interruption can leave a recognizable `.pending-*` directory, which readers never treat as a record. Replay does not depend on the temporary directory. There is no promise of durable recovery after storage hardware failure.

Normal code work selects local Codex on the project's designated Mac. Other local dependencies select an appropriate local executor. An explicit justified cloud route can use a prepared environment. A missing or offline designated host stays visible. It does not silently select another Mac.

The Dot cloud computer, cloud Work, Codex Cloud, and each local Mac are separate environments. Current documentation supports only one personal-computer connection for Dot. Native Codex's remote-host inventory must be tested separately before Emmy relies on it. See the [capability matrix](research/dot-capabilities.md#capability-matrix).

## Verification

The behavioral skill drives the actual CLI in isolated temporary workspaces. Evidence survives cleanup. Its feature map covers orientation, routing and proposals, evidence, and upkeep.

Bounded exhaustive checks call production decision functions over declared finite domains. Mutations must break the intended property and produce a counterexample. Covered-source hashes detect drift. A reviewer confirms the mapping before advancing the formal sync record. These checks do not prove account access, arbitrary remote execution, real scheduling, or the truth of imported reports.

Auto-merge has its own exact-revision checks and independent-review status. Required repository rules enforce those gates. Code changes can merge automatically after verification. No separate human approval step is added by this kit.

## Synthesis decision

Two independent Sol max candidates compared a registry planner with an event ledger. An independent Sol max judge scored them against six criteria. The registry design scored 27 of 30, and the ledger scored 24 of 30. This is a design judgment, not a measured performance result. Model diversity was intentionally disabled by the user's instruction.

The registry planner is the base. Command, scenario, and property metadata joins, plus explicit JSON and exit-code contracts, come from the ledger candidate. Both designs retain receipts. Identity includes task, executor, project, and revision. Imported success stays reported unless the relevant check actually observes it.

A central ledger would duplicate native lifecycle state before Emmy's task bridge has been tested. A resident runner would add authentication, lifecycle, cancellation, and synchronization work. Neither belongs in this first version. Reconsider after repeated real workflows demonstrate a need for global deduplication, replicated history, or a supported dispatch API.

Model the Domain shaped the explicit route and evidence records. Separate Before Serializing Shared State shaped independent immutable files and isolated writer worktrees. Build the Lever shaped the maintenance generator. Prove It Works requires actual CLI journeys and failed mutation evidence before closure.
