/**
 * What one person may do, when it differs from what their role may do.
 *
 * Roles answer almost every question here and should keep answering them: the
 * lab is three kinds of people, and a rule written per person is a rule
 * nobody can state out loud. This exists for the exceptions -- the student who
 * keeps the board tidy, the advisor who should not be handing out work this
 * term -- which used to mean promoting somebody to a role that granted six
 * other things by accident.
 *
 * An override is stored only for an ability an admin actually changed. Silence
 * means the role decides, so a later change to what `student` means still
 * reaches everybody who was left on the default.
 */

import type { Role } from './auth-guard';

/**
 * Everything that can be granted or taken away one person at a time.
 *
 * Deliberately not the whole list of things the app checks. Running a week,
 * writing its minutes and pushing it to Google belong to whoever holds that
 * week -- a duty, not a rank -- and confirming the lead or managing accounts
 * is admin's alone, because somebody has to be able to undo the rest. Putting
 * those in the table would offer a checkbox that changes nothing.
 */
export const ABILITIES = [
  'addTopic',
  'editAnyTopic',
  'assignWork',
  'editAnyWork',
  'removeAnyWork',
  'arrangeOrder',
] as const;

export type Ability = (typeof ABILITIES)[number];

/**
 * What each role may do before anybody overrides it.
 *
 * This is the same set of rules the guards used to spell out one by one, in
 * one place where an admin can read them off the screen.
 */
const BY_ROLE: Record<Role, Record<Ability, boolean>> = {
  admin: {
    addTopic: true,
    editAnyTopic: true,
    assignWork: true,
    editAnyWork: true,
    removeAnyWork: true,
    arrangeOrder: true,
  },
  professor: {
    // An advisor reads the agenda and the topics on it are other people's
    // work; what they direct is the work itself.
    addTopic: false,
    editAnyTopic: false,
    assignWork: true,
    editAnyWork: true,
    removeAnyWork: true,
    arrangeOrder: false,
  },
  student: {
    addTopic: true,
    editAnyTopic: false,
    assignWork: false,
    // Their own work, which is not this: this is anybody's.
    editAnyWork: false,
    removeAnyWork: false,
    arrangeOrder: false,
  },
};

export function roleDefault(role: Role, ability: Ability): boolean {
  return BY_ROLE[role][ability];
}

export type Overrides = Partial<Record<Ability, boolean>>;

/**
 * Read the stored column.
 *
 * It arrives in two shapes, and both have to work. The repository decodes any
 * cell beginning with `{` as JSON, so a saved override comes back an object
 * -- while a hand-typed cell, or one read before that decoding, is a string.
 * Accepting only the string was a silent no-op: the override was written to
 * the sheet, shown in the table, and never actually granted anything.
 *
 * Anything unreadable is no override at all rather than an error: a row
 * mangled by a hand-edit must not lock somebody out of the app, and the role
 * is always a safe answer.
 */
export function parseOverrides(stored: unknown): Overrides {
  let raw: unknown = stored;

  if (typeof raw === 'string') {
    if (raw.trim() === '') return {};
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: Overrides = {};
  for (const ability of ABILITIES) {
    const value = (raw as Record<string, unknown>)[ability];
    if (typeof value === 'boolean') out[ability] = value;
  }
  return out;
}

/**
 * The column as a plain string, whichever shape it came back in.
 *
 * For handing a row to a client component, and for comparing what is stored
 * against what is about to be written.
 */
export function storedJson(stored: unknown): string {
  const overrides = parseOverrides(stored);
  return Object.keys(overrides).length === 0 ? '' : JSON.stringify(overrides);
}

/** Keep only what differs from the role, so a default is never frozen in. */
export function pruneOverrides(role: Role, wanted: Overrides): Overrides {
  const out: Overrides = {};
  for (const ability of ABILITIES) {
    const value = wanted[ability];
    if (typeof value === 'boolean' && value !== roleDefault(role, ability)) {
      out[ability] = value;
    }
  }
  return out;
}

/** '' when nothing differs, so the common case costs one empty cell. */
export function serializeOverrides(role: Role, wanted: Overrides): string {
  const pruned = pruneOverrides(role, wanted);
  return Object.keys(pruned).length === 0 ? '' : JSON.stringify(pruned);
}

/** What this person may actually do: their override, else their role. */
export function can(
  actor: { role: Role; abilities?: Overrides },
  ability: Ability
): boolean {
  return actor.abilities?.[ability] ?? roleDefault(actor.role, ability);
}

/** Every ability resolved, for drawing the table. */
export function effectiveAbilities(role: Role, stored: unknown): Record<Ability, boolean> {
  const overrides = parseOverrides(stored);
  return Object.fromEntries(
    ABILITIES.map((ability) => [ability, overrides[ability] ?? roleDefault(role, ability)])
  ) as Record<Ability, boolean>;
}
