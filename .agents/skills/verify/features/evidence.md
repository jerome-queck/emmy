# Evidence and receipts

## Sub-features

Immutable attributed receipts. Exact task, project, executor, criterion, and current revision comparison. Real local artifact digests. Missing evidence and contradictions. Assurance labels per criterion.

## How to get to it (user POV)

Use `examples/receipt.json` after reading the actual native result. Run `npm run agent -- receipt --task <id> --import <file>`. Run `assess --task <id> --receipt <id> --revision <actual-result-revision> --as-of <UTC>`. Inspect `artifactChecks`, conflicts, missing criteria, and assurance.

## Driving it with the CLI driver

Run `npm run verify:behavior`. Scenarios `local-digest`, `reported-check`, `identity-conflict`, `revision-conflict`, `contradiction`, and `missing-evidence` exercise a complete actual CLI journey. The driver changes artifact bytes after receipt import, tests unreadable paths and missing claims, introduces failed claims and wrong identities, and checks the emitted status and exit 3. It verifies that reported success stays reported.

## Gotchas

Passing a SHA-256 string is not verification. Assessment must read actual bytes. Local bytes prove only that digest criterion. A native task or provider claim remains reported. The current revision is supplied by the caller and must come from a separate native observation. Assessment handles one receipt per run. Retain and inspect all conflicting receipts. The kit never marks a native task complete.
