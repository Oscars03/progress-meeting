/**
 * Words for what lib/clips.ts works out, shared by the clip pages.
 *
 * A plain module, not the actions file: a file-level 'use server' turns every
 * export into a server reference.
 */

import type { TranslationKey, TranslationVars } from '@/lib/ui/i18n';
import type { ClipRecord, TermBreakRecord, UserRecord, WeekLeadRecord } from '@/lib/db/schema';
import type { ClipMaker, ClipStatus } from '@/lib/clips';
import { clipMaker, makerId, statusOf } from '@/lib/clips';
import { isMember } from '@/lib/members';
import { weekRange } from '@/lib/meeting-history';
import { weekKey } from '@/lib/week';
import type { EventColor } from '@/lib/event-colors';

type T = (key: TranslationKey, vars?: TranslationVars) => string;

export const STATUS_KEY: Record<ClipStatus, TranslationKey> = {
  planned: 'clips.status.planned',
  in_production: 'clips.status.in_production',
  ready: 'clips.status.ready',
  published: 'clips.status.published',
  skipped: 'clips.status.skipped',
};

/** Chip colours: all of them in the dark-mode list in globals.css. */
export const STATUS_STYLE: Record<ClipStatus | 'queued', string> = {
  planned: 'bg-gray-100 text-gray-700',
  in_production: 'bg-blue-50 text-blue-700',
  ready: 'bg-purple-50 text-purple-700',
  published: 'bg-green-50 text-green-700',
  skipped: 'bg-gray-100 text-gray-500',
  queued: 'bg-amber-50 text-amber-800',
};

/** A series' colour as a solid swatch; saturated mid tones read in both themes. */
export const SWATCH: Record<EventColor, string> = {
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-500',
};

/** The chip for an episode: its stage, or "queued" while it has no week. */
export function chipFor(clip: ClipRecord): { label: TranslationKey; style: string } {
  const status = statusOf(clip);
  if (!clip.week_key && status === 'planned') return { label: 'clips.status.queued', style: STATUS_STYLE.queued };
  return { label: STATUS_KEY[status], style: STATUS_STYLE[status] };
}

/** "W47 · 16 พ.ย. – 22 พ.ย." */
export function weekLabel(key: string, locale: string): string {
  return `${key.replace(/^\d{4}-/, '')} · ${weekRange(key, locale)}`;
}

export function nameFrom(users: UserRecord[], t: T) {
  return (id: string) => users.find((u) => u.id === id)?.name ?? t('common.deletedUser');
}

export type MakerText = {
  /** The person, when there is one. */
  name: string | null;
  /** A projected (not yet confirmed) maker. */
  tentative: boolean;
  /** What to show when there is nobody, or a note on where the name came from. */
  note: string;
  /** Something to fix: nobody can be derived, or the person has left. */
  warning: string | null;
};

/** What to say about an episode's maker. */
export function describeMaker(
  maker: ClipMaker,
  users: UserRecord[],
  t: T,
  locale: string
): MakerText {
  const name = nameFrom(users, t);
  switch (maker.kind) {
    case 'pinned': {
      const user = users.find((u) => u.id === maker.userId);
      return {
        name: name(maker.userId),
        tentative: false,
        note: t('clips.maker.pinned'),
        warning: user && isMember(user) ? null : t('clips.maker.pinnedLeft'),
      };
    }
    case 'rotation':
      return {
        name: name(maker.userId),
        tentative: false,
        note: t(maker.afterBreak ? 'clips.maker.fromWeekBeforeBreak' : 'clips.maker.fromWeek', {
          week: weekLabel(maker.hostWeek, locale),
        }),
        warning: null,
      };
    case 'projected':
      return {
        name: name(maker.userId),
        tentative: true,
        note: t('clips.maker.projected', { week: weekLabel(maker.hostWeek, locale) }),
        warning: null,
      };
    case 'none':
      if (maker.reason === 'unscheduled') {
        return { name: null, tentative: false, note: t('clips.maker.unscheduled'), warning: null };
      }
      if (maker.reason === 'breakWeek') {
        return { name: null, tentative: false, note: t('clips.maker.breakWeek'), warning: null };
      }
      return {
        name: null,
        tentative: false,
        note: t('clips.maker.none'),
        warning:
          maker.reason === 'noHost'
            ? t('clips.maker.noHost', { week: weekLabel(maker.hostWeek, locale) })
            : maker.reason === 'hostDeleted'
              ? t('clips.maker.hostDeleted', { week: weekLabel(maker.hostWeek, locale) })
              : t('clips.maker.hostLeft', { name: name(maker.userId), week: weekLabel(maker.hostWeek, locale) }),
      };
  }
}

/** Free weeks as picker options. */
export function weekOptions(keys: string[], locale: string): { key: string; label: string }[] {
  const now = weekKey();
  return keys.map((key) => ({ key, label: weekLabel(key, locale) + (key === now ? ' ★' : '') }));
}

/** The planner and maker of an episode as one short line's worth of names. */
export function peopleOf(
  clip: ClipRecord,
  data: { leads: WeekLeadRecord[]; users: UserRecord[]; breaks: TermBreakRecord[] },
  t: T,
  locale: string
): { planner: string; maker: string; same: boolean; makerText: MakerText; makerUserId: string | null } {
  const name = nameFrom(data.users, t);
  const maker = clipMaker(clip, data.leads, data.users, data.breaks);
  const makerText = describeMaker(maker, data.users, t, locale);
  const makerUserId = makerId(maker);
  return {
    planner: clip.planner_id ? name(clip.planner_id) : '—',
    maker: makerText.name ? `${makerText.name}${makerText.tentative ? '?' : ''}` : '—',
    same: Boolean(clip.planner_id && makerUserId === clip.planner_id),
    makerText,
    makerUserId,
  };
}
