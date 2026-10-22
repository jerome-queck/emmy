# Onboard Emmy

Read [the operating brief](operating-brief.md) with Emmy in the actual Dot. Ask it to discover its own tools and sources. The brief is versioned guidance. This checkout cannot install Dot instructions.

Run `npm run agent -- probe --nonce <fresh-value>` to retain a private `packet.md` containing the brief and eight proposed probes. Read the packet before sending each prompt. Supply the actual scratch repository, held-out task, prepared environment, and future absolute time when required.

Start with runtime inspection and read-only chat discovery. Compare the results with a separate native observation. Run the remaining probes in source order using [the Dot verification procedure](dot-verification.md). Preserve a failed observation before retrying.

Copy `examples/bindings.json` to `.local/bindings.json` and replace every example value with native readbacks. Bind each project to its designated host and exact native project identity. Add any other project there. The public catalog is a starting inventory, not an allowed-project list.

Import a normalized snapshot using `npm run agent -- snapshot --import <file>`. `examples/snapshot.json` defines the shape. `examples/native-codex.json` defines the combined native-listing shape. Native results can be direct objects or tool results with JSON text or `structuredContent`. Always supply observation time, scope, observer, availability, pagination coverage, and gaps. A recent-chat listing alone is partial.

Use `npm run agent -- brief --snapshot <id> --as-of <UTC>` to retain that scope in context. Prepare a request using `examples/request.json`, then run `npm run agent -- plan --request <file> --snapshot <id> --as-of <UTC>`. Read the returned `packet.md`. It is a proposal. Dispatch only through the actual native product within the owner's authority.

After execution, read back the native task identity, executor, result revision, and evidence. Prepare `examples/receipt.json` with those values. Import it with `receipt --task <id> --import <file>`. Run `assess --task <id> --receipt <id> --revision <actual-result-revision> --as-of <UTC>`. Local digest criteria read actual artifact bytes. A hand-entered check remains reported.

Every retained proposal, snapshot, receipt, assessment, and probe is immutable and content addressed. Repeat identical inputs to recover the same record. A changed input produces a new record. Preserve conflicting receipts and assess each. There is no central lifecycle database.

For a demonstrated routing failure or missing proof, ask Emmy to start or continue an authorized local Codex task in this project. Supply the failure, current revision, and finish condition. Update behavior, command metadata, feature map, skills, and docs together. Run the project checks and both installed pstack maintenance workflows before relying on the change.
