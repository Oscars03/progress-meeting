/**
 * Colours and kinds for the hours people block out.
 *
 * A plain module so both the calendar (a client component) and the server
 * actions can read it.
 *
 * A block is drawn in its owner's colour (lib/avatar-face.ts), so the calendar
 * says whose it is at a glance, with a strip on its left edge in the colour of
 * its kind -- see `.cal-k-*` in globals.css. A colour per block used to be
 * chosen by hand; EVENT_COLORS survives only so a colour already stored in the
 * sheet still reads as valid, and nothing draws it any more.
 */

export const EVENT_COLORS = [
  'rose',
  'amber',
  'emerald',
  'sky',
  'violet',
  'slate',
] as const;

export type EventColor = (typeof EVENT_COLORS)[number];

export function isEventColor(value: string): value is EventColor {
  return (EVENT_COLORS as readonly string[]).includes(value);
}

/** What the hours are for. Each has a strip colour of its own. */
export const EVENT_CATEGORIES = ['teaching', 'study', 'meeting', 'personal'] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export function isEventCategory(value: string): value is EventCategory {
  return (EVENT_CATEGORIES as readonly string[]).includes(value);
}
