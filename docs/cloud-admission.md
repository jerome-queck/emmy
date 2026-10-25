# Cooperative cloud admission

`cloud --file <private-envelope.json> --home <private-home>` executes bounded, checkpointed standard-library jobs on the invoking executor. It uses the existing responsibility journal. There is one configured queue per private home. No provider-wide enforcement, browser execution, quota discovery or automatic cleanup follows.

## Run the bounded acceptance workload

Use Node 24 or later and a reviewed immutable source snapshot. No dependency installation is needed for the workload. Use the existing primary private home for actual responsibilities. An isolated worktree's default empty home is not the installed register.

```sh
node scripts/cloud-acceptance.mjs --home <private-home> --phase prepare
node scripts/cloud-acceptance.mjs --home <same-private-home> --phase resume
```

Run these as separate processes. Freshness uses observed Linux kernel incarnation evidence; numeric PID inequality is insufficient. The first phase adopts its explicitly bounded acceptance responsibility and configures the single queue. A preexisting different controller refuses. Use a fresh isolated home for fixture rehearsal; actual parent use must select its own intended private home. Optional `--id <responsibility-id>` selects the acceptance responsibility on both invocations.

Each phase prints one JSON summary with `status` and a retained report path. `prepare` returns `prepared`, a persisted checkpoint and the next invocation. `resume` requires a different observed kernel incarnation and the same checkpoint. An equal PID with a different comparable start witness can pass. Missing or ambiguous evidence refuses before any workload call. macOS currently reports this proof unavailable. A successful supported Linux resume returns `passed`, twelve unique terminal effects and their digest. Each invocation writes its envelopes and report into a unique private run directory. Existing checkpoints use exclusive creation and original reports are never overwritten. Each report retains exact envelopes, CLI stdout, stderr, exits and assertions. A failure keeps its report and exits nonzero.

The workload uses twelve logical job IDs, payloads under 64 KiB, four nonterminal slots and at most one logical active job. Heavy submissions can use two slots; morning work can use three and interactive work all four. It demonstrates synthetic pressure deferral, later eligibility, interactive and morning priority before heavy continuation, overflow backpressure, queued/in-flight/finished duplicate coalescing, bounded transient retries, fresh-process checkpoint recovery and quiet pending health escalation. In-flight means a persisted logical workload between cooperative chunk boundaries. It does not mean an OS process is continuously running.

The acceptance script injects pressure and transient failure signals explicitly. It never exhausts live CPU, memory, disk, browser or provider capacity. Its actual work is a pure SHA-256 chain with at most sixteen chunks per job. No network, browser or child-process workload runs. The script starts fresh CLI processes to drive that workload.

Retrieve the reviewed release through GitHub's immutable commit archive, `https://github.com/jerome-queck/emmy/archive/<published-commit>.tar.gz`, and verify the published revision through the parent's supported source route. Substitute the actual full published commit. Downloading guidance cannot install this executable capability. Parent cloud execution, installed bytes, guidance refresh, ordinary-turn adoption and notification delivery require separate receipts.

## Envelope and results

Every envelope has `schemaVersion: 1`, `responsibilityId` and `operation`. Input is one ordinary UTF-8 JSON file, at most 256 KiB. Symlinks, malformed input and unknown envelope fields refuse with exit 2. JSON uses standard last-value duplicate-key semantics.

```json
{"schemaVersion":1,"responsibilityId":"cloud-acceptance","operation":"submit","job":{"id":"example","priority":"heavy","payload":"bounded text","units":2}}
```

Operations are `configure`, `submit`, `tick`, `status`, `suspend`, `resume`, `recover` and `health`. Configuration is fixed by the initial `cloud-request` journal record. Repeating the same configuration coalesces. A different configuration or another controller in the same home refuses.

`submit` accepts `job.id`, `priority`, UTF-8 `payload`, `units` from 1 to 16 and optional `transientFailures` from 0 to 8. The failure injection is synthetic and visible in retained inputs. Priorities are `interactive`, `morning` and `heavy`. Stable keys combine the existing responsibility effect key with the logical job ID. Equal keys and equal job digests coalesce in queued, in-flight, retry, dead and finished states. Different contents for the same key return `identity-conflict`. There is no automatic job-ID recycling.

`tick` runs at most one pure chunk. The highest eligible priority wins at every boundary; FIFO orders equal priorities. A higher-priority arrival can precede continuation of a heavy checkpoint. Future retry eligibility defers that job without sleeping inside the runner. Terminal output and its final checkpoint share one immutable publication. An interrupted uncommitted computation may repeat after verified recovery; a committed logical terminal effect cannot repeat. This does not establish arbitrary external exactly-once execution.

`status` reads state without running work. Results contain `outcome`, queue counts, stable keys, checkpoint state, `pendingEscalations`, `newEscalations` and limits. Exit 3 covers backpressure, identity conflict, deferral, backoff, suspension, uncertainty and retained actionable health issues. A terminal workload may succeed while health escalation is still pending.

