'use client';

import FullCalendar from '@fullcalendar/react';
import { useRouter } from 'next/navigation';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';

type CalendarMeeting = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  meet_link?: string;
};

/**
 * Only http(s) links may be opened. Values come from the sheet, so a
 * `javascript:` URL would otherwise run in the viewer's context.
 */
function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export default function CalendarView({ meetings }: { meetings: CalendarMeeting[] }) {
  const router = useRouter();
  const events = meetings.map(m => ({
    id: m.id,
    title: m.title,
    start: m.start_at,
    end: m.end_at,
    url: safeHttpUrl(m.meet_link)
  }));

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-[700px]">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        events={events}
        height="100%"
        eventClick={(info) => {
          // The meeting page holds the agenda, minutes and action items; the
          // meet link is one field on it rather than the whole destination.
          info.jsEvent?.preventDefault();
          router.push(`/meetings/${info.event.id}`);
        }}
      />
    </div>
  );
}
