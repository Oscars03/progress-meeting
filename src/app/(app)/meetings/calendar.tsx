'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import FullCalendar from '@fullcalendar/react';
import { useRouter } from 'next/navigation';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import thLocale from '@fullcalendar/core/locales/th';
import enGbLocale from '@fullcalendar/core/locales/en-gb';
import { usePrefs } from '@/lib/ui/prefs';
import { createPersonalEventAction, deletePersonalEventAction } from '../settings/schedule-actions';
import type { EventInput, DateSelectArg, EventClickArg } from '@fullcalendar/core';
import type { MappedMeeting, MappedPersonalEvent } from './page';
import type { TermBreakRecord } from '@/lib/db/schema';
import { breakCovering } from '@/lib/term-breaks';



/**
 * Seven day columns do not fit a phone: each is ~35px, which breaks event
 * titles to one character per line. Below this width the calendar opens on a
 * single day instead. Subscribed to with useSyncExternalStore rather than an
 * effect, for the reason given in lib/ui/prefs.tsx.
 */
const PHONE_QUERY = '(max-width: 640px)';

function subscribeToPhone(listener: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function getPhoneSnapshot(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

/** The server has no viewport; the desktop week view is what it renders. */
function getServerPhoneSnapshot(): boolean {
  return false;
}

type GoogleEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  owner_name?: string;
};

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export default function CalendarView({ 
  meetings,
  personalEvents = [],
  googleEvents = [],
  currentUserId = '',
  termBreaks = []
}: { 
  meetings: MappedMeeting[],
  personalEvents?: MappedPersonalEvent[],
  googleEvents?: GoogleEvent[],
  currentUserId?: string,
  termBreaks?: TermBreakRecord[]
}) {
  const router = useRouter();
  const { locale, t } = usePrefs();
  const [showOthers, setShowOthers] = useState(true);
  const isPhone = useSyncExternalStore(subscribeToPhone, getPhoneSnapshot, getServerPhoneSnapshot);

  // Modals state
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  
  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createStartDate, setCreateStartDate] = useState('');
  const [createStartTime, setCreateStartTime] = useState('');
  const [createEndDate, setCreateEndDate] = useState('');
  const [createEndTime, setCreateEndTime] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventTitle, setSelectedEventTitle] = useState('');
  const [selectedEventRowVer, setSelectedEventRowVer] = useState(0);

  // Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEventInfo, setSelectedEventInfo] = useState<{
    id: string;
    title: string;
    start: Date | null;
    end: Date | null;
    type: string;
    isMine?: boolean;
    rowVersion?: number;
  } | null>(null);

  // Generate 30-minute interval time options
  const timeOptions = Array.from({ length: 48 }).map((_, i) => {
    const hours = Math.floor(i / 2).toString().padStart(2, '0');
    const minutes = (i % 2 === 0) ? '00' : '30';
    return `${hours}:${minutes}`;
  });

  // Format events for FullCalendar
  const allEvents: EventInput[] = [];

  // 1. Regular Lab Meetings
  meetings.forEach(m => {
    allEvents.push({
      id: m.id,
      title: m.owner_name ? `[${m.owner_name}] ${m.title}` : m.title,
      start: m.start_at,
      end: m.end_at,
      url: safeHttpUrl(m.meet_link),
      classNames: ['cal-ev', 'cal-ev-meeting'],
      extendedProps: { type: 'meeting' }
    });
  });

  // 2. Personal Events
  personalEvents.forEach(pe => {
    const isMine = pe.user_id === currentUserId;
    if (!isMine && !showOthers) return;
    
    allEvents.push({
      id: pe.id,
      title: pe.user_name ? `[${pe.user_name}] ${pe.title}` : pe.title,
      start: pe.start_at,
      end: pe.end_at,
      // Colour by class, not inline: an inline hex cannot follow the theme, and
      // a wall of saturated red for "somebody is busy" read as a page full of
      // errors rather than a page full of ordinary commitments.
      classNames: ['cal-ev', isMine ? 'cal-ev-mine' : 'cal-ev-theirs'],
      extendedProps: {
        type: 'personal',
        isMine,
        rowVersion: pe.row_version 
      }
    });
  });

  // 3. Google Calendar Events
  googleEvents.forEach((ge) => {
    allEvents.push({
      id: ge.id,
      title: ge.owner_name ? `[${ge.owner_name}] ${ge.title}` : ge.title,
      start: ge.start,
      end: ge.end,
      classNames: ['cal-ev', 'cal-ev-google'],
      extendedProps: { type: 'google' }
    });
  });

  /**
   * Whether the week on screen has anything to put in the all-day strip.
   *
   * FullCalendar sizes that row in JS, so no amount of CSS collapses it -- an
   * empty one costs about 52px on every view. It is worth its space when it
   * holds something and nothing when it does not, so it is only rendered when
   * the *visible* range has an all-day entry. Judging it on the whole dataset
   * instead would keep the strip open all year for one all-day event in March.
   *
   * Meetings and personal events always carry a time, so only Google can send
   * a whole-day entry: its all-day form is a date with no "T".
   */
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const hasAllDayEvents = googleEvents.some((ge) => {
    if (!ge.start || ge.start.includes('T')) return false;
    if (!range) return true;
    const at = Date.parse(ge.start);
    return !Number.isNaN(at) && at >= range.start && at < range.end;
  });

  const handleSelect = (info: DateSelectArg) => {
    setError('');
    setCreateTitle('');
    
    // Format dates to date and time components
    const pad = (n: number) => String(n).padStart(2, '0');
    const toDateStr = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const toTimeStr = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    setCreateStartDate(toDateStr(info.start));
    setCreateStartTime(toTimeStr(info.start));
    
    // Handle all day or invalid end
    if (info.allDay) {
      // info.end for allDay is the next midnight. Subtract 1ms to get the actual selected end day.
      const actualEnd = new Date(info.end.getTime() - 1);
      setCreateEndDate(toDateStr(actualEnd));
      setCreateEndTime('23:30');
    } else if (!info.end) {
      const end = new Date(info.start);
      end.setHours(end.getHours() + 1);
      setCreateEndDate(toDateStr(end));
      setCreateEndTime(toTimeStr(end));
    } else {
      setCreateEndDate(toDateStr(info.end));
      setCreateEndTime(toTimeStr(info.end));
    }

    setCreateModalOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      try {
        const res = await createPersonalEventAction({
          title: createTitle,
          start_at: `${createStartDate}T${createStartTime}`,
          end_at: `${createEndDate}T${createEndTime}`,
        });
        if (!res.ok) {
          setError(t(res.error, res.vars) || res.error);
          return;
        }
        setCreateModalOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create event');
      }
    });
  };

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent?.preventDefault();
    const props = info.event.extendedProps;
    
    setSelectedEventInfo({
      id: info.event.id,
      title: info.event.title,
      start: info.event.start,
      end: info.event.end,
      type: props.type,
      isMine: props.isMine,
      rowVersion: props.rowVersion,
    });
    setDetailModalOpen(true);
  };

  const handleDeleteSubmit = () => {
    setError('');
    startTransition(async () => {
      try {
        const res = await deletePersonalEventAction(selectedEventId, selectedEventRowVer);
        if (!res?.ok && res?.error) {
          setError(t(res.error, res.vars) || res.error);
          return;
        }
        setDeleteModalOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete event');
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* One row, and on a phone one line of plain text rather than a boxed
          notice: the blue panel and the bordered checkbox together took about a
          third of the screen before the calendar started. The instruction also
          said "use your mouse" to people holding a phone, which is why nobody
          discovered that press-and-drag works. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <p className="text-gray-500 flex items-start gap-2 flex-1 min-w-[16rem]">
          <svg
            className="w-4 h-4 shrink-0 mt-0.5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="sm:hidden">แตะค้างแล้วลากบนปฏิทิน เพื่อเพิ่มช่วงเวลาที่คุณไม่ว่าง</span>
          <span className="hidden sm:inline">
            คลิกหรือลากคลุมช่วงเวลาบนปฏิทิน เพื่อเพิ่มช่วงเวลาที่คุณไม่ว่าง
          </span>
        </p>

        <label className="flex items-center gap-2 text-gray-600 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={showOthers}
            onChange={(e) => setShowOthers(e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500"
          />
          <span className="sm:hidden">แสดงของคนอื่น</span>
          <span className="hidden sm:inline">แสดงตารางส่วนตัวของสมาชิกคนอื่นด้วย</span>
        </label>
      </div>

      {/* No fixed height, so the calendar is not a scrolling box inside a
          scrolling page. It used to own its own scrollbar: reaching the
          evening meant finding the inner one and dragging that, while the
          outer one did nothing -- two scrolls competing for the same gesture,
          which on a phone is close to unusable. The grid draws its full
          08:00-22:00 at natural height now and the page scrolls it, so there
          is one scrollbar and it is the one you expect. */}
      <div className="bg-white p-0 sm:p-5 rounded-xl shadow-sm border border-gray-100">
        {/* initialView is read once per mount, so the key remounts the calendar
            when the viewport crosses the phone breakpoint. */}
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locales={[thLocale, enGbLocale]}
          locale={locale === 'th' ? 'th' : 'en-gb'}
          key={isPhone ? 'phone' : 'wide'}
          initialView={isPhone ? 'timeGridDay' : 'timeGridWeek'}
          slotMinTime="08:00:00"
          slotMaxTime="22:00:00"
          /* The all-day strip holds a label, a scroll track and about 90px of
             nothing on every week where Google returned no all-day events --
             which is most of them. Shown only when it has something to show. */
          allDaySlot={hasAllDayEvents}
          /* Fires after the view settles, so this is a callback rather than an
             effect. Guarded on the value: without that, setting state here
             would re-render, fire it again, and spin. */
          datesSet={(arg) => {
            const start = arg.start.getTime();
            const end = arg.end.getTime();
            setRange((prev) =>
              prev && prev.start === start && prev.end === end ? prev : { start, end }
            );
          }}
          views={{
            timeGridWeek: { dayHeaderFormat: { weekday: 'short', day: 'numeric', month: 'short', omitCommas: true } },
            timeGridDay: { dayHeaderFormat: { weekday: 'short', day: 'numeric', month: 'short', omitCommas: true } },
            dayGridMonth: { dayHeaderFormat: { weekday: 'short' } }
          }}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: isPhone ? 'timeGridDay,timeGridWeek,dayGridMonth' : 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          events={allEvents}
          /* auto, not 100%: the grid takes the height its hours need and the
             page scrolls it, instead of becoming its own scroll container. */
          height="auto"
          stickyHeaderDates={true}
          selectable={true}
          selectMirror={true}
          /**
           * On a touch screen a plain drag scrolls the page, so FullCalendar
           * only starts a selection after a long press. The default is a full
           * second, which reads as "dragging does nothing" -- long enough that
           * people give up before it fires. 150ms is still past a tap and
           * feels immediate under a finger.
           */
          longPressDelay={150}
          selectLongPressDelay={150}
          select={handleSelect}
          eventClick={handleEventClick}
          dayCellClassNames={(arg) => {
            const pad = (n: number) => String(n).padStart(2, '0');
            const dateStr = `${arg.date.getFullYear()}-${pad(arg.date.getMonth() + 1)}-${pad(arg.date.getDate())}`;
            if (breakCovering(termBreaks, dateStr)) {
              // No `dark:` here: this project has no dark variant (only
              // `collapsed`), so `dark:bg-gray-800` compiled to nothing at all.
              // `bg-gray-100` is on the remap list in globals.css and is what
              // was actually shading these cells in dark mode all along.
              return ['bg-gray-100', 'opacity-50'];
            }
            return [];
          }}
        />
      </div>

      {/* Create Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-y-auto max-h-[90dvh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">{t('settings.addBusyBlock')}</h3>
              <button 
                onClick={() => setCreateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 text-sm">
              {error && (
                <div className="p-3 text-red-800 bg-red-50 rounded-lg border border-red-200">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-gray-700 font-medium mb-1" htmlFor="pe-title">
                  {t('settings.eventTitle')}
                </label>
                <input
                  id="pe-title"
                  type="text"
                  required
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    {t('meetings.start')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      value={createStartDate}
                      onChange={(e) => setCreateStartDate(e.target.value)}
                      className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                    />
                    <select
                      required
                      value={createStartTime}
                      onChange={(e) => setCreateStartTime(e.target.value)}
                      className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                    >
                      {timeOptions.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    {t('meetings.end')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      value={createEndDate}
                      onChange={(e) => setCreateEndDate(e.target.value)}
                      className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                    />
                    <select
                      required
                      value={createEndTime}
                      onChange={(e) => setCreateEndTime(e.target.value)}
                      className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                    >
                      {timeOptions.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition disabled:opacity-50"
                >
                  {isPending ? t('settings.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-y-auto max-h-[90dvh]">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">ลบเวลาไม่ว่าง</h3>
              <p className="text-sm text-gray-600 mb-6">
                คุณต้องการลบ <strong>{selectedEventTitle}</strong> ใช่หรือไม่?
              </p>
              
              {error && (
                <div className="p-3 mb-4 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200">
                  {error}
                </div>
              )}
              
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleDeleteSubmit}
                  disabled={isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium transition disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? t('settings.deleting') : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedEventInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-y-auto max-h-[90dvh]">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">รายละเอียดกิจกรรม</h3>
              
              <div className="space-y-3 mb-6">
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold">หัวข้อ</div>
                  <div className="text-sm font-medium text-gray-900">{selectedEventInfo.title}</div>
                </div>
                {selectedEventInfo.start && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">เวลาเริ่ม</div>
                    <div className="text-sm text-gray-900">{selectedEventInfo.start.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB')}</div>
                  </div>
                )}
                {selectedEventInfo.end && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">เวลาสิ้นสุด</div>
                    <div className="text-sm text-gray-900">{selectedEventInfo.end.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB')}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold">ประเภท</div>
                  <div className="text-sm text-gray-900">
                    {selectedEventInfo.type === 'meeting' ? 'การประชุม (Lab Meeting)' : 
                     selectedEventInfo.type === 'personal' ? 'เวลาไม่ว่างส่วนตัว' : 'กิจกรรมจาก Google Calendar'}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setDetailModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium transition cursor-pointer"
                >
                  ปิด
                </button>
                
                {selectedEventInfo.type === 'meeting' && (
                  <button
                    onClick={() => {
                      setDetailModalOpen(false);
                      router.push(`/meetings/${selectedEventInfo.id}`);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition cursor-pointer"
                  >
                    ดูรายละเอียด
                  </button>
                )}
                
                {selectedEventInfo.type === 'personal' && selectedEventInfo.isMine && (
                  <button
                    onClick={() => {
                      setDetailModalOpen(false);
                      setSelectedEventId(selectedEventInfo.id);
                      setSelectedEventTitle(selectedEventInfo.title);
                      setSelectedEventRowVer(selectedEventInfo.rowVersion || 0);
                      setDeleteModalOpen(true);
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium transition cursor-pointer"
                  >
                    ลบเวลาไม่ว่าง
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
