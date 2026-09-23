/**
 * Write the changelog the sidebar shows, from the commits on master.
 *
 * Keeping the list by hand meant it was accurate on the day somebody
 * remembered and stale after that. The commits already say what shipped, in
 * order, with dates -- this reads them.
 *
 * Two rules make the result worth reading rather than merely automatic:
 *
 * - Only `feat:` and `fix:` appear. A `docs:`, `chore:`, `test:` or `refactor:`
 *   commit changed nothing the lab can see, and a list padded with those is
 *   one nobody opens twice.
 * - The Thai line comes from a `Changelog-TH:` trailer on the commit. English
 *   commit subjects are written for whoever reads the diff; the sidebar is
 *   read by the lab. A commit with no trailer falls back to its subject, so
 *   the entry still appears -- in English, which is the nudge to add one.
 *
 * Every Vercel build now adds the newest commits by itself
 * (scripts/changelog-at-build.ts), so this is the occasional refresh of the
 * committed baseline that step adds to -- see DEPLOY.md. The output is
 * committed because Vercel builds from a shallow clone with little history.
 *
 *   npm run changelog -- --check   # say whether the file is out of date
 *   npm run changelog              # rewrite it
 *
 * `--check` is deliberately not a CI step. CI runs on the merge commit of a
 * pull request, whose first parent is master, so the branch's own commits are
 * not in its history and every new entry would read as drift.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { entriesFromGitLog, renderGenerated } from '../src/lib/changelog-source';

const OUT = join(process.cwd(), 'src', 'lib', 'changelog.generated.ts');

/** How many commits back to look. Far more than the sidebar shows. */
const DEPTH = 300;

function gitLog(): string {
  return execFileSync(
    'git',
    [
      'log',
      // --first-parent so a branch reads as the line of releases it will
      // become once rebased, and HEAD rather than master so a change is in
      // the list on the release that ships it, not the one after.
      '--first-parent',
      'HEAD',
      '--date=short',
      '--pretty=format:%ad%x1f%s%x1f%b%x1e',
      `-n`,
      String(DEPTH),
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
}

/** How many entries the file on disk currently lists. -1 when there is no file. */
function entriesOnDisk(): number {
  try {
    return (readFileSync(OUT, 'utf8').match(/^ {4}date: /gm) ?? []).length;
  } catch {
    return -1;
  }
}

/**
 * Refuse to shrink the list without being told to.
 *
 * `git log` reports what the checkout can see, and a shallow or partial clone
 * sees less. That happened: a run in a cloud sandbox regenerated the file from
 * a truncated history, dropped 33 entries, reported "Wrote 45 entries" with no
 * hint anything was wrong, and `--check` agreed -- it compares against the same
 * truncated history, so it confirms the damage rather than catching it.
 *
 * Entries only disappear when history is missing, because the generator reads
 * `--first-parent` from HEAD and merged commits do not leave it. A drop is
 * therefore a bad checkout until proven otherwise. `--allow-shrink` is the
 * proof, for the rare time a history really was rewritten.
 */
function refuseToShrink(wanted: string): void {
  const before = entriesOnDisk();
  if (before < 0) return;

  const after = (wanted.match(/^ {4}date: /gm) ?? []).length;
  if (after >= before || process.argv.includes('--allow-shrink')) return;

  console.error(
    `Refusing to write: the file lists ${before} entries and this run found only ${after}.\n` +
      'Entries do not vanish on their own -- this checkout is probably missing history.\n' +
      'Check `git log --first-parent HEAD | wc -l` against a full clone.\n' +
      'If the history really was rewritten, re-run with --allow-shrink.'
  );
  process.exit(1);
}

function main() {
  const wanted = renderGenerated(entriesFromGitLog(gitLog()));

  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {
      // Missing counts as out of date.
    }
    if (current !== wanted) {
      console.error(
        'changelog.generated.ts is out of date. Run `npm run changelog` and commit the result.'
      );
      process.exit(1);
    }
    console.log('Changelog is up to date.');
    return;
  }

  refuseToShrink(wanted);

  writeFileSync(OUT, wanted, 'utf8');
  const count = (wanted.match(/date: /g) ?? []).length;
  console.log(`Wrote ${count} entries to src/lib/changelog.generated.ts`);
}

main();
