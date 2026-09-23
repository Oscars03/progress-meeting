import { describe, it, expect } from 'vitest';
import {
  FIELD_SEP,
  RECORD_SEP,
  entriesFromApi,
  entriesFromGitLog,
  entryFrom,
  mergeEntries,
  renderGenerated,
} from '../lib/changelog-source';
import type { ChangeEntry } from '../lib/changelog';

const entry = (date: string, en: string, th = en, kind: ChangeEntry['kind'] = 'fix'): ChangeEntry => ({ date, kind, th, en });

describe('which commits become lines', () => {
  it('keeps feat and fix, with the Thai trailer when there is one', () => {
    expect(entryFrom('2026-09-23', 'feat: tracker', 'Body.\n\nChangelog-TH: หน้างานใหม่\n')).toEqual(
      entry('2026-09-23', 'tracker', 'หน้างานใหม่', 'new')
    );
    expect(entryFrom('2026-09-23', 'fix!: widget', '')).toEqual(entry('2026-09-23', 'widget'));
  });

  it('drops what the lab cannot see', () => {
    for (const subject of ['chore: refresh the changelog', 'docs: note', 'test: more', 'Merge pull request #1']) {
      expect(entryFrom('2026-09-23', subject, '')).toBeNull();
    }
  });
});

describe('reading the two sources', () => {
  it('reads git log records', () => {
    const log = [
      `2026-09-23${FIELD_SEP}fix: b${FIELD_SEP}Changelog-TH: บี${RECORD_SEP}`,
      `\n2026-09-22${FIELD_SEP}chore: x${FIELD_SEP}${RECORD_SEP}`,
      `\n2026-09-22${FIELD_SEP}feat: a${FIELD_SEP}${RECORD_SEP}`,
    ].join('');
    expect(entriesFromGitLog(log)).toEqual([entry('2026-09-23', 'b', 'บี'), entry('2026-09-22', 'a', 'a', 'new')]);
  });

  // GitHub gives an instant; the list wants the lab's day, as git log does.
  it('reads GitHub commits, dated by the day function', () => {
    const commits = [
      { commit: { message: 'fix: late\n\nChangelog-TH: ดึก', author: { date: '2026-09-22T19:05:11Z' } } },
      { commit: { message: 'chore: nothing', author: { date: '2026-09-22T10:00:00Z' } } },
      { commit: { message: 'feat: broken', author: null } },
    ];
    const dayOf = (iso: string) => (iso.startsWith('2026-09-22T19') ? '2026-09-23' : iso.slice(0, 10));
    expect(entriesFromApi(commits, dayOf)).toEqual([entry('2026-09-23', 'late', 'ดึก')]);
  });
});

describe('merging into the committed list', () => {
  const committed = [entry('2026-09-22', 'b'), entry('2026-09-21', 'a')];

  it('adds only what is new, newest first', () => {
    const merged = mergeEntries([entry('2026-09-23', 'c'), entry('2026-09-22', 'b')], committed);
    expect(merged.map((e) => e.en)).toEqual(['c', 'b', 'a']);
  });

  // Every Vercel build sees less history than the committed file.
  it('never drops a committed line it could not see', () => {
    expect(mergeEntries([], committed)).toEqual(committed);
    expect(mergeEntries([entry('2026-09-23', 'c')], committed)).toHaveLength(3);
  });

  it('knows a line by its words, even if a source dates it a day apart', () => {
    expect(mergeEntries([entry('2026-09-23', 'b')], committed)).toEqual(committed);
  });

  it('writes a file whose version is the newest day', () => {
    const source = renderGenerated(mergeEntries([entry('2026-09-23', 'c')], committed));
    expect(source).toContain("export const GENERATED_VERSION = '2026.09.23';");
    expect(source.match(/^ {4}date: /gm)).toHaveLength(3);
  });
});
