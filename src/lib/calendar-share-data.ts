import { SheetRepo } from './db/sheet-repo';
import { busyTimes } from './google/calendar';
import { getConnectedUserIds } from './google/tokens';
import { facesOf } from './avatar-face';
import { logError } from './app-log';
import { weekRange } from './meeting-history';
import {
  hashShareToken,
  renderShareSvg,
  segmentsInWeek,
  shareIsLive,
  weekDays,
  type Interval,
} from './calendar-share';
import type { TranslationKey, TranslationVars } from './ui/i18n';
import type { CalendarShareRecord, MeetingRecord, PersonalEventRecord, UserRecord } from './db/schema';

type T = (key: TranslationKey, vars?: TranslationVars) => string;

/**
 * The live share a token opens, or null for a wrong, expired or withdrawn one.
 *
 * Always a fresh read. Withdrawing a link has to stop it at once, and a cached
 * copy of this tab held by another instance -- or by the image route, which
 * kept serving a withdrawn week's picture while the page already refused it
 * -- would keep it working until the cache aged out.
 */
export async function findLiveShare(token: string): Promise<CalendarShareRecord | null> {
  if (!token) return null;
  const hash = hashShareToken(token);
  const shares = await SheetRepo.find<CalendarShareRecord>('calendar_shares', { fresh: true }).catch(() => []);
  const share = shares.find((s) => s.token_hash === hash);
  return share && shareIsLive(share) ? share : null;
}

/**
 * The shared week, drawn.
 *
 * Busy means anything that takes the person's time: what they typed into the
 * app and what their Google calendar says, if they connected it. Both reach
 * the picture as bare intervals -- a personal event's title is dropped here,
 * and Google is asked through freebusy, which never returns one. A calendar
 * that cannot be read leaves that person's Google hours out rather than
 * failing the page.
 */
export async function drawSharedWeek(share: CalendarShareRecord, t: T, locale: string): Promise<string> {
  const [users, events, meetings, connected] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<PersonalEventRecord>('personal_events').catch(() => []),
    SheetRepo.find<MeetingRecord>('meetings'),
    getConnectedUserIds().catch(() => new Set<string>()),
  ]);

  const key = share.week_key;
  const days = weekDays(key);
  const from = new Date(days[0] ?? Date.now()).toISOString();
  const to = new Date((days[6] ?? Date.now()) + 24 * 60 * 60 * 1000).toISOString();
  const faces = facesOf(users);
  const ids = (Array.isArray(share.user_ids) ? share.user_ids : []).filter((id) => users.some((u) => u.id === id));

  const rows = await Promise.all(
    ids.map(async (id) => {
      const busy: Interval[] = events
        .filter((e) => e.user_id === id)
        .map((e) => ({ start: e.start_at, end: e.end_at }));
      if (connected.has(id)) {
        try {
          busy.push(...(await busyTimes(id, from, to)));
        } catch (err) {
          logError('google_calendar', err, { message: 'shared week: freebusy failed', path: '/share', detail: { calendarOf: id } });
        }
      }
      const face = faces.get(id);
      return { name: face?.name ?? '—', color: face?.color ?? '', busy: segmentsInWeek(busy, key) };
    })
  );

  const lab = segmentsInWeek(
    meetings.filter((m) => m.status !== 'cancelled').map((m) => ({ start: m.start_at, end: m.end_at })),
    key
  );

  const dayLabels = days.map((midnight) =>
    new Date(midnight).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      timeZone: 'Asia/Bangkok',
    })
  );

  return renderShareSvg({
    rows,
    meetings: lab,
    labels: {
      title: t('share.pageTitle'),
      range: weekRange(key, locale),
      days: dayLabels,
      lab: t('share.lab'),
      meetings: t('share.meetings'),
      free: t('share.free'),
      note: t('share.note'),
    },
  });
}
