import { LAB_TIME_ZONE } from './lab-time';
import { LOCALES, translate, type Locale } from './ui/i18n';

/**
 * A poll's title, in the language of whoever is reading it.
 *
 * A poll asked from the availability grid is titled "ยืนยันเวลาประชุม <when>",
 * and that title was stored as text in the asker's language -- so a poll
 * opened by somebody reading in English said "Confirm meeting time Fri 6 Nov"
 * to the whole lab, for good. A stored title in that generated shape is now
 * rebuilt from the poll's slot for each reader. A title somebody typed is
 * theirs and is shown as written.
 */
export function displayPollTitle(
  stored: string,
  slots: { start_at: string; end_at: string }[],
  locale: Locale,
): string {
  // Generated polls ask about exactly one slot; anything else was typed.
  if (slots.length !== 1 || !isGeneratedTitle(stored)) return stored;
  const [slot] = slots;
  const when = pollWhenLabel(slot.start_at, slot.end_at, locale);
  return when ? translate(locale, 'avail.pollTitle', { when }) : stored;
}

function isGeneratedTitle(title: string): boolean {
  return LOCALES.some((locale) => {
    const prefix = translate(locale, 'avail.pollTitle', { when: '' });
    return prefix.trim() !== '' && title.startsWith(prefix);
  });
}

/** "ศ. 6 พ.ย. 11:00–13:00", as the grid labels the hours it asks about. */
export function pollWhenLabel(startAt: string, endAt: string, locale: Locale): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';

  const intl = locale === 'th' ? 'th-TH' : 'en-GB';
  const day = start.toLocaleDateString(intl, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: LAB_TIME_ZONE,
  });
  const clock = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: LAB_TIME_ZONE });
  return `${day} ${clock(start)}–${clock(end)}`;
}
