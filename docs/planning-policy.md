# Shared planning policy

The existing native register and Academic OS API adapter both call `assessCalendarPolicy`. Policy schema version two adds the bounded `planning` bundle. `planning-policy.mjs` owns resolution and the first supported predicate, `booking-rounded-up`. Neither caller owns separate rounding arithmetic.

Schema version one remains explicit historical compatibility. Its native rounding remains minimum 30 minutes, multiples of 30, and the ceiling of actual source duration. Its API operation remains undated create, title change or completion. Old packet shapes and digest formulas are unchanged. Version one makes no versioned-rule coverage claim; this slice does not globally disable old clients.

## Bundle and scope

A version-two semantic policy retains the existing `scope`, `assignments`, `occurrences`, `bindings` and `ownerRules`, plus `planning`. The bundle has exactly `schemaVersion:1`, `policyId`, positive integer `revision`, `recordedAt`, named `timeZone`, `sources` and `rules`. Each list contains at most 128 entries. The full synthetic examples are in [fixtures](../verification/planning-policy/fixtures.mjs).

A source has `id`, `ownerRef`, `observedAt` and `evidenceRef`. Its observation cannot postdate bundle recording or evaluation. Sources establish declared attribution, never authenticated owner authority.

A rule has the following fields.

| Field | Meaning |
| --- | --- |
| `id`, `revision` | Exact immutable version within the retained bundle. Duplicate pairs refuse. |
| `sourceRefs` | Nonempty unique IDs of retained attributable sources. |
| `scope` | Exact `environment`, `accountId`, source reference or explicit `*`, and nonempty unique `operations`. |
| `strength` | `hard`, `preference` or `estimate`. |
| `predicate`, `parameters` | Typed rule name and its parameters. |
| `effectiveFrom`, `effectiveUntil` | Inclusive start and exclusive end instants. Explicit `null` means unresolved, not unlimited. |
| `supersedes` | Exact earlier `{id,revision,digest}` entries, where digest hashes the complete original rule. |
| `priority` | Safe integer retained for advisory ordering; it grants no hard-rule override. |

Supported operation labels are `create`, `change`, `complete` and `replan`. Existing native adapters classify mutations as `change` or `complete`; API uses its literal operation name. This adds no new replanning executor. Rule scope uses source `reference`, independently of presentation titles.

A rule is selected only when every known scope dimension matches. Unknown applicable scope or a partial effective-window overlap refuses. A known disjoint account, source, operation or window is outside scope. Booking windows use the proposed interval; undated operations use the evaluation instant. A bundle timezone labels the rule set; effective bounds carry explicit instant offsets and are compared as instants.

Supersession requires the same stable rule ID, lower original revision, exact predecessor digest, strength and predicate family, plus evidenced overlapping account/source/operation/effective scope. The predecessor remains retained. Replacement occurs only where the successor applies; it does not erase the old rule in other source scopes or windows. Forked applicable replacements refuse. No timestamp or revision alone selects a winner.

## Rounded booking and unresolved evidence

`booking-rounded-up` parameters are positive integer `minimumMinutes` and `incrementMinutes`, each at most 1440. The minimum must be a multiple of the increment. Required duration is the larger of the minimum and actual duration rounded upward to that increment. The shared evaluator preserves distinct `scheduled-block-increment` and `source-duration-mismatch` findings. Actual duration stays source data.

Every v2 operation requires a selected supported hard booking rule, even when its application is evidenced as inapplicable. Applicable unsupported predicates, unresolved scope, missing timing and different simultaneous hard parameter definitions refuse. Differing hard definitions conservatively remain a policy conflict even when one particular duration would satisfy both. Preferences and estimates remain retained advisory decisions; neither chooses the hard booking duration.

Native adapters supply actual source duration and proposed booking fields. Native title/completion operations derive nonapplicability evidence from the exact closed changed-field set and retained current capture/history reference. Date-only operations are not a timing exemption.

API intent version two requires semantic policy version two. Its `timing` must declare `kind:"not-applicable"`, exact `operationId`, `occurrenceId`, `environment`, `accountId`, `observedAt` and `evidenceRef`. Reasons are `undated-create`, `title-only` or `completion-only`, matching the literal operation. Evidence must be current under the intent age ceiling. Missing timing or supplied booking numbers cannot establish native timing through this undated API contract. The declaration remains reported owner/caller evidence.

## Retention and compatibility

V2 native prepared operations and API prepared packets retain `planningResolution`, including a computed bundle `policyDigest`, the complete `semanticPolicyDigest`, exact selected rule versions/digests and decisions. This computed digest is separate from the existing opaque external `policyDigest`. The latter and `task-plan/1` wire `policyVersion` retain their original meanings. API provider payload fields are unchanged.

Native handoff preflight and final acceptance compare current selection with original prepared selection. Original attempts keep their original resolution and operation digest. Changed selection or semantic source-policy association blocks dependent application; it cannot rebind an old attempt. API result assessment validates original selection at original preparation time, then checks applicability again at the reported attempt time. Original uncertainty and same-operation reconciliation remain unchanged.

These pure checks cannot durably retain records, authenticate provider truth or stop an external caller from rehashing fabricated packets. They grant no writer, schedule, deployment, gateway serialization or native timing acceptance.

## Verification

Run `node --test test/planning-policy.test.mjs`, `node scripts/verify-behavior.mjs --focus calendar` and `node verification/planning-policy/check.mjs`. The own-area [formal skill](../.agents/skills/planning-policy/SKILL.md) records exact source mapping, bounds, assumptions and source-sync commit. Read every TLC result with `/statechart` by name.

The finite graph calls actual synchronous production evaluators and both adapters. It is not a handwritten substitute policy engine. Real-source mutations must produce intended behavioral counterexamples and replay against the copied code. Existing Calendar properties, historical wire tests, source grouping, prerequisites, protected meals, terminal intent and owner-moved work remain required. Provider/gateway/module convergence, broader preference optimization and installed client adoption remain unfinished.
