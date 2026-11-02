# Direct cloud reporting reader

Build with `npm run build:reporting-cloud`. Copy the generated executable, its exact source manifest and schemas from ignored `.local/reporting-cloud/` into the separately authorized environment. The same generated `automation-reporting-cloud-v2.mjs` retains `prepare`, `verify` and `bind` unchanged and adds a supported command:

```sh
node automation-reporting-cloud-v2.mjs consume --scope /absolute/private/scope.json --capture /absolute/private/capture.json --action inspect --evaluated-at 2026-01-02T00:00:00Z
```

`consume` uses Node24+ standard libraries and already downloaded raw bytes. It performs no provider calls, writes, collector refresh, binding refresh or workload actions. It follows no URLs or record artifact references. The executable needs no repository, installed Emmy source or hidden module access. Actual cloud Node availability and source acquisition capability require separate parent-owned acceptance.

Read actions are `status`, `inspect`, `list` and `get`. Optional flags are `--namespace`, `--automation-id`, `--id`, `--query`, `--cursor`, `--limit`, `--max-age-seconds` and `--finding-cursor`. They have the canonical reader's meanings and bounds. `get` retrieves exact historical records as diagnostic bodies, including records whose current projection is unusable; retrieving a body does not accept it as a current outcome.  `list` includes all supplied revisions and attempts. Aggregation validates the full approved history before filters and pagination. Local filesystem reads and capture reads call the same `projectReadView` in the existing reporting owner. There is no second aggregation engine or temporary store.

## Approved scope and acquired data

The caller supplies a separate [read scope](../schemas/automation-reporting-read-scope-v1.schema.json). It approves the exact root folder, namespace folder identities, automation IDs and optional control authority. It has no binding expiry or collector-freshness gate. A stale collector, registration observation or source clock cannot hide an otherwise valid old report. Canonical staleness and expectation applicability remain visible. Original clocks, null reports, unbound provenance, revisions and all attempts survive unchanged. A supplied report or verified receipt remains reported evidence.

The [capture](../schemas/automation-reporting-capture-v1.schema.json) contains an inventory plus exact downloaded record bytes, encoded locally as canonical base64. Do not request provider inline base64. Each record's original raw hash and size, filename content digest, exact parent, namespace and approved automation identity must agree. UTF8 is strict, duplicate JSON keys refuse, and records require exact canonical JSON with a final newline. Schema, ancestry, conflicts, occurrence dependencies and receipt subjects use the existing engine. Structural corruption, wrong scope, duplicate identities and unsafe bytes refuse the request. Incomplete acquisition preserves available valid bodies with `scan.complete=false`; current run outcomes become unusable.

There are two inventory modes:

- `pages`: each folder listing carries `mechanism="snapshot-cursor"`, an evidence reference, generation, before/after generations, total entries/pages and explicit cursor/EOF pages. Before generation must equal the page generation. An absent or changed after generation yields incomplete diagnostics. Every supplied page must continue the exact preceding cursor and generation. Page count, entry count and final EOF must agree. Every configured namespace needs its listing and root entry. These are attributable source evidence, not authenticated assertions.
- `pinned`: the approved scope pins the exact immutable inventory ID and raw SHA256. The acquired inventory supplies that ID and complete canonical bytes. The [history inventory](../schemas/automation-reporting-history-inventory-v1.schema.json) enumerates all namespace files, including predecessors, all attempts and conflicting branches. It is distinct from the scope configuration and binding snapshots. A single-run display export or binding snapshot is not a history inventory. The consumer verifies the exact approved pin and bytes; it cannot establish who produced the inventory or whether unseen records exist.

A generic folder fetch returning100 entries without cursor/EOF and generation evidence, or a search response filtering JSON files, cannot establish complete history. A caller `complete=true` field is unsupported. Matching generations or repeated reads of one mutable manifest do not establish globally latest or atomic provider state. The caller must establish that the actual supported acquisition mechanism provides the claimed full-history inventory. If neither supported pagination nor an already approved immutable complete-history export exists, actual cloud consumption remains a source-integration gap. Do not create a new publisher, service or per-read Studio export to conceal that gap.

`test/fixtures/reporting-capture.mjs` generates synthetic examples for both modes. Its identifiers and evidence references are fictitious. Fixtures prove local contract behavior only. Real folder IDs, scope approval, immutable pins and capture bytes stay private under ignored `.local/`.

## Bounds and reproducibility

The root inventory allows200 total entries and the namespace inventories allow5000 files total across all namespaces. Additional independent limits are1000 supplied pages total,32MiB capture packet,128KiB scope,200 approved automation IDs per namespace,4MiB immutable inventory,16MiB total record bytes and32769 raw bytes per record. A record's canonical JSON body still has the existing32768-byte bound. Exceeding bounds refuses acceptance; no partial packet becomes clean. Missing pages, files or namespace listings produce incomplete diagnostics when their supplied structure is otherwise valid.

Output adds capture provenance and `resultSha256`. The digest binds exact raw scope/capture hashes, evaluation time, requested action/query/options, capture rules version and the returned canonical view. Whitespace changes in scope/capture input change its digest. Read success, byte equality and a result digest establish no workload success, remote publication, delivery, future firing or globally latest provider state. `providerLatest` is always `not-established`.

## Verification boundary

Run `node --test test/automation-reporting-capture.test.mjs` and `npm run verify:reporting-capture`. Tests compare fixed-clock filesystem and capture projections, execute the copied standalone artifact outside the repository and drive corruption, strict parsing, scope, interrupted pagination, aggregate bounds, history, conflicts and receipts. Copied-source mutations require concrete wrong acceptances/projections and restored controls. Import errors and unrelated exceptions never count as witnesses. Evidence is retained under ignored `.local/consumer-evidence/`.

The [capture mapping](../verification/automation-reporting/capture-coverage.md) records this boundary outside the existing four TLC graphs and25 paired model/source mutants. Their source pins and assumptions remain unchanged until independent exact-source review. Full checks, formal source review and actual parent-owned cloud acceptance remain separate gates.
