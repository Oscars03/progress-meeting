# Next session: UI/UX skills and setup

To-do list for the next Claude Code session. Tick items off as they are done
and delete the file when it is empty.

Source: ["Must-Have UX/UI Design Skills for Claude Code"](https://uxplanet.org/must-have-ux-ui-design-skills-for-claude-code-364e93e3a614)
(UX Planet, member-only). The article lists six skills; only five names could
be confirmed from outside the paywall. **Open the article and fill in the
sixth before installing.**

## Before installing anything

- [ ] Read each skill's `SKILL.md` first. Community skills are instructions
      Claude will follow in this repo; check they do not run scripts or fetch
      things you did not expect.
- [ ] Install into the project (`.claude/skills/`) and commit it, not only into
      `~/.claude/skills/`. Cloud sessions start from a fresh clone, so a skill
      that lives only on one computer is missing there.
- [ ] Install one at a time and try it on one page (e.g. `/tasks` on a phone)
      before adding the next. Several style skills at once give conflicting
      advice.

## Skills from the article

| | Skill | Source | Install | Status |
|---|---|---|---|---|
| [ ] | **ui-ux-pro-max** — styles, palettes, font pairs, UX rules | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` | Confirmed. Its search script needs Python 3. Check it with `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "test" --domain style` |
| [ ] | **frontend-design** — Anthropic's own UI skill | Anthropic plugin directory (`anthropics/claude-plugins-official`, `plugins/frontend-design`) | Install card in claude.ai, or `/plugin` → search "frontend-design" | Confirmed. **Install this one first.** |
| [ ] | **web-design-guidelines** — audits UI code against Vercel's Web Interface Guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (original; other repos are mirrors) | Copy `skills/web-design-guidelines` from that repo into `.claude/skills/` | Confirmed. Use the vercel-labs original, not a mirror |
| [ ] | **shadcn** | shadcn-ui/ui | — | Name only. This app does **not** use shadcn/ui (plain Tailwind), so probably skip it |
| [ ] | **ui-animation** | — | — | Name only; no source found. Find the repo from the article |
| [ ] | *(sixth skill)* | — | — | Not readable outside the paywall |

## Also suggested (Anthropic plugin directory)

- [ ] **Design** (Anthropic): design critique, accessibility review, UX copy, design system
- [ ] **ux-ui-audit** (community): browser checks for contrast, tap targets and focus rings, plus a
      check that the TH and EN versions of each page match
- [ ] **VectorLab UI/UX Skills** (community): forms, empty states, errors, loaders, spacing

## Setup so Claude can see the UI it changes

- [ ] Commit the UI rules where every session sees them. `.gitignore` drops
      every `*.md` except README, DEPLOY and `docs/`, so a root `CLAUDE.md`
      never reaches a cloud session. Rules to write down: phone first (check at
      390px), every string in TH and EN (`src/lib/ui/messages/`), dark mode only
      covers the classes listed in `src/app/globals.css`.
- [ ] Add a SessionStart hook that runs `npm ci`, so a cloud session can build
      and take screenshots without setting up first.
- [ ] Create a **test** Google Sheet and add its `SPREADSHEET_ID` and
      `SERVICE_ACCOUNT_JSON` as cloud-environment secrets, so pages render with
      data in screenshots. Never the production sheet.
- [ ] Optional: turn on Vercel preview deployments for branches (`vercel.json`
      only deploys `master` now), so every UI PR has a link to try on a phone.
      Point previews at the test sheet.

## First task once the skills are in

- [ ] "Audit `/tasks` and `/dashboard` at 390px and desktop, in light and dark,
      TH and EN. Send screenshots and a ranked list of fixes before changing
      anything."
