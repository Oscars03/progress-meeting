/**
 * Colours and kinds for the hours people block out.
 *
 * A plain module so both the calendar (a client component) and the server
 * actions can read it, and so the palette is one list rather than a hex typed
 * into three files.
 *
 * Colours are named, not stored as hex. A stored `#fca5a5` would be a light
 * theme decision frozen into the sheet; a stored `rose` is a choice that each
 * theme can render as it needs -- see globals.css, where every key below has a
 * light pair and a dark one.
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

/**
 * What the hours are for.
 *
 * Each carries a colour, so somebody who does not care about colour still gets
 * a calendar that reads at a glance -- teaching one shade, study another. A
 * colour chosen by hand overrides it.
 */
export const EVENT_CATEGORIES = ['teaching', 'study', 'meeting', 'personal'] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export function isEventCategory(value: string): value is EventCategory {
  return (EVENT_CATEGORIES as readonly string[]).includes(value);
}

const CATEGORY_COLOR: Record<EventCategory, EventColor> = {
  teaching: 'amber',
  study: 'sky',
  meeting: 'violet',
  personal: 'rose',
};

/** The colour to draw an event in: the chosen one, else its kind's, else rose. */
export function colorFor(color: string, category: string): EventColor {
  if (isEventColor(color)) return color;
  if (isEventCategory(category)) return CATEGORY_COLOR[category];
  return 'rose';
}

/**
 * Google's eleven event colours, mapped onto ours.
 *
 * Google sends a `colorId` rather than a colour, and only when the person set
 * one -- most events carry none and take their calendar's default. Mapping to
 * the nearest of ours keeps one palette on screen instead of two: an imported
 * event that stood out in Google still stands out here, without the calendar
 * turning into somebody else's colour scheme.
 */
const GOOGLE_COLOR_ID: Record<string, EventColor> = {
  '1': 'sky', // Lavender
  '2': 'emerald', // Sage
  '3': 'violet', // Grape
  '4': 'rose', // Flamingo
  '5': 'amber', // Banana
  '6': 'amber', // Tangerine
  '7': 'sky', // Peacock
  '8': 'slate', // Graphite
  '9': 'violet', // Blueberry
  '10': 'emerald', // Basil
  '11': 'rose', // Tomato
};

/** The colour for an imported Google event, or null to leave it neutral. */
export function googleColor(colorId: string | null | undefined): EventColor | null {
  if (!colorId) return null;
  return GOOGLE_COLOR_ID[colorId] ?? null;
}
