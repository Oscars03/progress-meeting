import Link from 'next/link';
import type { ReactNode } from 'react';
import type { EventColor } from '@/lib/event-colors';
import { SWATCH } from './describe';

/**
 * Small pieces the clip pages share. Server components: no state, and every
 * string arrives already translated.
 */

/** The two pages, Topics and Calendar, as a switch at the top of each. */
export function ModeSwitch({
  active,
  topicsLabel,
  calendarLabel,
}: {
  active: 'topics' | 'calendar';
  topicsLabel: string;
  calendarLabel: string;
}) {
  const item = (on: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-lg ${on ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`;
  return (
    <nav className="inline-flex gap-1 p-1 bg-white rounded-xl border border-gray-200">
      <Link href="/clips" className={item(active === 'topics')} aria-current={active === 'topics' ? 'page' : undefined}>
        {topicsLabel}
      </Link>
      <Link
        href="/clips/calendar"
        className={item(active === 'calendar')}
        aria-current={active === 'calendar' ? 'page' : undefined}
      >
        {calendarLabel}
      </Link>
    </nav>
  );
}

export function Swatch({ color, large = false }: { color: EventColor; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded ${large ? 'h-4 w-4' : 'h-3 w-3'} ${SWATCH[color]}`}
    />
  );
}

export function Chip({ label, style }: { label: string; style: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${style}`}>{label}</span>;
}

/** "ผู้ทำคลิป: ซี" -- the maker with a fixed label, so it reads without colour. */
export function MakerLine({ label, maker }: { label: string; maker: string }) {
  return (
    <span className="block text-sm text-gray-600 break-words">
      {label}: <span className="text-gray-900">{maker}</span>
    </span>
  );
}

/**
 * Controls that are needed now and then, folded away under one line so the
 * page shows its one main action first. A plain <details>: works before the
 * page's script loads, and the browser handles keyboard and screen readers.
 */
export function More({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 sm:px-5 [&::-webkit-details-marker]:hidden">
        {label}
        <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400 motion-safe:transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="space-y-5 border-t border-gray-100 px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}

/** One titled block inside More. */
export function MoreSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      {children}
    </section>
  );
}

/** Shown when the clip tabs have not been created in the sheet yet. */
export function NotReady({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-5 rounded-xl border bg-amber-50 border-amber-200 space-y-1">
      <p className="font-semibold text-amber-900">{title}</p>
      <p className="text-sm text-amber-800">{body}</p>
    </div>
  );
}
