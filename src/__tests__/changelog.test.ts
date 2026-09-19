import { describe, it, expect } from 'vitest';
import { APP_VERSION, CHANGELOG, recentChanges } from '../lib/changelog';

/**
 * The list the sidebar shows is generated from the commits, so these are
 * about the shape of the result rather than its contents -- the contents
 * change with every release, and a test that asserted them would fail on the
 * next one for no reason.
 */
describe('changelog', () => {
  it('is generated, dated and in order', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);

    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);

    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['new', 'fix']).toContain(entry.kind);
      expect(entry.th.length).toBeGreaterThan(0);
      expect(entry.en.length).toBeGreaterThan(0);
    }
  });

  // Only what somebody can see. A list padded with docs: and chore: is one
  // nobody opens twice.
  it('carries no commit type prefixes, because only feat and fix are kept', () => {
    for (const entry of CHANGELOG) {
      expect(entry.en).not.toMatch(/^(feat|fix|docs|chore|test|refactor)!?:/);
    }
  });

  it('shows the date of the newest change as the version', () => {
    expect(APP_VERSION).toBe(CHANGELOG[0].date.replace(/-/g, '.'));
    expect(APP_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });

  it('offers a few lines rather than the whole history', () => {
    expect(recentChanges()).toHaveLength(8);
    expect(recentChanges(3)).toHaveLength(3);
    expect(recentChanges(3)[0]).toEqual(CHANGELOG[0]);
  });

  /**
   * A commit subject is written for whoever reads the diff. The entries the
   * lab can actually see should have been given a Thai line -- by a
   * `Changelog-TH:` trailer, or by the table in changelog.ts.
   */
  it('has Thai for everything currently on screen', () => {
    const untranslated = recentChanges().filter((e) => e.th === e.en);
    expect(untranslated.map((e) => e.en)).toEqual([]);
  });
});
