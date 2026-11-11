---
name: automation-lineage
description: Check the bounded generic automation producer's supplied run lineage after changes to producer records, predecessor validation, bindings or its verifier.
---

# Automation producer lineage

Run `node verification/automation-lineage/check.mjs` from the repository root with Node 24+, Java 21 and the existing pinned TLC jar. Read every result with the installed `pstack:statechart` skill. Retain the reported graph, TLC output and copied-source replay. A pin refusal or an unrelated exception is not a counterexample.

The bounded graph calls the actual synchronous producer with synthetic reported inputs. Later calls receive earlier emitted run records. It checks initial bound occurrence and run, ordered revision and digest links, retained occurrence and terminal execution, and refusal of a later attachment to a bound early terminal null report. It separately checks canonical artifact bytes and unverified publication and delivery. A same-terminal non-null report may change metadata. The finite choices and assertions are in the [graph](../../../verification/automation-lineage/graph.mjs); the [coverage record](../../../verification/automation-lineage/coverage.json) records the reviewed source commit and file digests.

The producer cannot discover a wholly omitted chain or authenticate supplied history. No provider identity, scheduler, native effect, actual persistence, asynchronous publication, source authenticity, or delivery is proved. Read adapter status `pending` for a null report is separate from the terminal execution label.

Before updating pins, review covered source and import diffs, model choices and properties. Run all named semantic source mutants, replay each actual broken and restored path, and rerun the baseline. Investigate a current-source failure rather than weakening the oracle. Advance the sync commit only after source review and a successful complete run. Use `pstack:maintain-formal-verification-skill` for subsequent upkeep.
