import type { UserRecord } from './db/schema';
import { toneOf } from './person-tone';

/**
 * How a person is drawn wherever the app shows them: a coloured circle with a
 * letter, ringed in the colour of their role.
 *
 * Each person chooses their own colour and nickname in Settings → My account.
 * The colours are a fixed set rather than any colour at all, so the letter
 * always reads -- each has a light and a dark version in globals.css.
 *
 * A plain module, so the server builds faces and client components draw them
 * from the same list.
 */

export const AVATAR_COLORS = [
  'red',
  'orange',
  'amber',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'pink',
  'slate',
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export function isAvatarColor(value: unknown): value is AvatarColor {
  return (AVATAR_COLORS as readonly unknown[]).includes(value);
}

export const MAX_NICKNAME = 20;

/** Everything Avatar needs to draw somebody. */
export type AvatarFace = {
  name: string;
  /** The automatic colour, used while they have not chosen one. */
  tone: number;
  /** Their chosen colour, or '' for the automatic one. */
  color: string;
  nickname: string;
  role: string;
};

export function faceOf(user: Pick<UserRecord, 'id' | 'name' | 'role' | 'nickname' | 'avatar_color'>): AvatarFace {
  return {
    name: user.name || '—',
    tone: toneOf(user),
    color: isAvatarColor(user.avatar_color) ? user.avatar_color : '',
    nickname: typeof user.nickname === 'string' ? user.nickname.trim() : '',
    role: user.role,
  };
}
