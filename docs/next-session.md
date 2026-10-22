# Next session: UI/UX skills and setup

To-do list for the next Claude Code session. Tick items off as they are done
and delete the file when it is empty.

Source: ["Must-Have UX/UI Design Skills for Claude Code"](https://uxplanet.org/must-have-ux-ui-design-skills-for-claude-code-364e93e3a614)
(Nick Babich, UX Planet, 2026-03-27; member-only, read through the author's
friend link). It lists six skills, all below. The article installs each with
`npx skills add <repo>@<skill>`; check where that puts the files before relying
on it, since the skill has to end up in this repo's `.claude/skills/`.

## Before installing anything

- [x] Read each skill's `SKILL.md` first. Community skills are instructions
      Claude will follow in this repo; check they do not run scripts or fetch
      things you did not expect.
- [x] Install into the project (`.claude/skills/`) and commit it, not only into
      `~/.claude/skills/`. Cloud sessions start from a fresh clone, so a skill
      that lives only on one computer is missing there.
- [ ] Install one at a time and try it on one page (e.g. `/tasks` on a phone)
      before adding the next. Several style skills at once give conflicting
      advice.

## Skills from the article

| | Skill | Source | Install | Status |
|---|---|---|---|---|
| [x] | **frontend-design** — Anthropic's own UI skill; avoids generic layouts | Anthropic plugin directory (`anthropics/claude-plugins-official`, `plugins/frontend-design`) | `npx skills add frontend-design`, or `/plugin` → search "frontend-design" | **Install this one first.** Triggers on its own for any front-end task |
| [x] | **web-design-guidelines** — 100+ rules from Vercel's Web Interface Guidelines; audits UI code | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (original; other repos are mirrors) | `npx skills add vercel-labs/agent-skills@web-design-guidelines` | Responds to "review my UI", "check accessibility", "review UX". Good fit for the audit below |
| [x] | **ui-ux-pro-max** — UX strategist; v2 generates a whole design system (pattern, palette, fonts, anti-patterns, pre-delivery checklist) | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `npx skills add nextlevelbuilder/ui-ux-pro-max-skill@ui-ux-pro-max` (or `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`) | Its search script needs Python 3. Its sample output lists "dark mode" as an anti-pattern; this app has dark mode on purpose, so do not let it remove it |
| — | **ui-animation** — motion, easing, timing, reduced-motion, CSS transitions | [mblode/agent-skills](https://github.com/mblode/agent-skills) | `npx skills add mblode/agent-skills@ui-animation` | Low priority: the app has little motion. Useful mainly for `prefers-reduced-motion` |
| [ ] | **taste-skill** — a set of skills for "premium" look: animation, spacing, visual polish | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | `npx skills add https://github.com/Leonxlnx/taste-skill` | Community, a whole collection rather than one skill. Read every `SKILL.md` in it first; likely overlaps frontend-design. **Not installed yet**: auto mode refused to vendor it. Reviewed 2026-10-22: it triggers on almost any UI work, deals a random font and palette, has its own dark colours, no Thai/i18n, launches headless Chrome and writes `~/.taste-skill/`. If installed, add `disable-model-invocation: true` to its frontmatter so it only runs when called by name |
| — | **shadcn-ui** — knowledge of the shadcn/ui component library | [giuseppe-trisciuoglio/developer-kit](https://github.com/giuseppe-trisciuoglio/developer-kit) | `npx skills add giuseppe-trisciuoglio/developer-kit@shadcn-ui` | **Probably skip**: this app uses plain Tailwind, not shadcn/ui |

## Also suggested (Anthropic plugin directory)

- [x] **Design** (Anthropic): design critique, accessibility review, UX copy, design system.
      Installed on the local machine (`design:*` skills); not yet in cloud sessions
- [ ] **ux-ui-audit** (community): browser checks for contrast, tap targets and focus rings, plus a
      check that the TH and EN versions of each page match
- [ ] **VectorLab UI/UX Skills** (community): forms, empty states, errors, loaders, spacing

## Setup so Claude can see the UI it changes

- [x] Commit the UI rules where every session sees them — `docs/ui-rules.md`. `.gitignore` drops
      every `*.md` except README, DEPLOY and `docs/`, so a root `CLAUDE.md`
      never reaches a cloud session. Rules to write down: phone first (check at
      390px), every string in TH and EN (`src/lib/ui/messages/`), dark mode only
      covers the classes listed in `src/app/globals.css`.
- [x] Add a SessionStart hook that runs `npm ci` (`.claude/settings.json`, cloud only), so a cloud session can build
      and take screenshots without setting up first.
- [ ] *(Deferred by the owner, 2026-10-22.)* Create a **test** Google Sheet and add its `SPREADSHEET_ID` and
      `SERVICE_ACCOUNT_JSON` as cloud-environment secrets, so pages render with
      data in screenshots. Never the production sheet.
- [ ] *(Deferred by the owner, 2026-10-22.)* Optional: turn on Vercel preview deployments for branches (`vercel.json`
      only deploys `master` now), so every UI PR has a link to try on a phone.
      Point previews at the test sheet. **Ask the owner first**: previews are
      off on purpose (see CLAUDE.md, "Changes land through pull requests") —
      the repo is public and env vars exist for Production only, so a preview
      with the real sheet would put lab data behind a guessable URL.

## First task once the skills are in

- [x] "Audit `/tasks` and `/dashboard` at 390px and desktop, in light and dark,
      TH and EN. Send screenshots and a ranked list of fixes before changing
      anything." Done 2026-10-22. No page scrolls sideways at 390px and dark
      mode maps correctly on both. Ranked findings:

  - [x] 1. `/tasks` on a phone showed only project and assignee; status,
        progress and time left sat off-screen in a 1204px scroller. Now a card
        per piece of work below 640px.
  - [x] 2. English counted subtasks as "projects" ("4 projects", "6 projects"
        beside "3 projects · 3 subtasks"). Now "items", as เรื่อง in Thai.
  - [x] 3. The search box shared a row with the buttons on a phone and read
        "Search pr". Own row on a phone, 320px from `sm` up.
  - [x] 4. The today line struck through "ไม่มีกำหนดส่ง", and the วันนี้ tag
        sat on the month label. Labels now carry their row's background; the
        header has a row for the tag.
  - [x] 5. Timeline on a phone left the chart about 150px. Name column 136px
        there, so about 220px.
  - [x] 6. The legend called the tick "black" (it is white in dark mode) and
        said to scroll right for a Timeline that is now a tab. Each view now
        lists only what it draws.
  - [x] 7. The admin dashboard has three ways to schedule a meeting on one
        screen: the header's "+ นัดหมายประชุม", the "นัดหมายการประชุม" link in
        the next-meeting card and the "นัดหมายเวลาประชุม" button in the weekly
        card. Kept the weekly card's (the grid, the usual way, and the one a
        lead sees); booking outright stays on /meetings.
  - [x] 8. ~~Tap targets under 44px on the dashboard's text links.~~ Not a
        defect: they were measured with a mouse pointer. All seven links and
        buttons on the page match the `pointer: coarse` floor in
        `globals.css`, so they are 44px on a phone.
  - [ ] 9. The tracker's table header (`--trk-band`, saturated indigo) is the
        brightest thing on the page in dark mode. A taste call: **ask the owner**.
