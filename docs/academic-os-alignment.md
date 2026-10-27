# Shared Task planning and module convergence

Owner objective recorded on 27 October 2026. This is the design handoff for the Academic OS project. Its policy bundle, gateway and revised refresh cadence are proposed work, not installed behavior. The [derived register](calendar-register.md) already collects provider state and checks selected planning invariants; it does not yet enforce every rule below or execute changes.

## Outcome and ownership

Emmy in the cloud owns timetable planning and policy validation. A local execution task implements the exact approved plan, verifies saved changes, and reports live errors; it does not improvise a replacement timetable. Mini may own collection and register synchronization. The boundary is a versioned snapshot → cloud plan → fresh local preflight → exact-ID application → saved readback receipt. Return stale or conflicting plans to Emmy for replanning. Neither a Mini timer nor a local executor replans autonomously.

Emmy and module sessions must operate on the same native Google Task identities. A module-side completion must remain completed when Emmy later rearranges work. A direct Google UI edit must reach the relevant module register automatically through the always-on Mini. Neither access point may corrupt source metadata, recreate dismissed work or substitute ordinary Calendar Events for study Tasks.

Google owns native Task identity, title, scheduled day and status. Native Calendar Task UI owns the timing fields the Tasks API cannot expose. Academic OS owns the shared mutation gateway and provider-to-module publication. Module files own source coverage, dependencies and learning evidence. Emmy owns the planning intent and its evidence. Titles are presentation, never identity keys. Source files and complete source/question groups must remain traceable independently of titles. Task descriptions are absent.

The observed Academic OS checkout has a resident Operations MCP and a loaded 30-minute state-refresh job. Its module/research register store already preserves YAML annotations and provenance, matches rows by provider ID, checks original bytes and uses private recovery locks, verified backups and atomic replacement. Reuse these mechanisms where they satisfy the design. Do not introduce an unrelated timer or duplicate service.

## Versioned policy input

A policy bundle has `schemaVersion`, `policyId`, `revision`, `recordedAt`, `timeZone`, `sources` and `rules`. Each source has an attributable owner reference and observation time. Every rule carries the fields below; a rule without usable scope or source is an unresolved input.

| Field | Meaning |
| --- | --- |
| `id`, `revision` | Stable rule identity and immutable version. |
| `sourceRefs` | Exact owner evidence; private native references stay outside this public repository. |
| `scope` | Account, module/source or campaign, applicable operations, date/window and named timezone. Explicitly distinguish standing instructions from a particular week. |
| `strength` | `hard` constraint, `preference` objective or `estimate` default. |
| `predicate`, `parameters` | A supported typed condition and its values. Unsupported predicates block dependent application. |
| `effectiveFrom`, `effectiveUntil` | Applicability bounds; use an explicit unresolved bound when an owner-relative week is not yet anchored. |
| `supersedes` | Exact earlier rule versions replaced within overlapping scope. Preserve the old evidence. |
| `priority` | Ordering among applicable preferences. It cannot override a hard constraint. |

For example, a synthetic standing rule can use `predicate: "booking-rounded-up"`, `parameters: {"minimumMinutes": 30, "incrementMinutes": 30}`, `strength: "hard"`, and `scope.operations: ["create", "change", "replan"]`. A campaign-specific source estimate must cite the actual source and campaign window rather than silently change that standing rule.

Resolve explicit owner supersession first, then applicable source-specific instructions over general estimates. A newer instruction replaces an older one only within its evidenced scope. A dated instruction to leave a morning empty overrides a campaign's morning-fill objective on that date; preserve owner-moved work and do not move it back. Exact private dates and native identities belong in the private policy instance. Equal-priority conflicting hard constraints require a reported conflict; incomplete scope, deadlines, timing or source coverage require evidence. Do not resolve either by guessing. Persist the resolved rule versions and policy digest with the before-state and plan. Re-evaluate them immediately before and after each mutation; an edited policy invalidates a prepared plan.

## Owner requirements to preserve

Standing planning constraints include rounded-up 30-minute bookings with a 30-minute minimum; coherent whole-source or explicit question groups; concise module plus actual source/range titles; no descriptions; no duplicate Tasks or overlapping native Task intervals; and preservation of completion, dismissals, supersession and explicit exclusions. Examples of title shape are `MH3210 Handout 10`, `MH3220 25/26 Test 2` and `URECA Y2 Q1–Q3 Hecke Worksheet`. Academic years use `25/26`, rather than the longer `AY2025/26` label. Validate and report deviations; a read-only audit does not authorize renaming.