## Bounds and capacity

Default configuration is four nonterminal jobs, 64 retained job identities, 65,536 payload bytes per job, 262,144 pending payload bytes, three failed attempts, 100 ms exponential retry backoff capped at 5,000 ms and a 30,000 ms inclusive signal freshness limit. Pending bounds include the logical active job. Completed/dead job identities remain retained for coalescing; `maxJobs` exhaustion returns explicit backpressure.

`configure.config` may tighten or change `maxPending`, `reservedInteractive`, `reservedMorning`, `maxJobs`, `maxPayloadBytes`, `maxPendingBytes`, `maxAttempts`, `backoffMs`, `maxBackoffMs`, `maxSampleAgeMs`, `maxLoadPerCpu`, `minFreeMemoryBytes` and `minFreeDiskBytes` within the parser's documented source bounds. `maxPending` and `maxJobs` are at most 256, payloads at most 65,536 bytes, attempts at most eight and backoff at most 60,000 ms. Reservations must leave a heavy slot. Admission accounts for reservations and pending bytes before accepting new work.

Without an injected sample, `tick` measures current-process-visible OS load per available CPU, free memory and free home-filesystem bytes. The returned sample gives its scope and acquisition time. The default thresholds are load per CPU at most 0.8, free memory at least 64 MiB and free disk at least 16 MiB. Fresh observed pressure defers work. Missing, stale, future or failed monitoring defers work and retains a pending escalation. This telemetry does not establish provider quotas, account limits, native/browser-job inventory, freeze/OOM events or global capacity. Unsupported signals remain unknown. Actual sampling uses a fresh evaluation clock acquired after measurement.

For isolated controls only, `capacity` may contain `synthetic: true`, `state` and `observedAt`. States are `available`, `pressure`, `unknown`, `suspended` and `dead`. Every injected result is labelled synthetic. The input cannot label supplied data observed. Process sleeping is never interpreted as suspension.

## Authority, health and recovery

Every mutation rechecks one current active responsibility definition, exact unexpired cloud authority, explicit cloud executor and rationale. Codex Cloud also requires a prepared environment identity. Submission does not authorize later ticks after authority expires or the definition changes. The current responsibility and restored epoch remain separate from saved admission. Restore requires the existing fresh target/authority/tasks/schedule observations and then explicit controller `resume`.

`suspend` and `resume` require a nonempty reason. A dead job exhausted its retry bound. An unknown turn lacks verified completion or ownership. Suspension is an explicit lifecycle choice. These states are distinct.

`health` accepts a reported `issue` with `code` of `signin-blocked`, `monitor-failed` or `work-failed`, a scope and source reference. Pending escalations retain provenance, stable deduplication IDs and `delivery: "pending"`. Repeated identical scope/code issues emit no new escalation. Monitoring failures and exhausted retries use the same pending channel. A bounded overflow sentinel makes escalation-capacity failure visible. No notifier is installed and no output counts as delivered. The parent owns actual Dot delivery and deduplication using these IDs. Healthy unchanged turns have no new escalation.

Each mutating turn atomically claims its current journal head in ignored `cloud-turns/`. The completed successor becomes the next claim key. Claims are retained as evidence; the runner deletes neither claims nor processes. Concurrent writers cannot claim the same head. Unknown, incomparable, unreadable or live owners fail closed. Explicit recovery requires the exact retained token and comparable observed Linux boot, PID namespace and reader time namespace evidence. The runner reads the target stat through an open descriptor inside verified caller-rooted visible procfs and rechecks its own scope. A missing target or changed start witness proves the old owned incarnation absent under the stated snapshot assumptions. A reused PID never authorizes signalling its current process. Missing legacy identities, inaccessible or changed scope, denied target reads and unsupported platforms remain unknown.

For a stopped writer, inspect `status`, then use `recover` with the returned exact `expectedOwnerToken`. Recovery publishes a deterministic successor while retaining the previous checkpoint and claim. Concurrent recoveries converge on the same content-addressed result. An abandoned initial configuration recovers from its exact retained configuration and definition/effect binding. An incomplete owner marker remains unknown. No permission change, process kill, browser reset or authenticated-session loss occurs.

Backup refuses any unresolved current turn/configuration claim. Recover that same operation first. Completed claims are not needed to restore checkpointed state. Archive restore adds the existing suspension epoch and cannot silently resume executable work. Process restart and these bounded filesystem controls do not prove whole-provider restart or power-loss survival.

## Observe process incarnations

`src/process-incarnation.mjs` supplies the same identity to acceptance checkpoints and turn owners. It reads only bounded fixed Linux proc files, namespace metadata and an explicitly bound owner PID's stat descriptor. The witness contains kernel boot ID, numeric PID, stat field 22 start ticks, followed PID/time namespace device and inode values, mount namespace, proc root identity, proc filesystem type, mount visibility and acquisition scope.

