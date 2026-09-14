import { weekStartDate } from './week';
import type { TermBreakRecord } from './db/schema';

/**
 * Returns the break that covers the given date, or null if none.
 * @param isoDate YYYY-MM-DD
 */
export function breakCovering(breaks: TermBreakRecord[], isoDate: string): TermBreakRecord | null {
  for (const b of breaks) {
    if (isoDate >= b.start_date && isoDate <= b.end_date) {
      return b;
    }
  }
  return null;
}

/**
 * Returns true if the week is entirely consumed by breaks.
 */
export function isBreakWeek(breaks: TermBreakRecord[], weekKey: string): boolean {
  return breakForWeek(breaks, weekKey) !== null;
}

/**
 * A week counts as a break week only when every day Monday–Sunday falls inside a break.
 * A week that straddles the start or end of term is still a working week.
 *
 * @returns The break covering the week (specifically, the one covering Monday), or null if the week is a working week.
 */
export function breakForWeek(breaks: TermBreakRecord[], weekKey: string): TermBreakRecord | null {
  const startStr = weekStartDate(weekKey);
  if (!startStr) return null;

  const monday = new Date(startStr);
  let coveringBreak: TermBreakRecord | null = null;

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    const dayStr = d.toISOString().slice(0, 10);
    
    const b = breakCovering(breaks, dayStr);
    if (!b) {
      return null; // At least one day is not a break, so this is a working week
    }
    
    if (i === 0) {
      coveringBreak = b;
    }
  }

  return coveringBreak;
}
