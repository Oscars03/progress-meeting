import { describe, expect, it } from 'vitest';
import { toMs } from '@/lib/ui/flip';

describe('toMs', () => {
  it('reads milliseconds and seconds', () => {
    expect(toMs('320ms')).toBe(320);
    expect(toMs(' 0.32s ')).toBeCloseTo(320);
  });

  it('reads the reduced-motion token as zero', () => {
    expect(toMs('0ms')).toBe(0);
  });

  it('treats an unset or unreadable token as no animation', () => {
    expect(toMs('')).toBe(0);
    expect(toMs('slow')).toBe(0);
  });
});