Meals block even when Free. Busy appointments, tests, travel and sleep block. Exercise and shower are intentionally Free, and optional Free classes may overlap. Preserve exact native identities and any explicit protected-ID evidence. A missing API time is unknown rather than an empty interval.

The current campaign seeks real work in 04:30–07:00 and available time before 10:00. Weekdays prioritize lecture catch-up and MH3210 quiz preparation; newer tutorials mainly use weekends, and the CC6 proposal belongs on a weekday. These are scoped campaign objectives, not universal weekly rules. Unfilled capacity must be reported when there is insufficient real work or verified availability; invent no filler or obligation. Source order, prerequisites and verified deadlines guide priority.

General source estimates are lecture study 60–90 minutes and tutorials 90–120 minutes, unless a more specific instruction applies. Current specific estimates include handout plus tutorial revision 60 minutes and Handout 10/11 reading 90 minutes. Actual paper attempt lengths remain source data, distinct from rounded bookings. The latest owner decision for this campaign includes corrections within the rounded attempt blocks and withdraws separate correction sessions. Those dismissed units must remain terminal owner intent, including replacements created during migration; they must not reappear as unfinished work on refresh. This does not prohibit a separately requested correction task in a later scope.

## Academic OS implementation boundary

Evaluate the design-review proposal against the existing code: one Mini coordinator, transactional local state outside Drive, versioned JSON exports and generated module views with separately owned source metadata. SQLite is a proposed way to serialize gateway state and retain receipts; it is not a reason to discard the current ID mapping, recovery store or annotation-preserving publication.

Both Emmy and module mutations should enter one exact-native-ID gateway with fresh provider preflight, per-Task serialization, a narrow changed-field patch and verified saved receipt. Preserve the first uncertain outcome and reconcile the same ID before retry. Publish the affected module immediately after a verified operation; expose a pending mirror publication separately from a failed provider write. Catch direct Google UI changes through Academic OS polling, initially proposed at five minutes with complete full/incremental coverage and explicit token-expiry rebuilds. Change no installed cadence until that implementation and deployment are reviewed. Polling refreshes state; it does not trigger replanning.

Keep explicit deletion, dismissal, cancellation and supersession evidence separate from native completion. A missing row in a filtered or partial response cannot imply any terminal state. Retain the last good generation after invalid YAML or offline Drive, report the affected module stale, and continue other targets. Publish generation, provider acquisition time, module publication time and content hash so Studio can distinguish remote freshness from delayed Drive propagation.

Desired timing and verified native timing are different fields. Public Tasks APIs cannot read or write start/end/duration or provide a documented Task-to-Event mapping. Exact-ID native timing readbacks remain required. Ordinary Events cannot satisfy a requested study Task. Migration observations remain transitional until the authorized writer supplies final same-ID/type readbacks and explicit mappings; the collector never creates, deletes or migrates those items.

## Acceptance

Test policy resolution and validation at create, change, completion and replan boundaries. Cover concurrent completion versus stale rescheduling; duplicate and wrong-ID attempts; partial pagination; new direct-UI Events; rounded durations versus actual attempts; coherent groups and prerequisites; weekday/weekend and morning objectives; naming and absent descriptions; Free meals and optional classes; Busy travel/sleep; owner-dismissed correction units; recurring Tasks; interrupted or mismatched saves; offline Drive; invalid YAML; generation staleness and retained source metadata.

Evidence must separate tested code, installed version/hash, exhausted live provider capture, complete native timing, owner-policy coverage, verified mutation and module/Studio convergence. A read-only capture proves no duration editing or end-to-end alignment. Private capture and diagnostic evidence stay under ignored `.local/` on the user's machines.

A direct cloud-to-Academic-OS MCP/API bridge is future feasibility work. The present Studio registration reaches an existing tailnet service; it does not establish cloud-computer reachability or authority. Evaluate supported authentication, private reachability, scope and receipt transport before a proposal. No bridge installation, new grant, credential copy, endpoint exposure or network/security change is part of this deployment.
