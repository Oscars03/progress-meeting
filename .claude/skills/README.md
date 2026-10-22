# Vendored Claude Code skills

Third-party skills copied into the repo so every session, local or cloud, has
them. They are not code the app runs: Claude reads them as instructions.
`docs/ui-rules.md` outranks all of them.

| Skill | Source | Commit | Licence | Changed here |
|---|---|---|---|---|
| `frontend-design` | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design) | `af59ee3` (2026-10-21) | Apache-2.0 (`LICENSE.txt`) | Nothing |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | `063bee9` (2026-08-28) | None stated | Nothing. It fetches its rules from `vercel-labs/web-interface-guidelines` on every run |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `623a9a9` (2026-10-21) | MIT (`LICENSE`) | Script path `${CLAUDE_PLUGIN_ROOT}` → `$(git rev-parse --show-toplevel)`, since this is a project install, not a plugin. `scripts/tests/` dropped |

`ui-ux-pro-max` needs Python 3 for `scripts/search.py` (no packages). Its
sample design systems call dark mode an anti-pattern; this app keeps it.

To update one, copy the folder again from its source, reapply the change in the
table, and update the commit.
