'use client';

import { useRef, useState, useTransition } from 'react';
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

/** A presenter and everything they are bringing, in their own order. */
type Block = { ownerId: string; ownerName: string; topics: BoardTopic[] };

/**
 * Group the flat list the server sends into one block per person, keeping the
 * order it arrived in. A person's place is where their first topic falls.
 */
function toBlocks(topics: BoardTopic[]): Block[] {
  const blocks: Block[] = [];
  const byOwner = new Map<string, Block>();

  for (const topic of topics) {
    const existing = byOwner.get(topic.owner_id);
    if (existing) {
      existing.topics.push(topic);
      continue;
    }
    const block: Block = { ownerId: topic.owner_id, ownerName: topic.owner_name, topics: [topic] };
    byOwner.set(topic.owner_id, block);
    blocks.push(block);
  }

  return blocks;
}

/**
 * The week's running order, arranged by presenter.
 *
 * A meeting runs person by person: somebody stands up, shows the two or three
 * things they have been working on, and sits down. Arranging loose topics let
 * one person's three be scattered through the hour, so they were called on
 * three times and the list on screen was not the order anybody would run.
 *
 * So a person is what you move, and their topics go with them. What gets
 * stored is still a position per topic -- the block is flattened on save --
 * which is why this needed no change to the sheet.
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

  const [order, setOrder] = useState<Block[]>(() => toBlocks(topics));
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
    setOrder(toBlocks(topics));
  }

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const flat = order.flatMap((block) => block.topics);
  const dirty = flat.some((topic, i) => topics[i]?.id !== topic.id);

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

  /**
   * Lift a presenter out and put them back at `to`, rather than swapping the
   * two. A drag crossing several rows at once -- a flick, or a pointer that
   * reports one big jump -- would otherwise trade places with whoever happened
   * to be under the finger at the end, leaving everybody between untouched.
   */
  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [lifted] = next.splice(from, 1);
    next.splice(to, 0, lifted);
    setOrder(next);
  };

  const move = (index: number, by: -1 | 1) => moveTo(index, index + by);

  /**
   * Drag a presenter, and everything they brought comes with them.
   *
   * Pointer events rather than HTML5 drag-and-drop, which a finger cannot
   * start at all. Only the handle takes the drag, so the rest of the card still
   * scrolls the page, and `touch-none` on it stops the browser scrolling
   * instead of dragging once one has begun. The arrows stay: they are the
   * keyboard path, and dragging is not one.
   */
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const onHandleDown = (index: number) => (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Carry on uncaptured; the handler still receives moves over the card.
    }
    setDragIndex(index);
  };

  const onHandleMove = (e: React.PointerEvent) => {
    if (dragIndex === null) return;
    const over = rowRefs.current.findIndex((row) => {
      if (!row) return false;
      const box = row.getBoundingClientRect();
      return e.clientY >= box.top && e.clientY <= box.bottom;
    });
    if (over !== -1 && over !== dragIndex) {
      moveTo(dragIndex, over);
      setDragIndex(over);
    }
  };

  const onHandleUp = () => setDragIndex(null);

  const submitTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      const topic = flat.find((x) => x.id === editingId);
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
          {order.map((block, index) => {
            const mine = block.ownerId === currentUserId;
            return (
              <li
                key={block.ownerId}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                className={`p-4 bg-white rounded-xl border shadow-sm space-y-3 transition ${
                  dragIndex === index
                    ? 'border-blue-300 ring-2 ring-blue-200 scale-[1.01] shadow-md'
                    : 'border-gray-100'
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {canArrange && (
                    <span
                      onPointerDown={onHandleDown(index)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                      title={t('presentations.dragHint')}
                      className="touch-none cursor-grab active:cursor-grabbing px-1.5 py-1 -ml-1 text-gray-400 hover:text-gray-600 select-none"
                    >
                      ⠿
                    </span>
                  )}

                  {/* Blue means "you" everywhere -- the same mark the
                      dashboard fills in its row of presenters. The number is
                      the loudest thing in the row because the row is about
                      the number. */}
                  <span
                    className={`w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full text-base font-bold tabular-nums ${
                      mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {index + 1}
                  </span>

                  <span className="font-semibold text-gray-900 flex-1 min-w-32">
                    {block.ownerName}
                  </span>

                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 tabular-nums">
                    {t('presentations.topicCount', { n: block.topics.length })}
                  </span>

                  {mine && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                      {t('topics.mine')}
                    </span>
                  )}

                  {canArrange && (
                    <span className="flex items-center gap-1">
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
                    </span>
                  )}
                </div>

                {/* The person is the thing being ordered, so their topics sit
                    inside them rather than as siblings competing for a place. */}
                <ul className="space-y-1.5 pl-2 border-l-2 border-gray-100">
                  {block.topics.map((topic) => (
                    <li key={topic.id} className="pl-3 flex gap-2.5">
                      {/* A dot, not a number. The count is already on the
                          row, and a numbered topic beside a numbered presenter
                          read as the same number twice -- worst for the common
                          case of one topic, where the "1" said nothing at all.
                          bg-current over text-gray-400 so the dot follows the
                          theme; bg-gray-400 is not on the dark remap list. */}
                      <span className="shrink-0 mt-2 h-1.5 w-1.5 rounded-full bg-current text-gray-400" />

                      <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm font-medium text-gray-900 flex-1 min-w-40 break-words">
                          {topic.title}
                        </span>

                        {(mine || canArrange) && (
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(topic)}
                              disabled={isPending}
                              className="text-xs text-blue-600 hover:underline"
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
                              className="text-xs text-red-500 hover:underline"
                            >
                              {t('common.delete')}
                            </button>
                          </span>
                        )}
                      </div>

                      {topic.details && (
                        <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line break-words">
                          {topic.details}
                        </p>
                      )}
                      </div>
                    </li>
                  ))}
                </ul>
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
                setTopicOrder(
                  flat.map((topic) => ({ id: topic.id, row_version: topic.row_version })),
                  weekKey,
                ),
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
                    weekKey,
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
