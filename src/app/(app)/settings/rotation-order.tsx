'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { setRotationOrderAction } from './actions';

export type RotationStudent = { id: string; name: string };

/**
 * The order the weekly duty loops in.
 *
 * Reordering is local until saved, so arranging several people costs one write
 * rather than one per press, and `dirty` is what keeps the Save button honest
 * about there being anything to save.
 */
export default function RotationOrder({ students }: { students: RotationStudent[] }) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [order, setOrder] = useState(students);

  // Re-sync when the server sends a different list -- someone added, renamed or
  // deactivated. Adjusted during render rather than in an effect, which would
  // render twice and trips react-hooks/set-state-in-effect.
  const signature = students.map((s) => s.id).join('|');
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setOrder(students);
  }

  const dirty = order.some((student, i) => students[i]?.id !== student.id);

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
  };

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        await setRotationOrderAction(order.map((student) => student.id));
        router.refresh();
        setMessage({ kind: 'ok', text: t('common.saved') });
      } catch (err) {
        setMessage({
          kind: 'error',
          text: err instanceof Error && err.message ? err.message : t('error.generic'),
        });
      }
    });
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('rotationOrder.title')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('rotationOrder.desc')}</p>
      </div>

      {message && (
        <p
          className={`p-3 rounded-lg text-sm border ${
            message.kind === 'ok'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
          role="status"
        >
          {message.text}
        </p>
      )}

      {order.length === 0 ? (
        <p className="text-sm text-gray-500">{t('rotation.noStudents')}</p>
      ) : (
        <ol className="space-y-2">
          {order.map((student, index) => (
            <li
              key={student.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-lg border border-gray-200"
            >
              <span className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-700 text-sm font-semibold tabular-nums">
                {index + 1}
              </span>
              <span className="flex-1 min-w-32 font-medium text-gray-900">{student.name}</span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || isPending}
                  aria-label={t('presentations.moveUp')}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1 || isPending}
                  aria-label={t('presentations.moveDown')}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {order.length > 1 && (
        <button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {isPending ? t('common.saving') : t('rotationOrder.save')}
        </button>
      )}
    </div>
  );
}
