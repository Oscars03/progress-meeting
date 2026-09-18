/**
 * Turning a list of sheet row indexes into delete ranges.
 *
 * Its own module so it can be tested without loading a script: a maintenance
 * script runs when imported, and a unit test has no business doing that.
 */

/** Half-open, as the Sheets API wants: `[start, end)`. */
export type RowRange = { start: number; end: number };

/**
 * Consecutive indexes folded into ranges, bottom of the sheet first.
 *
 * The order is the point. Sheets deletes by position, so removing row 5
 * shifts everything after it up by one -- a list of indexes collected before
 * the first delete is only still true if the deletes run upwards from the
 * bottom. Ascending order would quietly take the wrong rows and report
 * success.
 */
export function toDescendingRanges(indexes: number[]): RowRange[] {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const ranges: RowRange[] = [];

  for (const i of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.end === i) last.end = i + 1;
    else ranges.push({ start: i, end: i + 1 });
  }

  return ranges.reverse();
}
