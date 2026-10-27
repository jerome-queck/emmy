# Existing Calendar and Tasks integration

Evidence reviewed on 27 October 2026. Private host names, addresses, paths, native IDs and raw readbacks stay in ignored `.local/`.

## Observed route

Studio's existing SSH configuration reaches the always-on Mini through an existing IP alias. The named alias failed DNS resolution before remote execution. The configured IP route succeeded without an SSH, security or network change.

Mini already runs Academic OS's resident Operations MCP server over its tailnet interface. Its documented second-machine setup registers the existing Streamable HTTP URL in the client. The server needs no client credential copy. Its tools cover Module and Research-project Tasks. Its source uses separate scheduled-read and interactive-write credentials.

Studio's Codex configuration initially had no Academic OS entry. The initial task tool catalog also had no Academic OS bindings. Codex's supported `mcp add` command registered the existing service. `mcp get` read back an enabled entry. The task catalog later exposed all eight bindings. A newer module thread reported the same four Module bindings. This timing supports session/tool refresh as the exposure difference. It does not establish the exact cache lifecycle of every older thread.

Direct Studio `tasks_read_register` backend use succeeded. Supported pulls for the two requested module/research mirrors returned fresh rows. Separate canonical-store reads produced matching row digests. Pulling uses the provider-read credential and updates canonical mirrors. It does not push a stale local register to Google, overwrite the native schedule or clear notes. A later direct pull observed source changes after an earlier zero-change pull; the private evidence retains both observations.

Separate later SHA-256 readbacks found the requested module/research registers byte-identical on Mini and Studio. A fresh backend response had preceded local propagation. Native Task time and duration still require the independent UI evidence, because the mirror contains day-granularity data only.

The existing `tasks_change` schema has no provenance field. Create accepts provenance, and pull preserves existing provenance in the mirror. This gap cannot be repaired by hand-editing a module register contrary to its router.

## Reported cloud read access

A later parent-owned check successfully opened Calendar through normal supported cloud navigation and read ten native Task lists, including active and collapsed completed sections. Calendar settings explicitly showed GMT+08 Singapore. This corrects the earlier inference that the transient origin-review failure prevented cloud access. Cloud write/save behavior and exhaustive completed history were not tested by that check. Exact private account and task readbacks remain outside this repository.

Two same-task comparisons reported Task-list labels one hour earlier than their Calendar intervals despite the explicit Calendar timezone. The cause remains unverified. Preserve both observations and require exact native ID, Calendar or native-detail timing, and explicit timezone before a dependent timed operation. Do not compensate by shifting an item. Active-looking cancelled or superseded rows still require the owner lifecycle overlay.

## Documented capabilities

| Provider or client | Title | Scheduled day | Start/end/duration | Completion |
| --- | --- | --- | --- | --- |
| Google Tasks REST | Read/write | `due`, day only | Unsupported | Read/write status |
| Existing Academic OS MCP | Create/change | `do_date`, day only | Unsupported | Complete and refreshed status |
| Google Calendar Event REST | Summary read/write | Derived from Event interval | Start/end supported; duration derived | No native Task completion |
| Calendar native Task UI | Supported | Supported | Native scheduling; recurring Tasks cannot have an end time | Native Task completion |

Google's current [Task resource](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks) calls `due` the scheduled calendar day, not a deadline. It explicitly excludes scheduled time from API reading and writing. The resource has no native start, end, duration, timezone, separate deadline or recurrence field. Missing fields cannot prove native absence. `webViewLink` opens the native Task. No documented Task-to-Event ID mapping permits joining by title.

Broad Tasks collection needs exhausted pagination and explicit `showCompleted`, `showHidden`, `showDeleted` and `showAssigned`. The inspected Academic OS reader includes the first three but omits `showAssigned`. Its configured-list mirror is useful, but it cannot claim complete account-wide collection. See [Tasks list](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list) and [Task-list discovery](https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists/list).

