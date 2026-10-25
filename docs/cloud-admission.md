# Cooperative cloud admission

`cloud --file <private-envelope.json> --home <private-home>` executes bounded, checkpointed standard-library jobs on the invoking executor. It uses the existing responsibility journal. There is one configured queue per private home. No provider-wide enforcement, browser execution, quota discovery or automatic cleanup follows.

## Run the bounded acceptance workload

Use Node 24 or later and a reviewed immutable source snapshot. No dependency installation is needed for the workload. Use the existing primary private home for actual responsibilities. An isolated worktree's default empty home is not the installed register.

```sh
node scripts/cloud-acceptance.mjs --home <private-home> --phase prepare
node scripts/cloud-acceptance.mjs --home <same-private-home> --phase resume
```

Run these as separate processes. The first phase adopts its explicitly bounded acceptance responsibility and configures the single queue. A preexisting different controller refuses. Use a fresh isolated home for fixture rehearsal; actual parent use must select its own intended private home. Optional `--id <responsibility-id>` selects the acceptance responsibility on both invocations.

Each phase prints one JSON summary with `status` and a retained report path. `prepare` returns `prepared`, a persisted checkpoint and the next invocation. `resume` requires a different process identity and the same checkpoint. It returns `passed`, twelve unique terminal effects and their digest. Each report retains exact envelopes, CLI stdout, stderr, exits and assertions. A failure keeps its report and exits nonzero.

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

Each mutating turn atomically claims its current journal head in ignored `cloud-turns/`. The completed successor becomes the next claim key. Claims are retained as evidence; the runner deletes neither claims nor processes. Concurrent writers cannot claim the same head. Unknown, foreign-machine, unreadable or live owners fail closed. PID liveness alone never proves abandonment; explicit recovery requires the exact retained token, the same machine and an ESRCH absence result. PID reuse conservatively prevents recovery.

For a stopped writer, inspect `status`, then use `recover` with the returned exact `expectedOwnerToken`. Recovery publishes a deterministic successor while retaining the previous checkpoint and claim. Concurrent recoveries converge on the same content-addressed result. An abandoned initial configuration recovers from its exact retained configuration and definition/effect binding. An incomplete owner marker remains unknown. No permission change, process kill, browser reset or authenticated-session loss occurs.

Backup refuses any unresolved current turn/configuration claim. Recover that same operation first. Completed claims are not needed to restore checkpointed state. Archive restore adds the existing suspension epoch and cannot silently resume executable work. Process restart and these bounded filesystem controls do not prove whole-provider restart or power-loss survival.
