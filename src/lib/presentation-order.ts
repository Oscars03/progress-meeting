/**
 * The running order for a week's meeting, built from the topics people entered.
 *
 * The suggestion is "whoever brought the most goes first": someone with three
 * things to show needs the most time, and the meeting is least likely to run
 * out of it while they are still waiting. Ties go to whoever wrote theirs down
 * first, so the order is stable and never depends on who happens to load the
 * page.
 *
 * A suggestion is only ever a starting point. Once anyone sets an explicit
 * position the stored order wins outright -- otherwise a person's carefully
 * arranged agenda would silently rearrange itself when someone added a topic.
 */

import type { TopicRecord } from './db/schema';

function position(topic: TopicRecord): number {
  const n = Number(topic.present_order);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function byCreatedAt(a: TopicRecord, b: TopicRecord): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/** Topics for one ISO week, dropped ones excluded. */
export function topicsForWeek(topics: TopicRecord[], weekKey: string): TopicRecord[] {
  return topics.filter((topic) => topic.week_key === weekKey && topic.status !== 'dropped');
}

/**
 * Most topics first, ties to the earliest submission. Within one person their
 * own topics stay in the order they wrote them.
 */
export function suggestTopicOrder(topics: TopicRecord[]): TopicRecord[] {
  const byOwner = new Map<string, TopicRecord[]>();

  for (const topic of [...topics].sort(byCreatedAt)) {
    const mine = byOwner.get(topic.owner_id);
    if (mine) mine.push(topic);
    else byOwner.set(topic.owner_id, [topic]);
  }

  return [...byOwner.values()]
    .sort((a, b) => (b.length !== a.length ? b.length - a.length : byCreatedAt(a[0], b[0])))
    .flat();
}

/**
 * The order to actually show: the stored one when someone has arranged it,
 * otherwise the suggestion. Topics with no stored position follow the ones that
 * have, in suggested order, so a newly added topic joins the end rather than
 * jumping the queue.
 */
export function effectiveTopicOrder(topics: TopicRecord[]): {
  ordered: TopicRecord[];
  custom: boolean;
} {
  const placed = topics.filter((topic) => position(topic) > 0);
  if (placed.length === 0) {
    return { ordered: suggestTopicOrder(topics), custom: false };
  }

  const unplaced = suggestTopicOrder(topics.filter((topic) => position(topic) === 0));
  const sorted = [...placed].sort((a, b) => position(a) - position(b));

  return { ordered: [...sorted, ...unplaced], custom: true };
}

/**
 * One audit row, as much of it as this file needs.
 *
 * Structural rather than the sheet's own record type: what matters is which
 * fields are read, and a test should be able to hand over four of them.
 */
export type TopicAudit = {
  entity: string;
  entity_id: string;
  action: string;
  actor_id: string;
  at: string;
  old?: string;
  new?: string;
};

/** The stored position as the audit row saw it, JSON and all. */
function auditPosition(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as { present_order?: unknown };
    return String(parsed?.present_order ?? '');
  } catch {
    // An unparseable row is not evidence of anything. Better to leave the
    // arrangement unattributed than to name somebody on a guess.
    return '';
  }
}

/**
 * Who arranged this week's order last, by id, or null if nobody did.
 *
 * The positions live in `present_order` on each topic, a column that records
 * no author -- so the name has to come from the write itself. Only rows that
 * actually moved a position count: editing a title touches the same topic and
 * would otherwise claim the arrangement.
 *
 * Ordered on `at`, the instant the write was stamped with, which is written in
 * ISO so string order is time order.
 */
export function lastArrangedBy(entries: TopicAudit[], topics: TopicRecord[]): string | null {
  const ids = new Set(topics.map((topic) => topic.id));

  let latest: TopicAudit | null = null;
  for (const entry of entries) {
    if (entry.entity !== 'topics' || entry.action !== 'UPDATE') continue;
    if (!ids.has(entry.entity_id)) continue;
    if (auditPosition(entry.old) === auditPosition(entry.new)) continue;
    if (!latest || entry.at > latest.at) latest = entry;
  }

  return latest?.actor_id ?? null;
}

/** How many topics each person brought, for showing beside their name. */
export function topicCounts(topics: TopicRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const topic of topics) {
    counts.set(topic.owner_id, (counts.get(topic.owner_id) ?? 0) + 1);
  }
  return counts;
}

/** One presenter and everything they are bringing, in their own order. */
export type PresenterBlock = {
  ownerId: string;
  topics: TopicRecord[];
};

/**
 * The running order as a list of people rather than a list of topics.
 *
 * A meeting runs person by person: somebody stands up, shows the three things
 * they have been working on, and sits down. Arranging loose topics let those
 * three be scattered through the hour, so the same person was called on three
 * times and the order on screen was not the order anybody would actually run.
 *
 * A person's position is where their *first* topic falls, so this reads the
 * stored per-topic positions without needing a column of its own -- and a
 * topic added later joins the end of its author's block instead of the end of
 * the meeting.
 */
export function groupByPresenter(ordered: TopicRecord[]): PresenterBlock[] {
  const blocks: PresenterBlock[] = [];
  const byOwner = new Map<string, PresenterBlock>();

  for (const topic of ordered) {
    const existing = byOwner.get(topic.owner_id);
    if (existing) {
      existing.topics.push(topic);
      continue;
    }
    const block: PresenterBlock = { ownerId: topic.owner_id, topics: [topic] };
    byOwner.set(topic.owner_id, block);
    blocks.push(block);
  }

  return blocks;
}

/**
 * Flatten a presenter order back to the topic order that gets stored.
 *
 * Moving one person has to move everything they brought, which is the whole
 * point: the stored positions stay per topic, so nothing about the sheet
 * changes, but they are only ever written in whole blocks.
 */
export function flattenPresenters(blocks: PresenterBlock[]): TopicRecord[] {
  return blocks.flatMap((block) => block.topics);
}
