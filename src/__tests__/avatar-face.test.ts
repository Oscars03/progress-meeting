import { describe, it, expect } from 'vitest';
import { AVATAR_COLORS, assignColors, faceOf, takenColors } from '../lib/avatar-face';

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

describe('assignColors', () => {
  const user = (id: string, created_at: string, avatar_color = '', role = 'student') => ({ id, created_at, avatar_color, role });

  it('keeps every chosen colour and gives everybody else a different free one', () => {
    const users = [
      user('a', '2026-01-01', 'red'),
      user('b', '2026-01-02'),
      user('c', '2026-01-03', 'orange'),
      user('d', '2026-01-04'),
    ];
    const colors = assignColors(users);
    expect(colors.get('a')).toBe('red');
    expect(colors.get('c')).toBe('orange');
    expect(colors.get('b')).toBe('amber');
    expect(colors.get('d')).toBe('lime');
    expect(new Set(colors.values()).size).toBe(4);
  });

  it('does not move anybody when a newcomer joins', () => {
    const before = assignColors([user('a', '2026-01-01'), user('b', '2026-01-02')]);
    const after = assignColors([user('a', '2026-01-01'), user('b', '2026-01-02'), user('c', '2026-01-03')]);
    expect(after.get('a')).toBe(before.get('a'));
    expect(after.get('b')).toBe(before.get('b'));
  });

  it('colours lab members before the admin accounts', () => {
    const colors = assignColors([user('admin', '2025-01-01', '', 'admin'), user('s', '2026-01-01')]);
    expect(colors.get('s')).toBe(AVATAR_COLORS[0]);
    expect(colors.get('admin')).toBe(AVATAR_COLORS[1]);
  });

  it('gives a colour two people chose to the earlier one', () => {
    const colors = assignColors([user('late', '2026-02-01', 'teal'), user('early', '2026-01-01', 'teal')]);
    expect(colors.get('early')).toBe('teal');
    expect(colors.get('late')).not.toBe('teal');
  });

  it('only repeats a colour once there are more people than colours', () => {
    const many = Array.from({ length: AVATAR_COLORS.length + 1 }, (_, i) => user(`u${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`));
    const colors = assignColors(many);
    expect(new Set([...colors.values()].slice(0, AVATAR_COLORS.length)).size).toBe(AVATAR_COLORS.length);
    expect(colors.get(`u${AVATAR_COLORS.length}`)).toBe(AVATAR_COLORS[0]);
  });
});

describe('takenColors', () => {
  it('lists the colours other people chose, with who chose them', () => {
    const users = [
      { id: 'me', name: 'Me', avatar_color: 'red' },
      { id: 'x', name: 'Kandis', avatar_color: 'blue' },
      { id: 'y', name: 'Tud', avatar_color: '' },
    ];
    expect(takenColors(users, 'me')).toEqual({ blue: 'Kandis' });
  });
});
