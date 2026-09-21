import { describe, it, expect } from 'vitest';
import { APP_VERSION, CHANGELOG, changesByDay, recentChanges } from '../lib/changelog';

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
   *
   * This guards the newest eight, which is the first day the panel opens with.
   * The older days it can now unfold are a larger backlog -- see the note on
   * `TH_BY_SUBJECT`.
   */
  it('has Thai for everything currently on screen', () => {
    const untranslated = recentChanges().filter((e) => e.th === e.en);
    expect(untranslated.map((e) => e.en)).toEqual([]);
  });

  describe('changesByDay', () => {
    it('folds the flat list into days without losing or reordering anything', () => {
      const days = changesByDay(999);

      expect(days.flatMap((d) => d.entries)).toEqual(CHANGELOG);

      const dates = days.map((d) => d.date);
      expect(new Set(dates).size).toBe(dates.length);
      expect([...dates].sort().reverse()).toEqual(dates);
    });

    it('gives every entry in a day that day’s date', () => {
      for (const day of changesByDay(999)) {
        expect(day.entries.length).toBeGreaterThan(0);
        for (const entry of day.entries) expect(entry.date).toBe(day.date);
      }
    });

    it('counts days, not entries, so a busy day does not crowd the rest out', () => {
      const [first] = changesByDay(1);
      expect(changesByDay(1)).toHaveLength(1);
      expect(first.date).toBe(CHANGELOG[0].date);

      // A day is never returned half-full: asking for one day gives all of it.
      expect(first.entries).toEqual(CHANGELOG.filter((e) => e.date === first.date));
    });
  });
});
