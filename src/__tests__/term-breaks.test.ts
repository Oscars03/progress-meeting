import { describe, expect, it } from 'vitest';
import { breakCovering, isBreakWeek, breakForWeek } from '../lib/term-breaks';
import type { TermBreakRecord } from '../lib/db/schema';

describe('term breaks', () => {
  const breaks: TermBreakRecord[] = [
    {
      id: 'b1',
      name: 'Semester 1 Break',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      created_at: '',
      updated_at: '',
      row_version: 1,
      created_by: '',
    },
    {
      id: 'b2',
      name: 'Back to back',
      start_date: '2026-11-01',
      end_date: '2026-11-15',
      created_at: '',
      updated_at: '',
      row_version: 1,
      created_by: '',
    },
  ];

  describe('breakCovering', () => {
    it('returns the break when the date falls within', () => {
      expect(breakCovering(breaks, '2026-10-15')?.id).toBe('b1');
      expect(breakCovering(breaks, '2026-10-01')?.id).toBe('b1'); // Start
      expect(breakCovering(breaks, '2026-10-31')?.id).toBe('b1'); // End
    });

    it('returns null when outside any break', () => {
      expect(breakCovering(breaks, '2026-09-30')).toBeNull();
      expect(breakCovering(breaks, '2026-11-16')).toBeNull();
    });
  });

  describe('breakForWeek and isBreakWeek', () => {
    // 2026-09-28 is a Monday. 
    // Week 2026-W40: Mon 09-28 to Sun 10-04. Straddles the break (starts working).
    it('considers a week that straddles the START of a break as a working week', () => {
      const b = breakForWeek(breaks, '2026-W40');
      expect(b).toBeNull();
      expect(isBreakWeek(breaks, '2026-W40')).toBe(false);
    });

    // Week 2026-W41: Mon 10-05 to Sun 10-11. Entirely inside the break.
    it('considers a week entirely inside a break as a break week', () => {
      const b = breakForWeek(breaks, '2026-W41');
      expect(b?.id).toBe('b1');
      expect(isBreakWeek(breaks, '2026-W41')).toBe(true);
    });

    // Week 2026-W44: Mon 10-26 to Sun 11-01.
    // 10-26 to 10-31 is b1, 11-01 is b2. 
    // Every day falls inside *a* break.
    it('considers a week that falls across back-to-back breaks as a break week', () => {
      const b = breakForWeek(breaks, '2026-W44');
      // Our logic returns the break that covers the Monday, which is b1.
      expect(b?.id).toBe('b1');
      expect(isBreakWeek(breaks, '2026-W44')).toBe(true);
    });

    // Week 2026-W46: Mon 11-09 to Sun 11-15.
    it('considers end boundary week correctly', () => {
      const b = breakForWeek(breaks, '2026-W46');
      expect(b?.id).toBe('b2');
      expect(isBreakWeek(breaks, '2026-W46')).toBe(true);
    });

    // Week 2026-W47: Mon 11-16 to Sun 11-22.
    it('considers after break as working week', () => {
      const b = breakForWeek(breaks, '2026-W47');
      expect(b).toBeNull();
      expect(isBreakWeek(breaks, '2026-W47')).toBe(false);
    });
  });
});
