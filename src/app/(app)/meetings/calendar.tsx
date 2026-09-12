'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';

export default function CalendarView({ meetings }: { meetings: any[] }) {
  const events = meetings.map(m => ({
    id: m.id,
    title: m.title,
    start: m.start_at,
    end: m.end_at,
    url: m.meet_link
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
          if (info.event.url) {
            info.jsEvent.preventDefault();
            window.open(info.event.url, '_blank');
          }
        }}
      />
    </div>
  );
}
