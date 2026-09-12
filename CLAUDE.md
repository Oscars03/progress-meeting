@AGENTS.md

# Pitfalls in this repository

Every entry below is a mistake that was actually made here, with what it cost.
They are grouped by the thing that bites, not by when they happened.

## Never export a non-function from a `'use server'` file

This has now been introduced **twice**, in `tasks/actions.ts` and again in
`meetings/polls/actions.ts`.

A file-level `'use server'` turns every export into a server reference. Export a
plain array or object and a client component receives a proxy, not the value:

```
TypeError: TASK_STATUSES.map is not a function
A "use server" file can only export async functions, found object.
```

**`tsc` passes and `next build` passes.** It fails only when the page is
actually opened, so it will not be caught by any check short of loading the
page.

Constants shared between an action and a client component belong in a plain
module: `tasks/statuses.ts`, `lib/poll-tally.ts`. Do not re-export them from the
actions file either — that reintroduces the same defect.

## Schema changes go through the migration, not `db:init`

`db:init` rewrites every header row in place while leaving data rows where they
are. On a sheet that already holds data this shifts every value out from under
its header, so it now refuses to run when any tab has rows.

```bash
npm run db:migrate-schema -- --dry-run   # print the plan
npm run db:migrate-schema                # apply
```

The migration only ever **appends**. Two rules follow:

- Add new columns at the **end** of a table's array in `SCHEMAS`. Inserting one
  in the middle is reported as a conflict and the whole run is refused, which is
  correct — the data underneath does not move with the header.
- Bump `SCHEMA_VERSION` in `lib/db/migrate-schema.ts`. The version lives in the
  `meta` tab.

## Writes need the `row_version` you read

`SheetRepo.update` and `.delete` take the version that came back with the row
and refuse if it changed meanwhile. Do not pass a version you did not read in
the same request.

Editing the spreadsheet directly — by hand or with a script — bypasses this
**and writes no `audit_log` row**. It is the right tool for a one-off repair,
and the wrong one for anything the app can do itself.

## Dark mode is a list of remapped utilities, not a `dark:` variant

`globals.css` remaps the neutral and status utilities the UI uses under
`[data-theme="dark"]`, because adding `dark:` to every one of hundreds of
classes across 11 files invites a permanent stream of misses.

The cost is that the list is closed: a component using a shade that is not in it
— `bg-gray-700`, say — will look wrong in dark mode and nothing will warn you.
Grep `globals.css` before reaching for a new neutral, or add it there.

`text-white` and `bg-black` are deliberately left alone: white text on a
coloured button stays white.

## Client state that lives outside React

Theme and locale sit in `localStorage` and on `<html>`. Read them with
`useSyncExternalStore` (see `lib/ui/prefs.tsx`), not `useEffect` + `setState` —
that renders twice on every load and fails lint with
`react-hooks/set-state-in-effect`.

An inline script in `app/layout.tsx` applies the theme before first paint. It
needs **both** `data-theme="light"` as a default and `suppressHydrationWarning`
on `<html>`, or React reports a hydration mismatch. This is documented in
`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`
— read it before touching that script.

## Fonts

The UI is Thai. A Latin-only font renders none of it, and `body` must not
override the font variable with a fallback stack that has no Thai coverage —
both were true here at once, so the whole app fell through to whatever the OS
picked. Keep `subsets: ["thai", "latin"]` and the `line-height: 1.65` that Thai
tone marks need.

## Verifying work against the sheet

The spreadsheet is live data. When a change needs exercising end to end:

- Create throwaway rows, exercise them, then delete them. Check the tables
  afterwards rather than assuming.
- Make a temporary account with a synthetic password rather than signing in as
  a real user.
- Use the app's own UI where it exists, so `row_version` and `audit_log` behave
  as they would for a person.

## Empty states must not congratulate

A filtered list with nothing in it once read "รายงานครบทุกงานแล้ว" — reporting
success where there was simply nothing to report. Distinguish "nothing matches
this view" from "everything here is done".

## Editing files from the shell

Thai text, JS template literals and mixed quotes do not survive shell heredocs
reliably; `\n` has come back as a real newline and broken a string literal.
Write `.tsx` and `.ts` files with the editing tools, and keep shell scripting to
commands.
