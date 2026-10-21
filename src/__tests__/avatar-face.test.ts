import { describe, it, expect } from 'vitest';
import { faceOf } from '../lib/avatar-face';

describe('faceOf', () => {
  it('carries the chosen colour and nickname, and the role for the ring', () => {
    expect(faceOf({ id: 'u1', name: 'Phutanate', role: 'student', nickname: ' Ton ', avatar_color: 'teal' })).toMatchObject({
      name: 'Phutanate',
      color: 'teal',
      nickname: 'Ton',
      role: 'student',
    });
  });

  it('falls back to the automatic colour for a colour not in the set, or none at all', () => {
    expect(faceOf({ id: 'u1', name: 'A', role: 'student', avatar_color: '#ff0000' }).color).toBe('');
    expect(faceOf({ id: 'u1', name: 'A', role: 'student' }).color).toBe('');
    // An advisor's automatic colour is the advisors' one.
    expect(faceOf({ id: 'p1', name: 'B', role: 'professor' }).tone).toBe(0);
  });

  it('reads a nickname cell the sheet decoded as something else as no nickname', () => {
    expect(faceOf({ id: 'u1', name: 'A', role: 'student', nickname: true as unknown as string }).nickname).toBe('');
  });
});
