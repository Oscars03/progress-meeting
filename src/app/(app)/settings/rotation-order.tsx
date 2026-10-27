'use client';

import InfoTip from '@/lib/ui/info-tip';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useToast } from '@/lib/ui/toast';
import { slideOffset, useFlip } from '@/lib/ui/flip';
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
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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

  /**
   * Lift the row out and put it back at `to`, rather than swapping the two.
   * A drag that crosses several rows at once -- a fast flick, or a pointer that
   * reports one big jump -- would otherwise trade places with whoever happened
   * to be under the finger at the end, leaving the rows in between untouched.
   * For neighbours the two are the same thing.
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
   * Drag to reorder, by hand.
   *
   * Pointer events rather than HTML5 drag-and-drop, which a finger cannot
   * start at all. Only the handle takes the drag, so the rest of the row still
   * scrolls the page, and `touch-none` on it stops the browser from scrolling
   * instead of dragging once a drag has begun. The arrow buttons stay: they are
   * the keyboard path, and dragging is not one.
   */
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Rows of different heights would otherwise bounce: once a short row passes a
  // tall one, the finger can sit over the tall one again and pull them back. A
  // row only moves the way the finger is travelling.
  const lastY = useRef(0);

  // Rows slide to their new place rather than jump, so who moved is visible.
  const listRef = useRef<HTMLOListElement>(null);
  useFlip(listRef);

  const onHandleDown = (index: number) => (e: React.PointerEvent) => {
    // Capture keeps the moves coming to this handle even when the finger
    // outruns it. It throws if the pointer is already gone, which must not
    // cost us the drag itself.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Carry on uncaptured; the handler still receives moves over the row.
    }
    lastY.current = e.clientY;
    setDragIndex(index);
  };

  const onHandleMove = (e: React.PointerEvent) => {
    if (dragIndex === null) return;

    const over = rowRefs.current.findIndex((row) => {
      if (!row) return false;
      // Where layout put the row, not where a slide is drawing it.
      const box = row.getBoundingClientRect();
      const top = box.top - slideOffset(row);
      return e.clientY >= top && e.clientY <= top + box.height;
    });

    const down = e.clientY > lastY.current;
    const up = e.clientY < lastY.current;
    lastY.current = e.clientY;

    if (over !== -1 && ((over > dragIndex && down) || (over < dragIndex && up))) {
      moveTo(dragIndex, over);
      setDragIndex(over);
    }
  };

  const onHandleUp = () => setDragIndex(null);

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        await setRotationOrderAction(order.map((student) => student.id));
        router.refresh();
        toast(t('common.saved'));
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t('error.generic'));
      }
    });
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-lg font-semibold text-gray-900">{t('rotationOrder.title')}</h3>
        <InfoTip>{t('rotationOrder.desc')}</InfoTip>
      </div>

      {error && (
        <p className="p-3 rounded-lg text-sm border bg-red-50 text-red-800 border-red-200" role="alert">
          {error}
        </p>
      )}

      {order.length === 0 ? (
        <p className="text-sm text-gray-500">{t('rotation.noStudents')}</p>
      ) : (
        <ol ref={listRef} className="space-y-2">
          {order.map((student, index) => (
            <li
              key={student.id}
              data-flip-key={student.id}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              /* The dragged row lifts off the list -- raised, slightly larger
                 and tilted -- so it reads as a card in your hand while the
                 others slide under it. motion-reduce drops the movement for
                 anyone who asked the system for less of it; the motion
                 tokens already take the duration to zero for them. */
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-lg border bg-white transition-all duration-(--motion-base) ease-(--motion-ease-out) ${
                dragIndex === index
                  ? 'border-blue-400 bg-blue-50 shadow-lg scale-105 -rotate-1 z-10 relative motion-reduce:scale-100 motion-reduce:rotate-0'
                  : 'border-gray-200 shadow-none'
              }`}
            >
              <button
                type="button"
                onPointerDown={onHandleDown(index)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                aria-label={t('rotationOrder.drag')}
                title={t('rotationOrder.drag')}
                className="touch-none cursor-grab active:cursor-grabbing px-1.5 py-1 -ml-1 text-gray-500 hover:text-gray-700 select-none"
              >
                ⠿
              </button>

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
                  className="btn btn-secondary btn-sm"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1 || isPending}
                  aria-label={t('presentations.moveDown')}
                  className="btn btn-secondary btn-sm"
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
          className="btn btn-primary"
        >
          {isPending ? t('common.saving') : t('rotationOrder.save')}
        </button>
      )}
    </div>
  );
}