Calendar occurrences need a bounded [Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) with provider expansion, deletion and hidden-invitation coverage. Retain [Event status, transparency and exclusive end semantics](https://developers.google.com/workspace/calendar/api/v3/reference/events). All-day dates use the source Calendar's timezone. Cancelled recurring exceptions can have only identity and original occurrence data.

Academic OS's stored Calendar refresh uses `singleEvents: false` with query-bound sync tokens. Its proposal reader also offers a bounded expanded-occurrence query. The stored-series mirror is not the planner's occurrence register. [Sync tokens](https://developers.google.com/workspace/calendar/api/guides/sync) require compatible queries, a final-page token and a full rebuild after expiration. The new bounded collector uses full reads to avoid a second incremental-sync engine.

The official Calendar MCP preview's published [list schema](https://developers.google.com/workspace/calendar/api/v3/reference/mcp/tools_list/list_events) does not expose equivalent completeness controls. Its defaults omit some Event types. The [native Task UI documentation](https://support.google.com/tasks/answer/9901136?co=GENIE.Platform%3DDesktop&hl=en) also limits displayed upcoming recurring Task instances. Neither free/busy nor a visible grid establishes complete native Task scheduling.

## Selected implementation

The [register contract](../calendar-register.md) adds immutable derived JSON exports and a pure planner. The provider collector can refresh supported data using the existing Academic OS library and read credentials on their designated executor. Exact native Task schedule and projection evidence remain separate, because the APIs do not expose them.

A dedicated calendar reducer and executable queue were considered. They would add journal record types, publication dependencies, archive rules and another lifecycle owner. Derived exports keep native Tasks authoritative and leave intent, owner corrections and attempts in the existing responsibility evidence.

The collector is tested with an injected provider and a real CLI using a synthetic GoogleAuth dependency. A later owner-authorized deployment installed a versioned private copy on Mini and verified every packaged file hash. One live capture exhausted eighteen source chains: six listed Calendars and ten Task lists, including completed, hidden, deleted and assigned Tasks. Its partial-response profile requests planning fields only, excluding Task notes and Event descriptions. Private evidence retains the original acquisition times, queries, hashes and immutable snapshot; no provider mutation, recurring job or credential grant was performed.

The live capture exposed a parser assumption that rejected valid UTC Event timestamps beside IANA recurrence timezone metadata. The correction retains each explicit-offset instant, validates the named timezone and leaves proposal wall-clock checks unchanged. Reassessment of the same retained capture protects all forty-two observed meals, including eighteen Free meals. The snapshot still cannot certify free time: native Task timing, owner history and visual review remain missing. A concurrent authorized migration also means observed correction Events/Tasks are transitional, not final identity mappings. Separate Tasks credential account identity is not independently proved by Calendar primary-account discovery. These limits remain visible rather than being normalized away.

## Academic OS convergence diagnosis

The observed source resolves changes and completion by exact native Task ID inside the configured list. It does not select a provider Task by title or row index. After a narrow patch it reads back the same Task, then calls the same pull/merge path used by periodic refresh. Register YAML nodes also match provider ID so local annotations and provenance can survive changed native titles and dates.

Malformed YAML prevents parsing the affected register before provider access. That module's refresh reports stale and preserves its file; a multi-target refresh continues other modules. This explains the earlier MH2100 failure. A later external repair and provider completion were observed; this investigation did neither. Treat a stale mirror or learning-session record separately from native completion and never infer unfinished learning from a failed mirror operation.

Academic OS already has a loaded state-refresh launchd job with a thirty-minute interval. Its runner holds a private run lock, calls Calendar and Tasks refresh independently with two-minute timeouts, and preserves last-success status through failures. Healthy/repeated unchanged runs are quiet; failures and recoveries notify. Morning curation is a separate existing job. The source also retains a daily Calendar-refresh implementation as a rollback option. No job was started, installed, removed or rescheduled in this diagnosis.

The canonical module/research register is on Mini's configured Drive mount; Studio sees a separate propagated Drive copy. Supported remote refresh succeeded before Studio's bytes caught up, and later hashes matched. A successful remote mirror write is not immediate Studio convergence. Existing register locking protects cooperating file publication, not a complete per-Task provider transaction across clients. The current operation path has same-ID readback after mutation but lacks the proposed fresh provider preflight and serialized cloud-plan gateway. Its scheduled Tasks reader omits assigned Tasks, and its merge interprets missing previously pushed rows as cancellation; completeness must therefore be explicit before that interpretation.

The [shared alignment objective](../academic-os-alignment.md) records the owner boundary: Emmy/cloud plans and validates policy; local execution applies an exact plan or returns conflicts; Mini collects and publishes. It evaluates transactional local state, immediate affected-module publication and a proposed shorter polling cadence against the existing machinery. Full policy enforcement, revised scheduling and end-to-end adoption remain pending Academic OS work. Source checkout identity and installed launchd paths were observed; they do not independently prove which commit produced every compiled deployed file.
