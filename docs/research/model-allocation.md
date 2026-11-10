# Model allocation evidence

Reviewed 29 October 2026. The task defaults in [AGENTS.md](../../AGENTS.md#standing-thread-and-model-policy) combine official use-case guidance with the owner's effort limits. They are operating choices, not a measured ranking of effort settings.

| Family | Official guidance and current model page | Standard API input/output per million tokens |
| --- | --- | --- |
| Sol | Complex coding and professional work. [Sol model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol) | $2 / $10 |
| Terra | Visual reasoning, application screens, and writing. [Terra model page](https://developers.openai.com/api/docs/models/gpt-6.1-terra) | $1 / $5 |
| Luna | Focused, high-volume work. [Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) | $0.10 / $0.50 |

These are API list rates, not ChatGPT subscription usage or a price quote for a native automation. Tool charges, caching, processing tier, and actual token use can change the comparison. Lower token rates do not establish lower cost per successful task. Include planning, duplicated context, failed attempts, review, and verification when comparing a model split.

OpenAI's [model-selection guide](https://developers.openai.com/api/docs/guides/model-selection) assigns Sol to complex work, Terra to visual/UI workflows, and Luna to scoped work and frequent automation. That supports a capable Sol lead, a Terra Computer Use preference, and carefully bounded Luna helpers. It does not establish that Terra Medium beats Sol Medium, or that Luna Max can safely own an ambiguous cross-file repair. No task-matched numerical benchmark or local cost experiment in this audit establishes those claims.

The [subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) supports explicit model and effort selection and says custom agents inherit permissions. The inspected native interfaces accept exact concrete model IDs. Family names in policy require coordinator resolution against the destination catalog. Native scheduling stores a concrete ID; a family name in its prompt does not upgrade the scheduled model automatically.

For the daily review, begin with one Sol Medium coordinator. Use Sol Medium for substantive helpers and Sol High only for heavy reasoning. A mechanical edit may use Luna Max only when the target, inputs, and executable acceptance are already clear. Use Terra High for consequential Computer Use, or Medium for a proven collection routine. Exceptional root-cause or architecture work uses Sol High maximum. Anything above High or another coding model requires exact-task one-time owner permission. The owner permits Luna Max only and otherwise prohibits Sol/Terra Max or Ultra; those limits override broader model support. Standard/non-fast is the default for coding sessions, coordinators and helpers. Fast or Ultrafast requires explicit owner approval for that exact task, role and tier. An unanswered request is not approval; continue Standard without waiting. Never inherit an accelerated tier from a parent, saved session or broader preference. Model/effort permission does not grant speed permission. Use supported native/config controls only, verify recorded settings separately, and report an unavailable tier control or readback.

Evaluate future changes on representative incidents: assignment identity, stale owner corrections, manual-versus-scheduled recovery, uncertain saves, and narrow code repairs. Compare defect escapes and unauthorized/duplicate actions first, then total tokens, tool cost, retries, and owner intervention. Keep identical evidence and acceptance criteria. Do not use a live destructive task as a benchmark or promote a setting from one lucky result.
