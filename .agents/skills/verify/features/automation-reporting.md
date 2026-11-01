# Automation reporting

## Sub-features

Immutable producer records, expected slots, invocation outcomes, evidence coverage, publication and delivery receipts, issues, bounded search, deterministic import and a loopback read-only dashboard.

## How to get to it (user POV)

Use `npm run reporting -- --help` or `agent reporting --file` as documented in [automation reporting](../../../../docs/automation-reporting.md). Existing improvement-report files enter through `import-improvement`; retries never execute the workload.

## Driving it with the CLI

Run `node --test test/automation-reporting.test.mjs test/automation-reporting-cli.test.mjs test/automation-reporting-privacy.test.mjs test/automation-reporting-transport.test.mjs`. Run the full `npm run verify:behavior` for mapped `automation-reporting` retained fresh-process evidence. Its synthetic store and original requests remain under the reported evidence directory. Run `npm run verify:reporting` for bounded model and actual-source mutation controls. For visual QA launch `serve` on an isolated store, open the printed localhost URL, inspect all named cards, refresh, and terminate only that server.

## Gotchas

Completed partial evidence remains completed with separate coverage attention. Missing/invalid/conflicting records never infer success. Claims and referenced receipts remain reported. Expected occurrences are independent of invocations. Private transport, scheduler, fresh-chat/archive and recipient delivery need separate native evidence. The dashboard performs no provider actions.

The export/privacy suite exercises known credential forms, credential-bearing URLs, private path/account exclusion, original timing preservation and safe artifact links. Run events and envelope/report clocks remain distinct; missing heartbeat is null. Lexical refusal is not proof arbitrary prose is secret-free.

Transport tests drive real CLI own-namespace projection into a separate canonical directory, immutable retry, alias refusal, bounded pages, safe selection, exact original clocks, source-digest conflict preservation and corrupt/unsafe prewrite refusal. Actual private Drive identity, both-way byte readbacks and native producer adoption remain separate acceptance.
