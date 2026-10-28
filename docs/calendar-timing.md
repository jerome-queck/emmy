# Interface-aware Task timing

Canonical plans and conflict calculations use `Asia/Singapore`. The pure timing boundary derives date/time input for a particular native editor and checks supplied saved readbacks. It performs no provider request, changes no system timezone, and supplies no datetime API or execution permission.

The [handoff](calendar-handoff.md) requires the timing contract for timing operations at planning, preflight and acceptance. Date-only or timezone-only changes also require the complete canonical interval. Event timing routes are unsupported by this Task-editor boundary and return to cloud. A legacy packet with no timing contract cannot authorize a timing edit or receive final acceptance. The general register assessor remains a proposal checker; it does not substitute for editor preflight.

## Supported interfaces

| Interface | Evidenced input zone | Conversion |
| --- | --- | --- |
| Calendar-side Task editor | `Asia/Singapore` | Canonical SGT date and time, unchanged. |
| Standalone Tasks editor on the verified cloud environment | `Asia/Bangkok` | Format each canonical instant in Bangkok. An intended 11:00 SGT becomes 10:00 input. |

The cloud calibration was reported by the coordinating owner thread. Its system clock resolved Bangkok, Calendar used Singapore, and a standalone Tasks input reappeared one hour later in Calendar SGT. Separate Calendar-side Task tests saved and reloaded their intended SGT interval. This evidence does not establish the configuration of every later cloud computer or any user Mac. Native Task IDs were unavailable in those UI tests, so a stable projection identity did not establish the full native-ID mapping.

The boundary uses named-zone conversion rather than an added or subtracted hour. It formats canonical instants into separate editor input, including each endpoint's date. A midnight SGT start can require the previous Bangkok date. Duration remains the elapsed canonical interval. Supported pairs are deliberately limited to the observed Singapore and Bangkok paths. Other zones and ambiguous daylight-saving editor behavior require separate evidence and support.

## Preflight and receipt

The handoff's `timing` object has `schemaVersion: 1`, `targets` and `observations`. Each target entry names `operationDigest` and a closed `target` with the native `identity`, `sourceInterface: "canonical-plan"`, `canonicalTimeZone: "Asia/Singapore"`, `targetInterface`, `inputTimeZone`, and `executionEnvironment: {kind, id, epoch}`. Supported target interfaces are `calendar-task-editor` and `standalone-tasks-editor`. The standalone route requires `kind: "dot-cloud"`. The plan retains selectors, not a renewable observation time.

Each observation entry names `operationDigest`, `zoneObservation` and `readback`. Zone evidence contains `accountId`, the target interface and input zone, the exact execution environment, `systemTimeZone`, `observedAt`, `evidenceRef`, and `roundTripEvidenceRef`. Use `null` for an inapplicable round-trip reference; the standalone route requires its attributable calibration reference. Planning and preflight need zone evidence. Root acceptance needs the independent final readback.

The prepared timing record retains the canonical interval, selector, original zone evidence, separate `editorInput`, original expiry and `preparedDigest`. A local receipt's `timing` contains that digest, actual `submittedInput` and `readback`. A Calendar readback declares `accountId`, `nativeIdentity`, `projectionId`, `mapping`, `targetInterface`, `timeZone`, `executionEnvironment`, `observedAt`, `evidenceRef`, `start`, `end` and `durationMinutes`. Endpoint clocks are `{date: "YYYY-MM-DD", time: "HH:mm"}`. Unavailable native identity or projection mapping is explicitly `null`. A supplied mapping names the exact `nativeIdentity`, `projectionId`, acquisition time and evidence reference. These are reported observations, not permissions or authenticated captures.

Retain the selected interface and exact execution environment with the original plan. The execution environment is separate from the provider identity's environment. Fresh evidence binds the editor, account, environment epoch and input zone. Refresh that evidence after environment changes; reevaluating old evidence cannot extend its expiry. A saved calibration reference alone does not establish a fresh runtime configuration.

Keep the canonical interval immutable. Generate editor input only from that original interval and retain the prepared digest. Prepared input is not another canonical plan. Repeated preparation of the same original inputs must give the same result. The receipt compares the actual submitted editor fields with those prepared fields and independently compares saved Calendar SGT fields with the canonical interval.

Unknown or stale evidence, wrong interface compensation, changed identity or runtime, date/end/duration mismatch, and missing attributable native-ID readback return the operation to Emmy. Preserve the original attempt and uncertainty; do not compensate again or write a replacement. Final root acceptance still requires a fresh whole-window numeric and visual check after local reports. These checks validate reported evidence, not its authenticity or the provider's actual state.

Final timing and projection-mapping readbacks obey the tightest current request, cloud plan and original preparation age limit. Tightening that limit leaves historical receipt verification and the original attempt expiry intact. Supplied contradictory, stale or future mappings remain failures even beside a matching directly observed native ID.

The executable contracts and synthetic examples are in [the timing source](../src/calendar-timing.mjs), [unit tests](../test/calendar-timing.test.mjs), and [Calendar CLI drive](../verification/calendar-register-drive.mjs). Local tests use no live Tasks or Calendar items.
