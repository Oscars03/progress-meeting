'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { addTopic, deleteTopic, setTopicOrder, clearTopicOrder, updateTopic } from './actions';
import type { ActionResult } from '@/lib/action-result';

export type BoardTopic = {
  id: string;
  title: string;
  details: string;
  owner_id: string;
  owner_name: string;
  row_version: number;
};

/**
 * The week's running order.
 *
 * Reordering is local until it is saved, so arranging several people does not
 * fire a write per press. `dirty` compares against what the server sent, which
 * is also what makes the Save button honest about there being nothing to save.
 */
export default function OrderBoard({
  weekKey,
  topics,
  custom,
  canArrange,
  currentUserId,
}: {
  weekKey: string;
  topics: BoardTopic[];
  custom: boolean;
  canArrange: boolean;
  currentUserId: string;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const [order, setOrder] = useState<BoardTopic[]>(topics);
  const [adding, setAdding] = useState(false);

  // Re-sync when the server sends a different set -- a topic added, edited or
  // removed. Without this the local copy kept showing the list as it was when
  // the component first mounted, so a newly added topic only appeared after a
  // full reload. Adjusted during render rather than in an effect: an effect
  // would render twice and trips react-hooks/set-state-in-effect.
  const signature = topics.map((topic) => `${topic.id}:${topic.row_version}`).join('|');
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setOrder(topics);
  }

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const dirty = order.some((topic, i) => topics[i]?.id !== topic.id);

  const run = (work: () => Promise<ActionResult>) => {
    setError('');
    startTransition(async () => {
      try {
        const res = await work();
        if (res.ok) router.refresh();
        else setError(t(res.error, res.vars));
      } catch {
        setError(t('error.generic'));
      }
    });
  };

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
  };

  const submitTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      const topic = order.find((x) => x.id === editingId);
      if (!topic) return;
      run(async () => {
        const res = await updateTopic(editingId, { title, details }, topic.row_version);
        if (res.ok) {
          setEditingId(null);
          setTitle('');
          setDetails('');
          setAdding(false);
        }
        return res;
      });
      return;
    }

    run(async () => {
      const res = await addTopic({ title, details, week_key: weekKey });
      if (res.ok) {
        setTitle('');
        setDetails('');
        setAdding(false);
      }
      return res;
    });
  };

  const startEdit = (topic: BoardTopic) => {
    setEditingId(topic.id);
    setTitle(topic.title);
    setDetails(topic.details);
    setAdding(true);
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            custom ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {custom ? t('presentations.customBadge') : t('presentations.suggestedBadge')}
        </span>
        {!custom && <span className="text-xs text-gray-500">{t('presentations.suggestedHint')}</span>}

        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setTitle('');
            setDetails('');
            setAdding((open) => !open);
          }}
          className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition whitespace-nowrap"
        >
          {t('topics.add')}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={submitTopic}
          className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3"
        >
          <h3 className="font-semibold text-gray-900">
            {editingId ? t('topics.edit') : t('topics.addTitle')}
          </h3>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="topic-title">
              {t('topics.title')}
            </label>
            <input
              id="topic-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('topics.titlePlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="topic-details">
              {t('topics.details')}
            </label>
            <textarea
              id="topic-details"
              rows={2}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setEditingId(null);
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {t('topics.submit')}
            </button>
          </div>
        </form>
      )}

      {order.length === 0 ? (
        <div className="p-6 text-center bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-gray-500">{t('presentations.empty')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('presentations.emptyHint')}</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {order.map((topic, index) => {
            const mine = topic.owner_id === currentUserId;
            return (
              <li
                key={topic.id}
                className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-2"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-700 text-sm font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <span className="font-semibold text-gray-900 flex-1 min-w-48">{topic.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                    {topic.owner_name}
                  </span>
                  {mine && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                      {t('topics.mine')}
                    </span>
                  )}
                </div>

                {topic.details && <p className="text-sm text-gray-600">{topic.details}</p>}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {canArrange && (
                    <>
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
                    </>
                  )}

                  {(mine || canArrange) && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(topic)}
                        disabled={isPending}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {t('topics.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm(t('topics.confirmDelete'))) return;
                          run(() => deleteTopic(topic.id, topic.row_version));
                        }}
                        disabled={isPending}
                        className="text-sm text-red-500 hover:underline"
                      >
                        {t('common.delete')}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {canArrange && order.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              run(() =>
                setTopicOrder(order.map((topic) => ({ id: topic.id, row_version: topic.row_version }))),
              )
            }
            disabled={isPending || !dirty}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {t('presentations.saveOrder')}
          </button>

          {custom && (
            <button
              type="button"
              onClick={() =>
                run(() =>
                  clearTopicOrder(
                    topics.map((topic) => ({ id: topic.id, row_version: topic.row_version })),
                  ),
                )
              }
              disabled={isPending}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('presentations.resetOrder')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
