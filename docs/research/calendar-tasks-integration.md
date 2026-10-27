# Existing Calendar and Tasks integration

Evidence reviewed on 27 October 2026. Private host names, addresses, paths, native IDs and raw readbacks stay in ignored `.local/`.

## Observed route

Studio's existing SSH configuration reaches the always-on Mini through an existing IP alias. The named alias failed DNS resolution before remote execution. The configured IP route succeeded without an SSH, security or network change.

Mini already runs Academic OS's resident Operations MCP server over its tailnet interface. Its documented second-machine setup registers the existing Streamable HTTP URL in the client. The server needs no client credential copy. Its tools cover Module and Research-project Tasks. Its source uses separate scheduled-read and interactive-write credentials.

Studio's Codex configuration initially had no Academic OS entry. The initial task tool catalog also had no Academic OS bindings. Codex's supported `mcp add` command registered the existing service. `mcp get` read back an enabled entry. The task catalog later exposed all eight bindings. A newer module thread reported the same four Module bindings. This timing supports session/tool refresh as the exposure difference. It does not establish the exact cache lifecycle of every older thread.

Direct Studio `tasks_read_register` backend use succeeded. Supported pulls for the two requested module/research mirrors returned fresh rows. Separate canonical-store reads produced matching row digests. Pulling uses the provider-read credential and updates canonical mirrors. It does not push a stale local register to Google, overwrite the native schedule or clear notes. A later direct pull observed source changes after an earlier zero-change pull; the private evidence retains both observations.

Separate later SHA-256 readbacks found the requested module/research registers byte-identical on Mini and Studio. A fresh backend response had preceded local propagation. Native Task time and duration still require the independent UI evidence, because the mirror contains day-granularity data only.

The existing `tasks_change` schema has no provenance field. Create accepts provenance, and pull preserves existing provenance in the mirror. This gap cannot be repaired by hand-editing a module register contrary to its router.

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

The new collector is tested with an injected provider and a real CLI using a synthetic GoogleAuth dependency. Installation on Mini, a live full-account snapshot, automatic invocation and ordinary-turn adoption remain unverified. The existing MCP registration and supported canonical pulls are separately observed outcomes. No new credential grant, token copy, scheduler, live Task write or deployment occurred in this work.
