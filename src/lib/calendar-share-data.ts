import { SheetRepo } from './db/sheet-repo';
import { busyTimes } from './google/calendar';
import { getConnectedUserIds } from './google/tokens';
import { facesOf } from './avatar-face';
import { logError } from './app-log';
import {
  hashShareToken,
  renderShareSvg,
  segmentsInWeek,
  shareIsLive,
  weekDays,
  type Interval,
} from './calendar-share';
import type { TranslationKey, TranslationVars } from './ui/i18n';
import { planWeekLeads } from './rotation';
import type {
  CalendarShareRecord,
  MeetingRecord,
  PersonalEventRecord,
  TermBreakRecord,
  UserRecord,
  WeekLeadRecord,
} from './db/schema';

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

/** "2–8 พ.ย." in one month, "30 พ.ย. – 6 ธ.ค." across two. */
function compactRange(days: number[], locale: string): string {
  if (days.length < 7) return '';
  const tag = locale === 'th' ? 'th-TH' : 'en-GB';
  const part = (ms: number, opts: Intl.DateTimeFormatOptions) =>
    new Date(ms).toLocaleDateString(tag, { ...opts, timeZone: 'Asia/Bangkok' });
  const [first, last] = [days[0], days[6]];
  const sameMonth = part(first, { month: 'short' }) === part(last, { month: 'short' });
  return sameMonth
    ? `${part(first, { day: 'numeric' })}–${part(last, { day: 'numeric', month: 'short' })}`
    : `${part(first, { day: 'numeric', month: 'short' })} – ${part(last, { day: 'numeric', month: 'short' })}`;
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
  const [users, events, meetings, connected, leads, breaks] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<PersonalEventRecord>('personal_events').catch(() => []),
    SheetRepo.find<MeetingRecord>('meetings'),
    getConnectedUserIds().catch(() => new Set<string>()),
    SheetRepo.find<WeekLeadRecord>('week_leads').catch(() => []),
    SheetRepo.find<TermBreakRecord>('term_breaks').catch(() => []),
  ]);

  const key = share.week_key;
  const days = weekDays(key);
  const from = new Date(days[0] ?? Date.now()).toISOString();
  const to = new Date((days[6] ?? Date.now()) + 24 * 60 * 60 * 1000).toISOString();
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
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
      // Anything at all in the week, at any hour -- not just what is drawn.
      const said = busy.some((b) => Date.parse(b.start) < toMs && Date.parse(b.end || b.start) > fromMs);
      return { id, said, name: face?.name ?? '—', color: face?.color ?? '', busy: segmentsInWeek(busy, key) };
    })
  );

  const lab = segmentsInWeek(
    meetings.filter((m) => m.status !== 'cancelled').map((m) => ({ start: m.start_at, end: m.end_at })),
    key
  );

  // Students shown with no busy time at all in the week, from either source.
  // A connected Google calendar that is empty all week is counted too: during
  // term that is far likelier a calendar nobody keeps than a week with no
  // classes, and either way their "free" is not something to book on unasked.
  // First names only -- the header has one line for this.
  const missing = rows
    .filter((r) => !r.said && users.find((u) => u.id === r.id)?.role === 'student')
    .map((r) => r.name.split(/\s+/)[0]);

  // Whose week it is, as the calendar shows it: confirmed, or where the
  // rotation lands. Nobody in a break.
  const leadName = planWeekLeads(users, leads, breaks, key, 1)[0]?.name ?? null;

  const dayLabels = days.map((midnight) =>
    new Date(midnight).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      timeZone: 'Asia/Bangkok',
    })
  );

  return renderShareSvg({
    rows: rows.map(({ name, color, busy }) => ({ name, color, busy })),
    meetings: lab,
    labels: {
      title: `${compactRange(days, locale)} · ${key}`,
      days: dayLabels,
      meetings: t('share.meetings'),
      free: t('share.free'),
      freeAllDay: t('share.freeAllDay'),
      note: t('share.note'),
      lead: leadName ? t('share.lead', { name: leadName }) : undefined,
      missing: missing.length ? t('share.missing', { names: missing.join(', ') }) : undefined,
    },
  });
}
