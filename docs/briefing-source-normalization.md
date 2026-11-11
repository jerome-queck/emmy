# Briefing source normalization

`briefing-acquisition.mjs` retains supplied raw tool bytes, then `briefing-source-normalization.mjs` checks projections and source clocks for the pure compiler. Supported native tools remain agent-owned. These helpers are not an installed NEW briefing caller.

## Exact field projection

`compiler-fields-v1` selects values through explicit JSON pointers. It supplies no semantic defaults. `sourceFields` maps compiler source field names to pointers. `itemsPointer` selects the item array, `itemFields` optionally maps each item field relative to that item, and `cursorPointer` selects the explicit nullable next cursor. Without itemFields, items pass unchanged. Nested mail reviews must contain the existing explicit context judgments. Generic provider headers cannot manufacture those judgments.

Provider results usually lack inventory, coverage, observation clocks or owner overlays. Keep those declarations in a separate exact UTF-8 JSON observation file. Put its exact base64 bytes in `observationBytes` and its externally recorded hash in `observationSha256`. The projection then sees `{provider: <parsed original tool payload>, observation: <parsed observation file>}`. Original tool bytes remain unchanged. The complete sidecar bytes and projection are retained in the immutable receipt. Both hashes and all pointers are replayed before normalization. For example, `/provider/items` selects a provider list; `/observation/observedAt` selects a separately acquired clock. Missing pointers refuse.

Observation declarations are reported evidence. The caller checks byte identity and compiler constraints; it cannot authenticate source truth or completeness. Retain the actual inventory/read/context evidence supporting those declarations. Never infer original observation time from this replay's clock, invent complete coverage, replace unknown booleans with false, or equate missing context with safe review. Unknown Task dismissal/move overlays become null and are suppressed with an explicit gap. A missing native status refuses. Partial coverage and original gaps survive terminal pagination.

A tool wrapper must contain one supported complete JSON payload or structuredContent. Tool error results, ambiguous content blocks, wrong cursor, changed retained raw or observation bytes and divergent projections refuse. A partial failed acquisition retains its raw/accounting evidence; it does not become a compiled complete source.

## Date-only Calendar events

Google documents `start.date` and `end.date` for all-day events and an exclusive end in its [event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events). Map the exact provider dates to `start` and `end`. Supply explicit `allDay: true` and actual calendar `timeZone` evidence through the retained observation. Preserve native identity, status and any Task association evidence. No timestamp is synthesized.

The current Singapore-day compiler accepts date-only events only with `timeZone: "Asia/Singapore"`. It selects `start <= day < end`, validates actual dates, preserves the source dates and timezone in its exact input digest, and renders an all-day row. Other source zones refuse explicitly. Cross-zone day overlap is unsupported and must remain a source gap until an evidenced adapter exists. Timed events keep the prior exact UTC timestamp contract. Source-date normalization is additive and requires a new pure package; frozen pure 1.0.1 does not support it.

## Acceptance and limits

`node --test test/briefing-source-normalization.test.mjs` exercises production acquisition and normalization with synthetic raw-byte sinks, followed by the fresh prepare CLI. It covers original clocks, unknown fields, Calendar identity, pagination, raw errors and sidecar correlation. It does not prove native tool binding, provider truth or NEW adoption.

The old file capture exchange and effect adapter are retired. Its standalone script is removed; unsupported invocations create no descriptor or output files. Historical captures and immutable installed packages remain recovery evidence on copies. No new schedule or migration is implied.

## Flat Calendar search responses

`calendar-search-flat-v1` accepts the parent-reported `structuredContent.events` shape with flat offset-bearing `start` and `end`, `id`, `summary`, `status`, and optional paired `recurring_event_id`/`original_start_time`. This shape was reported from cloud sampling. Local fixtures are sanitized synthetic examples, not actual provider captures. Calendar list `id`/`summary` is inventory evidence only; retain its full original response separately. It supplies neither event timezone nor native Task linkage.

The projection contains `contract`, exact base64 `observationBytes`, and independently supplied `observationSha256`. The sidecar is a JSON object with:

- `source`. Existing compiler source metadata without `items`. Explicit original `observedAt`, `capturedAt` or the collector observation below, plus `complete`, `paginationComplete`, `gaps`, `window`, `resourceIds`, and `acquiredResourceIds` are required.
- `requestedCalendarId`. The exact calendar ID supplied to the search. It must belong to request `resourceIds`; this page's `acquiredResourceIds` must contain only that ID.
- `provenance`. Actual `environment: "dot-cloud"`, `surface: "connector"`, runtime tool name in `tool`, and retained read evidence reference in `sourceRef`.
- `nextCursor`. Explicit actual next-page cursor or independently evidenced terminal `null`. It must equal the raw `next_page_token`. Explicit raw null must match sidecar null under the local terminal contract; nonempty strings continue, and empty strings or other types refuse. An omitted raw token is accepted only with sidecar `nextCursor: null`, `source.complete: false`, and `source.paginationComplete: false`; normalization preserves a pagination-unknown gap and cannot advance the cursor or establish end-of-feed. Tool metadata documents continuation inputs but supplies no output schema, so this preserves the existing reported flat contract without proving provider EOF semantics.

