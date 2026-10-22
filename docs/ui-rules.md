# UI rules

Rules every change to the interface must keep. They are written here, not only
in the local `CLAUDE.md`, because `CLAUDE.md` is not tracked and a cloud session
starts from a clone without it.

**These rules outrank any design skill.** The skills in `.claude/skills/` give
general advice for any product; this app has a brand, a language and a dark
mode that were decided on purpose. Where a skill suggests a new typeface, a new
palette, removing dark mode, or rewriting copy, keep what is here and say what
the skill suggested instead.

## Who uses it

A weekly-meeting and progress tracker for one university lab: students, a
professor and an admin. Most of them open it on a **phone**, in **Thai**. It is
a working tool, not a marketing site — no hero sections, stock imagery or
decorative motion.

## Phone first

- Check every change at **390px** wide before desktop. No horizontal scroll.
- Tap targets at least 44×44px.

## Two languages

- Every visible string exists in **Thai and English**, in
  `src/lib/ui/messages/<surface>.ts` through `defineMessages`. English is typed
  against the Thai keys, so a string missing from one language fails to compile.
- No hard-coded user-facing text in components.
- Thai runs longer than English in places and wraps differently: check both.

## Type

- The font is **IBM Plex Sans Thai** (`subsets: ["thai", "latin"]`), set up in
  `src/app/layout.tsx`. Do not swap it, and do not give `body` a fallback stack
  without Thai coverage — that once made the whole app render in whatever font
  the OS picked.
- Body `line-height` stays **1.65**; Thai tone marks need it.

## Dark mode

- Dark mode is a **closed list** of remapped utilities in `src/app/globals.css`
  under `[data-theme="dark"]`, not Tailwind's `dark:` variant.
- A neutral shade not in that list (say `bg-gray-700`) will look wrong in dark
  mode and nothing warns you. Grep `globals.css` first, or add the shade there.
- `text-white` and `bg-black` are deliberately not remapped.
- Check every change in light **and** dark.

## Copy

- Empty states must not congratulate. "Nothing matches this view" is not
  "everything is done" — say which one it is.
- Errors say what happened and what to do next.

## Seeing the change

Look at the page in a real browser before calling a UI change done; passing
lint, types, tests and build is not evidence that it looks right.
