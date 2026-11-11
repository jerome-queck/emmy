# Pin approved local guidance

`guidance-pin --file <private-request.json>` selects one exact approved installed release for the existing `briefing` command. It changes local configuration only. It publishes nothing, loads no credentials, edits no bootstrap or canonical cache, and adds no scheduler. The operator must already have authority for the selected release; a stored reference does not authenticate approval.

## Select the source

| Local state | Ordinary `briefing` behavior |
| --- | --- |
| No pin | Use the unchanged canonical public-main acquisition and its existing cache fallback. |
| Valid pin | Verify the selected installed release and return `state: "pinned"`, `source: "approved-local-release"`, its exact revision/digest and local `verifiedAt`. Make no canonical request. |
| Invalid active pin | Return unavailable local guidance. Do not select remote or cached guidance instead. |

Pinned guidance is usable by draft checking and the compact morning presentation. Its provenance remains local. It has no fabricated public-main `sourceCheckedAt`, `commit`, `tree` or `blob`. The same approved bundle parser checks local and remote data. Every pinned invocation rechecks the selected release before using its bytes.

The trusted root is `<private-home>/installed-runners`. A selection names one ordinary immutable directory under that root, never an absolute path, traversal, symbolic link or the `current` alias. Verification checks the exact installation manifest hash, revision, private-home binding, every declared source file and both launchers. It then checks the exact bundle hash and semantic guidance digest. Ordinary-file checks reject symlinks and bounded reads reject oversized input. These sequential checks assume trusted immutable releases; they do not prove an atomic filesystem snapshot against a hostile concurrent writer.

## Activate and inspect

Save a private request with `schemaVersion: 1` and `action: "status"`. The command returns the selected source and the raw configuration's `pinDigest`, or `remote-default` with a null digest when absent.

An activation request contains `schemaVersion: 1`, `action: "activate"` and these exact fields.

| Field | Meaning |
| --- | --- |
| `expectedPinDigest` | The last observed raw configuration digest, or `null` when absent. A mismatch refuses the change. |
| `release` | The immutable installed directory name under the trusted root. |
| `revision` | The exact approved 40-character Git revision named by its manifest. |
| `installationSha256` | SHA-256 of that exact installed `installation.json`. |
| `bundleSha256` | SHA-256 of its exact `docs/briefing-guidance.json` bytes. |
| `guidanceDigest` | The approved bundle's semantic digest. |
| `authorityRef` | The retained explicit owner approval reference. |

Obtain these values from the verified deployment readback. Do not guess them or substitute a newer checkout. Complete candidate verification precedes activation. The command serializes cooperating administrators with an exclusive lock, preserves the old raw configuration in private history, writes a new ordinary file and atomically replaces the active selection. It compares the original state again before publication. Interrupted administration requires inspecting current status and any retained lock before retry; locks are never stolen automatically.

Configuration lives in `<private-home>/guidance-pin.json`. Prior bytes live in `<private-home>/guidance-pins/<raw-digest>.json`. These are installation configuration, separate from canonical briefing caches and the responsibility journal. Preserve them with installation recovery evidence; responsibility backup does not include them.

## Deactivate or roll back

Submit `schemaVersion: 1`, `action: "deactivate"` and the exact observed `expectedPinDigest`. Deactivation preserves the old raw file before removing the selection. It does not need the damaged selected release to validate. The next ordinary invocation resumes canonical acquisition. Do not delete or rewrite caches as a recovery shortcut.

To restore a prior local selection, activate its exact approved release and hashes against the currently observed pin digest. Reverify the target; history is not new authority. Before rolling the executable runner back to a version that lacks pin support, deactivate with the still-capable runner and verify the intended remote default. An older executable cannot enforce the pin it does not understand.

Exit `0` means a valid pin or the remote default. Status of an invalid active pin exits `3`; invalid administration requests exit `2`. A lost activation response requires a fresh status read before any repeat. Installation, effective source readback and later ordinary-turn adoption remain distinct evidence.

## Verify the boundary

Run `node --test test/guidance-pin.test.mjs` and `node scripts/verify-behavior.mjs --focus briefing`. Controls cover exact source selection, pinned draft usability, mismatched hashes, unsafe paths, symbolic links, source/launcher corruption, stale state, rollback, pending files, stale locks, zero canonical requests while pinned, retained canonical cache bytes and restored remote default. The CLI driver retains original requests, outcomes, source fixtures and pin history after teardown. No fixture changes native products or establishes native-note adoption.
