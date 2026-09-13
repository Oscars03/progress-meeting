'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { addDays, type AvailabilityCell, type CellStatus } from '@/lib/availability-grid';
import { weekAvailabilityAction, type WeekAvailability } from '../../calendar-actions';
import { createPollAction } from './actions';

/**
 * Only utilities globals.css remaps for dark mode, so each state still reads
 * as green, red or neutral on the dark surface.
 */
const TONE: Record<CellStatus, string> = {
  'all-free': 'bg-green-50 text-green-700 border-green-200',
  'some-busy': 'bg-red-50 text-red-700 border-red-200',
  incomplete: 'bg-gray-100 text-gray-500 border-gray-200',
};

const LEGEND: { status: CellStatus; key: 'avail.legendAllFree' | 'avail.legendSomeBusy' | 'avail.legendIncomplete' }[] = [
  { status: 'all-free', key: 'avail.legendAllFree' },
  { status: 'some-busy', key: 'avail.legendSomeBusy' },
  { status: 'incomplete', key: 'avail.legendIncomplete' },
];

const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export default function WeekAvailabilityGrid({
  initial,
  canManage,
}: {
  initial: WeekAvailability;
  canManage: boolean;
}) {
  const { t, locale } = usePrefs();
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<AvailabilityCell | null>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);

  const intl = locale === 'th' ? 'th-TH' : 'en-GB';

  // Dates are plain calendar days; formatting them at UTC noon keeps any zone
  // from shifting the label onto the neighbouring day.
  const dayLabel = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(intl, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  const whenLabel = (cell: AvailabilityCell) =>
    `${dayLabel(cell.start.slice(0, 10))} ${hh(cell.hour)}–${hh(cell.hour + 1)}`;

  const hours = data.days[0]?.cells.map((c) => c.hour) ?? [];
  const total = data.activeCount;
  const firstDay = data.days[0]?.date;
  const lastDay = data.days[data.days.length - 1]?.date;

  const loadWeek = (weekStart?: string) => {
    setError('');
    setSelected(null);
    startTransition(async () => {
      try {
        setData(await weekAvailabilityAction(weekStart));
      } catch {
        setError(t('avail.failed'));
      }
    });
  };

  const ask = (cell: AvailabilityCell) => {
    const when = whenLabel(cell);
    const message =
      cell.status === 'all-free' ? t('avail.askConfirm', { when }) : t('avail.askNotAllFree', { when });
    if (!confirm(message)) return;

    setError('');
    setAsking(true);
    startTransition(async () => {
      try {
        const result = await createPollAction({
          title: t('avail.pollTitle', { when }),
          note: '',
          slots: [{ start: cell.start, end: cell.end }],
        });
        if (!result.ok) throw new Error(t(result.error as Parameters<typeof t>[0]));
        router.push(`/meetings/polls/${result.pollId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('avail.failed'));
        setAsking(false);
      }
    });
  };

  // Whether the selected hour has passed is decided when it is clicked, not on
  // every render: reading the clock during render is impure, and would differ
  // between the server's HTML and the browser's.
  const [selectedIsPast, setSelectedIsPast] = useState(false);

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('avail.title')}</h3>
          <p className="text-sm text-gray-500">{t('avail.subtitle')}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => firstDay && loadWeek(addDays(firstDay, -7))}
            disabled={isPending}
            aria-label={t('avail.prevWeek')}
            title={t('avail.prevWeek')}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => loadWeek()}
            disabled={isPending}
            className="h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {t('avail.thisWeek')}
          </button>
          <button
            type="button"
            onClick={() => firstDay && loadWeek(addDays(firstDay, 7))}
            disabled={isPending}
            aria-label={t('avail.nextWeek')}
            title={t('avail.nextWeek')}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-medium text-gray-900 tabular-nums">
          {firstDay && lastDay ? `${dayLabel(firstDay)} – ${dayLabel(lastDay)}` : ''}
          {isPending && !asking && <span className="ml-2 text-xs text-gray-500">{t('avail.loading')}</span>}
        </p>
        <ul className="flex flex-wrap items-center gap-3 text-xs">
          {LEGEND.map(({ status, key }) => (
            <li key={status} className="flex items-center gap-1.5 text-gray-600">
              <span className={`inline-block h-3 w-3 rounded border ${TONE[status]}`} aria-hidden="true" />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-gray-500">
        {data.readCount === total && total > 0
          ? t('avail.coverageAll', { total })
          : t('avail.coverage', { read: data.readCount, total })}
      </p>

      {error && (
        <div role="status" className="p-2.5 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={`w-full border-separate border-spacing-1 text-xs ${isPending && !asking ? 'opacity-60' : ''}`}>
          <thead>
            <tr>
              <th scope="col" className="w-12 text-left font-normal text-gray-500">
                {t('avail.time')}
              </th>
              {data.days.map((day) => (
                <th key={day.date} scope="col" className="px-1 py-1 font-medium text-gray-600 whitespace-nowrap">
                  {dayLabel(day.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour, row) => (
              <tr key={hour}>
                <th scope="row" className="pr-1 text-left font-normal text-gray-500 tabular-nums whitespace-nowrap">
                  {hh(hour)}
                </th>
                {data.days.map((day) => {
                  const cell = day.cells[row];
                  const isSelected = selected?.start === cell.start;
                  const label = t('avail.cellTitle', {
                    when: whenLabel(cell),
                    free: cell.free.length,
                    busy: cell.busy.length,
                    unknown: cell.unknown.length,
                  });
                  return (
                    <td key={cell.start} className="p-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(isSelected ? null : cell);
                          setSelectedIsPast(!isSelected && Date.parse(cell.end) <= Date.now());
                        }}
                        aria-pressed={isSelected}
                        aria-label={label}
                        title={label}
                        className={`w-full min-w-14 rounded-md border px-1 py-1.5 font-semibold tabular-nums transition hover:brightness-95 ${TONE[cell.status]} ${
                          isSelected ? 'ring-2 ring-blue-600' : ''
                        }`}
                      >
                        {cell.free.length}/{total}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-gray-900">{whenLabel(selected)}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TONE[selected.status]}`}>
              {t(LEGEND.find((l) => l.status === selected.status)!.key)}
            </span>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            {(
              [
                ['avail.free', selected.free, 'text-green-700'],
                ['avail.busy', selected.busy, 'text-red-700'],
                ['avail.unknown', selected.unknown, 'text-gray-500'],
              ] as const
            ).map(([key, names, tone]) => (
              <div key={key}>
                <dt className={`font-medium ${tone}`}>
                  {t(key)} <span className="tabular-nums">({names.length})</span>
                </dt>
                <dd className="text-gray-700">{names.length > 0 ? names.join(', ') : t('avail.nobody')}</dd>
              </div>
            ))}
          </dl>

          {selectedIsPast ? (
            <p className="text-xs text-gray-500">{t('avail.past')}</p>
          ) : canManage ? (
            <button
              type="button"
              onClick={() => ask(selected)}
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {asking ? t('avail.asking') : t('avail.ask')}
            </button>
          ) : (
            <p className="text-xs text-gray-500">{t('avail.managerOnly')}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">{t('avail.pickHint')}</p>
      )}
    </section>
  );
}
