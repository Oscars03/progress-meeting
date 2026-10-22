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
  'fuchsia',
  'brown',
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
  /**
   * The colour they are drawn in: the one they chose, or the one assignColors
   * gave them. '' only from faceOf alone, which cannot see anybody else.
   */
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

type ColorHolder = Pick<UserRecord, 'id' | 'role' | 'avatar_color' | 'created_at'>;

/**
 * Everybody's colour, no two people alike while the palette lasts -- so a
 * colour says who on the calendar and the board without reading a name.
 *
 * A colour somebody chose is theirs, and nobody else may choose it (see
 * updateMyFaceAction). Everybody who has not chosen gets the first colour
 * nobody holds, in the order they joined, lab members before the admin
 * accounts that only run the app: a newcomer takes what is left and moves
 * nobody who was there first. Only with more people than colours does one
 * come round again.
 *
 * Give it the whole users table wherever it is called. Two pages working from
 * different lists would draw the same person in two colours.
 */
export function assignColors(users: readonly ColorHolder[]): Map<string, AvatarColor> {
  const order = [...users].sort(
    (a, b) =>
      Number(a.role === 'admin') - Number(b.role === 'admin') ||
      (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
      a.id.localeCompare(b.id)
  );
  const out = new Map<string, AvatarColor>();
  const held = new Set<AvatarColor>();

  // Chosen colours first. Two who chose the same one before choices were
  // exclusive: the earlier keeps it, the later is coloured like anybody who
  // has not chosen.
  for (const u of order) {
    if (isAvatarColor(u.avatar_color) && !held.has(u.avatar_color)) {
      out.set(u.id, u.avatar_color);
      held.add(u.avatar_color);
    }
  }
  for (const u of order) {
    if (out.has(u.id)) continue;
    if (AVATAR_COLORS.every((c) => held.has(c))) held.clear();
    const free = AVATAR_COLORS.find((c) => !held.has(c)) as AvatarColor;
    held.add(free);
    out.set(u.id, free);
  }
  return out;
}

/** Every user's face, each in their own colour. Keyed by id. */
export function facesOf(
  users: readonly (ColorHolder & Pick<UserRecord, 'name' | 'nickname'>)[]
): Map<string, AvatarFace> {
  const colors = assignColors(users);
  return new Map(users.map((u) => [u.id, { ...faceOf(u), color: colors.get(u.id) ?? '' }]));
}

/**
 * Who chose which colour, other than `me`: the colours `me` may not take.
 * Only chosen ones -- a colour somebody merely fell into is free to claim, and
 * they move to another.
 */
export function takenColors(
  users: readonly Pick<UserRecord, 'id' | 'name' | 'avatar_color'>[],
  me: string
): Partial<Record<AvatarColor, string>> {
  const out: Partial<Record<AvatarColor, string>> = {};
  for (const u of users) {
    if (u.id !== me && isAvatarColor(u.avatar_color) && !out[u.avatar_color]) out[u.avatar_color] = u.name || '—';
  }
  return out;
}
