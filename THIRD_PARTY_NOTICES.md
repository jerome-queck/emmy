# Third-party skill notices

Emmy's root [MIT licence](LICENSE) covers Emmy's own work. Copied upstream files retain their own MIT terms and provenance. They are unmodified readable guidance, not installed plugins.

The generated [inventory](registry/skills.json) selects one immutable directory under `vendor/skills/<snapshot>/`. Each source's `notices` array gives exact retained notice paths within that source. The [reviewed allowlist](registry/skill-sources.json) pins every copied file and notice by SHA-256.

- Pstack 0.9.128 includes three independent principles. Its retained `skills/poteto-mode/references/licenses/LICENSE` credits Lauren Tan and Michael Denyer. The accompanying `NOTICE.md`, `LICENSE-cursor-team-kit` and `LICENSE-thermos` remain together with their original links. The two additional MIT licences credit Cursor. Those notices describe the larger upstream distribution; only the inventory's selected subset is copied here.
- Matt Pocock 1.3.2 includes codebase-design and its two linked references. Its retained root `LICENSE` credits Matt Pocock. Install metadata identifies revision `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`.

The [pstack licence](https://raw.githubusercontent.com/michael-denyer/pstack-claude/main/LICENSE) and [provenance notice](https://raw.githubusercontent.com/michael-denyer/pstack-claude/main/NOTICE.md) corroborate the installed grant and principle scope. Upstream main does not identify the installed revision, which remains unknown. Matt's [pinned licence](https://raw.githubusercontent.com/mattpocock/skills/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/LICENSE) matches the retained MIT grant. MIT allows copying and redistribution subject to retaining its copyright and permission notice. Exact local retained bytes are authoritative for this copy.

OpenAI Documents is excluded because its installed licence prohibits retained copies outside the service and redistribution. All other sources and unselected skills are excluded from this initial allowlist. Tool access, catalog visibility and a matching name supply no redistribution grant.
