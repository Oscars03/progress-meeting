/**
 * The kinds of thing somebody might want to say.
 *
 * A plain module, not the actions file: a file-level 'use server' turns every
 * export into a server reference, so an array exported from there reaches a
 * client component as a proxy and `.map` throws. This has caught this project
 * out twice -- see CLAUDE.md.
 *
 * Three, because a longer list makes people stop and choose instead of write.
 */
export const FEEDBACK_CATEGORIES = ['problem', 'idea', 'other'] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

/** Open until somebody has acted on it or decided not to. */
export const FEEDBACK_STATUSES = ['open', 'done'] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

/** The longest a message may be. Long enough to explain, short enough to read. */
export const FEEDBACK_MAX_LENGTH = 2000;
