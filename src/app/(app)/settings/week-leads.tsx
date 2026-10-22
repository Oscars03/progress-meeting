'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useToast } from '@/lib/ui/toast';
import { setWeekLead } from '../meetings/actions';
import type { RotationStudent } from './rotation-order';

export type WeekLeadRow = {
  week_key: string;
  /** "19 – 25 ต.ค.", formatted on the server in the reader's locale. */
  range: string;
  /** Empty for a week nobody holds. */
  user_id: string;
  name: string;
  /** True when `week_leads` records it; false when it is where the order lands. */
  confirmed: boolean;
  break_name: string | null;
  current: boolean;
};

/**
 * Who leads each week around now, and the means to change any of them.
 *
 * The dashboard's picker only reaches the current week, so a wrong lead last
 * week, or a swap agreed for a week ahead, had no screen at all. Each row
 * saves on its own: weeks are settled one at a time, and a single Save for the
 * whole list would hide which of them had actually changed.
 */
export default function WeekLeads({ rows, students }: { rows: WeekLeadRow[]; students: RotationStudent[] }) {
  const { t } = usePrefs();

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('weekLeads.title')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('weekLeads.desc')}</p>
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-gray-500">{t('rotation.noStudents')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            // Keyed on what the server says, so a saved change remounts the row
            // with its new value instead of keeping the old local choice.
            <WeekRow key={`${row.week_key}:${row.user_id}:${row.confirmed}`} row={row} students={students} />
          ))}
        </ul>
      )}
    </div>
  );
}

function WeekRow({ row, students }: { row: WeekLeadRow; students: RotationStudent[] }) {
  const { t } = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState(row.user_id);

  const save = (userId: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await setWeekLead(row.week_key, userId);
        if (res.ok) {
          router.refresh();
          toast(t('common.saved'));
        } else {
          setError(t(res.error, res.vars));
        }
      } catch {
        setError(t('error.generic'));
      }
    });
  };

  // A lead who has since left the rotation is still who held the week, so the
  // select has to be able to show them even though nobody can choose them now.
  const options =
    row.user_id && !students.some((s) => s.id === row.user_id)
      ? [...students, { id: row.user_id, name: row.name || row.user_id }]
      : students;

  const label = (
    <span className="flex items-center gap-2 w-36 shrink-0 text-sm">
      <span className={row.current ? 'font-semibold text-gray-900' : 'text-gray-600'}>{row.range}</span>
      {row.current && (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 whitespace-nowrap">
          {t('weekLeads.thisWeek')}
        </span>
      )}
    </span>
  );

  const clearButton = row.confirmed && (
    <button
      type="button"
      onClick={() => save('')}
      disabled={isPending}
      title={t('weekLeads.clearHint')}
      className="btn btn-secondary btn-sm"
    >
      {t('weekLeads.clear')}
    </button>
  );

  return (
    <li
      className={`p-3 rounded-lg border space-y-2 ${
        row.current ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {label}

        {row.break_name ? (
          <>
            <span className="flex-1 min-w-40 text-sm text-gray-500">
              {t('meetings.weekBreak', { name: row.break_name })}
              {row.confirmed && (
                <span className="block text-amber-800">
                  {t('weekLeads.breakHeld')}: <span className="font-medium">{row.name}</span>
                </span>
              )}
            </span>
            {clearButton}
          </>
        ) : (
          <>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              disabled={isPending}
              aria-label={t('weekLeads.weekOf', { range: row.range })}
              className="flex-1 min-w-40 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
            >
              {!row.user_id && <option value="">{t('meetings.weekNoLead')}</option>}
              {options.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>

            {row.user_id && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                  row.confirmed ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
                }`}
              >
                {row.confirmed ? t('rotation.confirmed') : t('rotation.suggested')}
              </span>
            )}

            {choice && choice !== row.user_id ? (
              <button
                type="button"
                onClick={() => save(choice)}
                disabled={isPending}
                className="btn btn-primary btn-sm"
              >
                {isPending ? t('common.saving') : t('common.save')}
              </button>
            ) : (
              clearButton
            )}
          </>
        )}
      </div>

      {error && (
        <p className="p-2 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
