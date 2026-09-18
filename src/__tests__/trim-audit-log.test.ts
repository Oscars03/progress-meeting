/**
 * Folding row indexes into delete ranges.
 *
 * Tested on its own because it is the part that can quietly destroy the wrong
 * rows. Sheets deletes by position, and removing row 5 shifts everything after
 * it up by one, so a list of indexes collected before the first delete is only
 * still true if the deletes run from the bottom of the sheet upwards. Get the
 * order wrong and the job removes real rows while reporting success.
 */

import { describe, it, expect } from 'vitest';
import { toDescendingRanges } from '../lib/db/row-ranges';

describe('toDescendingRanges', () => {
  it('folds a consecutive run into one range', () => {
    // Rows 1,2,3 -> [1,4) in Sheets' half-open form.
    expect(toDescendingRanges([1, 2, 3])).toEqual([{ start: 1, end: 4 }]);
  });

  it('keeps gaps apart', () => {
    expect(toDescendingRanges([1, 2, 5, 6, 9])).toEqual([
      { start: 9, end: 10 },
      { start: 5, end: 7 },
      { start: 1, end: 3 },
    ]);
  });

  // The property that matters: later rows are deleted first, so no earlier
  // delete can shift an index that has not been used yet.
  it('always returns ranges from the bottom of the sheet upwards', () => {
    const ranges = toDescendingRanges([3, 20, 7, 21, 1, 2]);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].end).toBeLessThanOrEqual(ranges[i - 1].start);
    }
  });

  it('does not care what order it is given', () => {
    expect(toDescendingRanges([6, 1, 5, 2])).toEqual(toDescendingRanges([1, 2, 5, 6]));
  });

  it('collapses a repeated index rather than deleting twice', () => {
    expect(toDescendingRanges([4, 4, 5])).toEqual([{ start: 4, end: 6 }]);
  });

  it('is empty for nothing to delete', () => {
    expect(toDescendingRanges([])).toEqual([]);
  });

  it('covers exactly the rows it was given, and no others', () => {
    const input = [2, 3, 4, 8, 11, 12];
    const covered: number[] = [];
    for (const r of toDescendingRanges(input)) {
      for (let i = r.start; i < r.end; i++) covered.push(i);
    }
    expect(covered.sort((a, b) => a - b)).toEqual(input);
  });
});
