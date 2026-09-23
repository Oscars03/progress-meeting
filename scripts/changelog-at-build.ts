/**
 * Bring the "what's new" list up to date at the start of every Vercel build.
 *
 * The list is read from a committed file, changelog.generated.ts, which was
 * refreshed by hand in a PR of its own -- so every release shipped with a
 * panel that did not mention it until somebody remembered. Merging to master
 * is the deploy, and this runs inside that deploy's build: it finds the
 * `feat:` and `fix:` commits newer than the committed file and adds them, so
 * the release that ships a change is the one that lists it.
 *
 * Where the commits come from, first that answers:
 *
 * 1. GitHub's API, for the commit being deployed (the repo is public, so no
 *    token is needed; GITHUB_TOKEN is used if set). Vercel builds from a
 *    shallow clone, so its own git history stops a few commits back.
 * 2. The build's own `git log`, however far it reaches.
 *
 * It only ever adds to the committed list and never fails the build: with
 * neither source, the panel is what was committed, as it always was. Outside
 * Vercel it does nothing, so a local or CI build leaves the committed file
 * alone.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_CHANGELOG } from '../src/lib/changelog.generated';
import {
  entriesFromApi,
  entriesFromGitLog,
  mergeEntries,
  renderGenerated,
  type ApiCommit,
} from '../src/lib/changelog-source';
import type { ChangeEntry } from '../src/lib/changelog';
import { labDay } from '../src/lib/lab-time';

const OUT = join(process.cwd(), 'src', 'lib', 'changelog.generated.ts');

async function fromGitHub(): Promise<ChangeEntry[]> {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!owner || !slug || !sha) throw new Error('no VERCEL_GIT_* variables');

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'irish-progress-changelog',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${slug}/commits?sha=${encodeURIComponent(sha)}&per_page=100`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return entriesFromApi((await res.json()) as ApiCommit[], (iso) => labDay(new Date(iso)));
}

function fromGit(): ChangeEntry[] {
  const log = execFileSync(
    'git',
    ['log', '--first-parent', 'HEAD', '--date=short', '--pretty=format:%ad%x1f%s%x1f%b%x1e', '-n', '300'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return entriesFromGitLog(log);
}

async function main() {
  if (process.env.VERCEL !== '1') {
    console.log('changelog: not a Vercel build -- using the committed list as it is');
    return;
  }

  const sources: [string, () => Promise<ChangeEntry[]> | ChangeEntry[]][] = [
    ['GitHub', fromGitHub],
    ['git', fromGit],
  ];

  for (const [name, read] of sources) {
    try {
      const found = await read();
      const merged = mergeEntries(found, GENERATED_CHANGELOG);
      const added = merged.length - GENERATED_CHANGELOG.length;
      if (added > 0) writeFileSync(OUT, renderGenerated(merged), 'utf8');
      console.log(`changelog: ${added} new entries from ${name}, ${merged.length} in all`);
      return;
    } catch (error) {
      console.warn(`changelog: ${name} unavailable (${error instanceof Error ? error.message : error})`);
    }
  }
  console.warn('changelog: no source answered -- using the committed list as it is');
}

main().catch((error) => {
  // Never the reason a deploy fails: the committed list is always there.
  console.warn('changelog: skipped --', error instanceof Error ? error.message : error);
});