The stat parser starts its fields after the final closing parenthesis of the process name. A verified proc filesystem, matching self symlink/stat PID and a singleton `NSpid` equal to the current PID establish the caller-rooted proc namespace. Linux enumerates `NSpid` from the proc mount's namespace level through the active process namespace level. A readable PID1 namespace corroborates this proof; denial is retained and does not replace the independent proof. A readable contradictory PID1 namespace refuses. Mount options must establish no hidden PIDs before a missing target can imply absence. [Linux proc array code](https://raw.githubusercontent.com/torvalds/linux/master/fs/proc/array.c), [proc namespace and permission code](https://raw.githubusercontent.com/torvalds/linux/master/fs/proc/base.c), and [proc status documentation](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html) describe these boundaries.

Different boot, PID namespace or PID within the same namespace distinguishes acceptance incarnations. A matching PID requires comparable time namespace before start ticks can distinguish them. Equal witnesses mean same or indistinguishable, not proof of a fresh invocation. Owner absence is stricter: different boot or namespaces leave ownership unknown. Process state labels such as sleeping or stopped do not imply suspension or absence. Hostname, process start wall clock, a random token and PID equality/inequality alone prove none of this.

These are bounded nonhostile kernel snapshots. They assume genuine unovermounted proc identity files, honest kernel namespace/inode values and no relevant start-tick collision. They do not establish arbitrary hostile namespace manipulation or provider restart behavior. Target lookup and surrounding captures are sequential, not a universal atomic kernel transaction. Unknown evidence fails closed. macOS has no implemented standard-library equivalent and retains unknown. Ordinary bounded work can still run there; acceptance freshness and abandoned-owner recovery cannot pass.

## Migrate the retained legacy checkpoint

A checkpoint from the PID-only runner lacks the historical kernel witness. Default resume refuses before any work. Preserve the original `checkpoint.json`, successful prepare report and zero-call failed resume report. Obtain their actual bytes on the parent executor. Forwarded prose or reconstructed files do not satisfy this route.

Create an explicit private reviewed attestation with this shape. Replace every placeholder with the original path, computed digest and attributable source reference.

```json
{
  "schemaVersion": 1,
  "kind": "parent-reviewed-legacy-process-attestation",
  "responsibilityId": "cloud-acceptance",
  "checkpoint": {
    "path": "<absolute-original-checkpoint-path>",
    "sha256": "<original-byte-sha256>",
    "headHash": "<exact-current-checkpoint-head>",
    "completedUnits": 1,
    "terminalEffects": 2
  },
  "prepare": {
    "path": "<absolute-original-prepare-report-path>",
    "sha256": "<original-byte-sha256>",
    "toolCallRef": "<attributable-prepare-tool-call>"
  },
  "failedResume": {
    "path": "<absolute-original-failed-resume-report-path>",
    "sha256": "<original-byte-sha256>",
    "toolCallRef": "<different-attributable-resume-tool-call>"
  },
  "parentReview": {
    "reference": "<parent-review-source>",
    "reviewedAt": "<ISO-UTC-review-time>",
    "statement": "<explicit review of these original files and distinct calls>"
  }
}
```

Run migration against the original private home.

```sh
node scripts/cloud-acceptance.mjs --home <same-private-home> --phase migrate-legacy --attestation <private-attestation.json>
```

Migration reads checkpoint/attestation files up to 64 KiB and each original report up to 2 MiB. It verifies exact hashes, responsibility, original guard-trigger PID and host, report chronology, distinct declared tool-call references, checkpoint head/units/terminal count and absence of an unresolved current owner claim. Review and tool-call provenance stay reported and cannot authenticate authority. It captures a new observed Linux incarnation and rechecks the exact journal before and after sidecar publication.

The result is `baseline-established`, never `passed`. It writes only a content-addressed private sidecar under `cloud-acceptance/<id>/legacy-baselines/`; it performs no adoption, configuration, tick, submit or notification. Original checkpoint/report bytes and canonical journal records remain unchanged. Exclusive sidecar writes preserve partial/error evidence. A partial or changed sidecar cannot pass content-address validation; this small sidecar write is outside the canonical journal publication model.

In a later separate invocation, use the returned baseline path.

```sh
node scripts/cloud-acceptance.mjs --home <same-private-home> --phase resume --baseline <returned-sidecar-path>
```

Resume rechecks the original bytes, attestation, exact checkpoint and current available claim before work. It must observe an incarnation different from the new baseline. The same logical jobs and terminal effect identities continue. The receipt labels original prepare freshness `reported-parent-attestation`, the new baseline observed, and resume `observed-different-incarnation`. Migration cannot repair the missing historical prepare witness or prove whole-provider restart survival. Unsupported platforms remain unavailable.