Request `requestedCalendarId` must equal the sidecar ID. Request `window` and `resourceIds` must equal sidecar metadata. Acquisition retains the supplied source request beside raw bytes before projection. Source provenance is an attributed sidecar declaration, not provider-authenticated truth. Keep requested-calendar and calendar-list acquisition evidence separate from event fields. Missing sidecar clocks or unknown coverage require partial/unavailable evidence; never substitute execution or replay time.

Offset-bearing strings are converted to canonical UTC instants. Original strings and all original response blocks remain in retained raw bytes. Offset-free or date-only strings refuse this contract. All-day type, native Task link, iCal UID and source IANA timezone remain unknown. `allDay`, `taskId`, `timeZone`, and `iCalUID` are null; the compiler renders `Timing type unknown` with the explicit interval and coverage gaps. Midnight does not establish all-day type. Event ID does not establish native Task identity. An unobserved all-day example remains unsupported by this flat contract. The existing explicit date-only contract remains separate.

Recurrence series and original occurrence instants survive normalization. Without an iCal UID, deduplication is scoped to the requested calendar plus series/original occurrence, or event ID for nonrecurring events. A calendar/native ID cannot change recurrence series or mix recurring and nonrecurring records. Distinct original occurrence instants may share a recurring native ID. Identical copies deduplicate; conflicting timing, cancellation, identity or provenance on the same native occurrence refuses. Cancelled occurrences remain retained but are omitted from Today. Missing required cancelled-event timing or title refuses rather than inventing values. Extra event fields claiming known all-day, Task, calendar or timezone metadata refuse this particular contract so richer evidence cannot be silently discarded.

The shared raw parser rejects provider `isError: true` and nonempty top-level `error` strings or non-null error objects at each supported structured-content or JSON-text wrapper, including sibling JSON content when structured content is present. An outer `isError: false` cannot erase an inner failure. Event text mentioning errors and `error: null` remain valid. Generic field projections take cursors from retained provider bytes, compare any native `next_page_token` or compiler `nextCursor` witness, and cannot replace continuation with a terminal sidecar.


## Calendar collector observation

Calendar source metadata may include exactly `collectorObservation: {basis, startedAt, endedAt}`. Retain the real cloud collector clock immediately before the provider read and immediately after its complete serialized result. Record these original bounds in the independently hashed sidecar. The file exchange's own `startedAt`/`capturedAt` measure later file ingestion. They never supply or refresh the collector observation.

`basis: "current-read-start"` requires provider `observedAt` and `capturedAt` both explicitly null. Freshness uses the original collector `startedAt`, with the existing five-minute threshold. The compiler always reports provider snapshot clocks unknown and collector observation only. Recent collection establishes no provider snapshot freshness. Items and selected-calendar pagination can remain usable, while unknown fields and inventory keep evidence coverage partial.

`basis: "original-provider-clock"` requires both original provider clocks, with `observedAt <= capturedAt <= endedAt`. Freshness uses provider `observedAt`, even when collection is recent. Never replace a known stale provider clock with collector time. Legacy sources with original clocks remain supported without this additive field.

Both bases require canonical UTC millisecond timestamps and `startedAt <= endedAt <=` the ingestion capture clock and assessment `asOf`. Missing, malformed, future or inverted bounds, extra observation fields, unsupported bases and mixed page bases refuse. Every page must retain the same explicit basis. Aggregation keeps earliest collector start and latest collector end, original provider clocks or explicit nulls, exact raw cursor lineage and all partial coverage/gaps. Replay preserves those clocks and ages the same evidence. No replay-time fallback exists.

A selected resource inventory does not establish full-account inventory. Retain actual inventory evidence and explicit missing/unknown coverage gaps. Unknown all-day type, Task linkage and timezone retain their existing null values and human-visible gaps. Hashes bind declarations and bytes; they do not authenticate provider or collector truth. This contract is covered by actual caller, exchange, prepare CLI and portable synthetic controls, outside existing finite/TLC source-truth promises.

## Retain observation in the journal

For v3 Calendar and Calendar inventory only, a morning source command may carry `providerObservation` with exact `observedAt`, `capturedAt`, and `collectorObservation` members. Provider timestamps retain their original values, including paired nulls. The generic receipt retains actual acquisition timestamps. Original collector bounds may predate that wrapper and must end no later than acquisition completion. Source freshness also checks the original effective clock. Collection captures retain the same observation and bind its aggregate to the source command. One Calendar aggregate requires a homogeneous basis and explicit observation on every capture. Same receipt reuse cannot rewrite or remove an observation. Historical v1/v2 and ordinary known-provider-clock paths remain unchanged.
