# Native evidence accounting revision

Revision `native-evidence-v2-identical-utf8-once` applies prospectively. Earlier measurements remain development evidence under their original accounting rules.

| Operation | Evidence allowance | Separate diagnostics |
| --- | --- | --- |
| Actual source or private-state file read | Full bytes actually acquired on every read | Read calls, elapsed time and metadata |
| Identical canonical JSON text and UTF8 buffer | One logical durable or returned representation | Serialization and temporary memory |
| Exact raw buffer persisted | No second representation charge for that persistence | Actual write bytes and operations |
| New durable request, cursor, journal, fragment or evidence frame | Exact full serialized bytes once | Temporary encoding buffers |
| Ledger summary and returned outer envelope | Each distinct full frame once | Nested values are categories, not additional bytes |
| Distinct Base64 artifact | Full encoded representation when retained or returned | Transient processing alone is diagnostic |
| Internal `lstat`, `fstat` and decoder objects | No evidence-byte charge when neither retained nor returned | Metadata sizes, calls and memory |
| Actual connector metadata or error response | Full acquired response and each new retained or returned frame | Provider attempt attribution |
| Pending execution reservation | Remaining allowance unavailable, not measured acquired bytes | Known lower bounds and uncertain effects remain separate |

Actual filesystem traffic and the charged representation total are different counters. No content deduplication exempts an actual reread. A live ticket can reuse buffers it already acquired and charged. A new ticket or process acquires its required bytes again.

The native parent has262144 evidence bytes and32 provider calls per admitted job. The local exporter also bounds its execution windows and diagnostics. These limits do not impose an identical universal budget on a separate cloud runtime. An owner-turn grant reserves one permission against an already durable intent. Its returned commit receipt is historical and does not establish current eligibility. Pending invalidation artifacts, raw references, owner-turn candidates, CAS loser reads and head checkpoints are charged normally. A failed or uncertain callback cannot reset the reservation. An actual response supplies evidence of an attempted call. An unavailable response leaves the effect uncertain. Before exact prior-ledger validation, cumulative provider counters are null with `providerAccounting: prior-ledger-unread`. Such an unresolved ledger grants no later permissions.

The minimal controller is a separate status-only boundary. It accepts bounded launch identities and a registered controller directory identity. It reads only bounded exact registration and claim metadata. Registration is written by the existing exporter only after charged ordinary source/state overlap and owner/scope validation. Its source-root path is a registered profile field, not free source acquisition. File-first bootstrap refuses. Normal execution charges a separate exact profile acquisition before source use. It cannot acquire request bodies, source headers, shards, response journals or provider data. Both an unclaimed status and a refusal grant no execution permission. An expired or exhausted launch can retain only bounded execution-refusal metadata. Its control counters name the input, claim reads, refusal writes, output, operations and original control start. No body, source header or prior ledger is free controller input. Normal execution claims the ticket and charges any prior ledger and request acquisition before source work. Automatic retry stops.

Operational admission, controller authorization, actual materialization helpers and cloud acceptance remain parent-owned. Synthetic adapter calls do not prove the number of actual connector or helper calls. Finite retained queue capacity does not prove recurring operation.

Response intake reserves8192 additional evidence bytes and256 filesystem operations before body/raw acquisition, independently of the terminal result reserve. `retentionReservation` is unavailable allowance, not known acquired usage. A durable owner `receipt-open` precedes acquisition and stays held on expiry, crash or missing bytes. Owned input/raw copies reuse the exact charged representation once; metadata, owner turns and every actual reread are charged separately. Caller paths alone are not owned evidence. Recovery must bind actual bytes to the old immutable attempt and preserves its original deadline as history.

Terminal refusal finalization has its own at-most2000-millisecond window, at most8192 representation bytes and one metadata-write attempt. It uses memory counters only. It cannot acquire payload or advance owner state after the original deadline. A complete ledger adds known write bytes; an interrupted write reports uncertain bytes rather than inventing actual usage. Its attempted summary representation and returned failure frame remain charged. EEXIST, timeout and crash do not trigger private rereads or repeated ledger writes. Late earlier success is historical and grants no fresh execution.
