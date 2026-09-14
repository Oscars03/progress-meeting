'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveWeeklyUpdateAction } from '../update-actions';
import { usePrefs } from '@/lib/ui/prefs';
import type { TranslationKey, TranslationVars } from '@/lib/ui/i18n';

export type TaskRow = {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  overdue: boolean;
  progressPct: number;
  ownerName: string;
  isMine: boolean;
  editable: boolean;
  current: {
    summary: string;
    risks: string;
    nextPlan: string;
    progressPct: number;
  } | null;
  /** Weeks since the most recent update; null when there has never been one. */
  staleWeeks: number | null;
  history: { key: string; reported: boolean }[];
};

type Draft = { progressPct: number; summary: string; risks: string; nextPlan: string };

function staleLabel(row: TaskRow): { key: TranslationKey; vars?: TranslationVars; tone: string } {
  if (row.current) return { key: 'weekly.reported', tone: 'bg-green-50 text-green-700' };
  if (row.staleWeeks === null) return { key: 'weekly.never', tone: 'bg-red-50 text-red-700' };
  if (row.staleWeeks <= 1) return { key: 'weekly.stale1', tone: 'bg-amber-50 text-amber-800' };
  return { key: 'weekly.staleN', vars: { n: row.staleWeeks }, tone: 'bg-red-50 text-red-700' };
}

export default function WeeklyBoard({
  rows,
  weekKey,
  historyKeys,
}: {
  rows: TaskRow[];
  weekKey: string;
  historyKeys: string[];
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);

  const visible = onlyMine ? rows.filter((r) => r.isMine) : rows;
  const pending = visible.filter((r) => !r.current).length;

  const startEdit = (row: TaskRow) => {
    setMessage(null);
    setOpenId(row.id);
    setDraft({
      progressPct: row.current?.progressPct ?? row.progressPct,
      summary: row.current?.summary ?? '',
      risks: row.current?.risks ?? '',
      nextPlan: row.current?.nextPlan ?? '',
    });
  };

  const save = (row: TaskRow) => {
    if (!draft) return;
    if (!draft.summary.trim()) {
      setMessage({ type: 'error', text: t('weekly.summaryRequired') });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await saveWeeklyUpdateAction({
          taskId: row.id,
          progressPct: draft.progressPct,
          summary: draft.summary,
          risks: draft.risks,
          nextPlan: draft.nextPlan,
          weekKey,
        });
        if (!res.ok) {
          setMessage({ type: 'error', text: t(res.error, res.vars) });
          return;
        }
        setOpenId(null);
        setDraft(null);
        setMessage({ type: 'ok', text: t('weekly.savedFor', { title: row.title }) });
        router.refresh();
      } catch {
        setMessage({ type: 'error', text: t('error.generic') });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="text-sm text-gray-600">
          {visible.length === 0 ? (
            // "All reported" over an empty list reads as an achievement when in
            // fact there was nothing to report.
            <span className="text-gray-400">{t('weekly.emptyView')}</span>
          ) : pending === 0 ? (
            <span className="text-green-700 font-medium">{t('weekly.allReported')}</span>
          ) : (
            <>
              {t('weekly.pendingLabel')}{' '}
              <span className="font-semibold text-gray-900 tabular-nums">{pending}</span>{' '}
              {t('weekly.pendingUnit')}
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="rounded border-gray-300"
          />
          {t('weekly.onlyMine')}
        </label>
      </div>

      {message && (
        <div
          role="status"
          className={`p-3 text-sm rounded-lg border ${
            message.type === 'ok'
              ? 'text-green-800 bg-green-50 border-green-200'
              : 'text-red-800 bg-red-50 border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="p-6 bg-white rounded-xl border border-gray-100 text-sm text-gray-400">
          {onlyMine ? t('weekly.noneMine') : t('weekly.noneOpen')}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const stale = staleLabel(row);
            const editing = openId === row.id;

            return (
              <li
                key={row.id}
                className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stale.tone}`}>
                    {t(stale.key, stale.vars)}
                  </span>
                  <h3 className="font-semibold text-gray-900 flex-1 min-w-48">{row.title}</h3>
                  <span className="text-xs text-gray-500">{row.ownerName}</span>
                  {row.dueDate && (
                    <span
                      className={`text-xs tabular-nums ${
                        row.overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                      }`}
                    >
                      {t('weekly.dueOn', { date: row.dueDate })}
                    </span>
                  )}
                  {row.editable && (
                    <button
                      onClick={() => (editing ? setOpenId(null) : startEdit(row))}
                      className="text-sm text-blue-600 hover:underline ml-auto"
                    >
                      {editing ? t('weekly.close') : row.current ? t('weekly.edit') : t('weekly.fill')}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${row.progressPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
                    {row.progressPct}%
                  </span>
                  <div className="flex items-center gap-1" title={t('weekly.historyTitle')}>
                    {row.history.map((h) => (
                      <span
                        key={h.key}
                        aria-label={t(h.reported ? 'weekly.historyReported' : 'weekly.historyMissing', {
                          week: h.key,
                        })}
                        className={`w-2 h-4 rounded-sm ${
                          h.reported ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {row.current && !editing && (
                  <dl className="text-sm space-y-1 pt-2 border-t border-gray-100">
                    <div className="flex gap-2">
                      <dt className="text-gray-500 shrink-0">{t('weekly.doneLabel')}</dt>
                      <dd className="text-gray-900">{row.current.summary}</dd>
                    </div>
                    {row.current.risks && (
                      <div className="flex gap-2">
                        <dt className="text-gray-500 shrink-0">{t('weekly.blockedLabel')}</dt>
                        <dd className="text-amber-800">{row.current.risks}</dd>
                      </div>
                    )}
                    {row.current.nextPlan && (
                      <div className="flex gap-2">
                        <dt className="text-gray-500 shrink-0">{t('weekly.nextWeekLabel')}</dt>
                        <dd className="text-gray-900">{row.current.nextPlan}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {editing && draft && (
                  <div className="pt-3 border-t border-gray-100 space-y-3">
                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        htmlFor={`pct-${row.id}`}
                      >
                        {t('weekly.progress', { pct: draft.progressPct })}
                      </label>
                      <input
                        id={`pct-${row.id}`}
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={draft.progressPct}
                        onChange={(e) =>
                          setDraft({ ...draft, progressPct: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        htmlFor={`sum-${row.id}`}
                      >
                        {t('weekly.summaryField')}
                      </label>
                      <textarea
                        id={`sum-${row.id}`}
                        rows={2}
                        value={draft.summary}
                        onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        htmlFor={`risk-${row.id}`}
                      >
                        {t('weekly.risksField')}
                      </label>
                      <textarea
                        id={`risk-${row.id}`}
                        rows={2}
                        value={draft.risks}
                        onChange={(e) => setDraft({ ...draft, risks: e.target.value })}
                        placeholder={t('weekly.risksPlaceholder')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        htmlFor={`next-${row.id}`}
                      >
                        {t('weekly.nextField')}
                      </label>
                      <textarea
                        id={`next-${row.id}`}
                        rows={2}
                        value={draft.nextPlan}
                        onChange={(e) => setDraft({ ...draft, nextPlan: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => save(row)}
                        disabled={isPending}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                      >
                        {isPending ? t('common.saving') : t('weekly.save')}
                      </button>
                      <span className="text-xs text-gray-500">{t('weekly.oneReport')}</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-gray-400">
        {t('weekly.legend', { from: historyKeys[historyKeys.length - 1], to: historyKeys[0] })}
      </p>
    </div>
  );
}
