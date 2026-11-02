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

The native parent has262144 evidence bytes and32 provider calls per admitted job. The local exporter also bounds its execution windows and diagnostics. These limits do not impose an identical universal budget on a separate cloud runtime. A returned tool action is a reserved permission. An actual response supplies evidence of an attempted call. An unavailable response leaves the effect uncertain.

The minimal controller is a separate status-only boundary. It accepts bounded launch identities and a registered controller directory identity. It reads only bounded exact claim metadata. It cannot acquire request bodies, source headers, shards, response journals or provider data. Both an unclaimed status and a refusal grant no execution permission. Automatic retry stops.

Operational admission, controller authorization, actual materialization helpers and cloud acceptance remain parent-owned. Synthetic adapter calls do not prove the number of actual connector or helper calls. Finite retained queue capacity does not prove recurring operation.
