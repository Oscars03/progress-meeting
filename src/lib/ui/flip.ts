'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * A CSS duration as milliseconds: "320ms" and "0.32s" both give 320. Anything
 * unreadable gives 0, which means "do not animate" -- the safe way to be wrong.
 */
export function toMs(value: string): number {
  const v = value.trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  if (v.endsWith('ms')) return n;
  if (v.endsWith('s')) return n * 1000;
  return n;
}

/**
 * How far a row is drawn from where layout put it, because a slide is still
 * running on it. Hit-testing a drag must subtract this: a neighbour that is
 * still on its way out would otherwise read as being under the finger, and the
 * two rows would trade places back and forth.
 */
export function slideOffset(el: Element): number {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none') return 0;
  return new DOMMatrixReadOnly(transform).m42;
}

/**
 * Where a row sits inside the list, from layout alone. offsetTop ignores
 * transforms, so neither a running slide nor the scale on a lifted row moves
 * it, and measuring against the list rather than the page means scrolling, or
 * something opening above the list, does not either.
 */
function topIn(list: HTMLElement, row: HTMLElement): number {
  return row.offsetParent === list ? row.offsetTop : row.offsetTop - list.offsetTop;
}

/**
 * Slide reordered rows from their old place to the new one (FLIP: First, Last,
 * Invert, Play), so a viewer can follow who moved where instead of watching a
 * card jump.
 *
 * Every direct child of `list` with a `data-flip-key` takes part. Positions are
 * recorded on every commit; only a commit that changes the order of the keys
 * plays anything, so a row growing or a form opening above the list stays put.
 * A row caught mid-slide by the next move starts from where it is drawn, not
 * from where it was heading.
 *
 * Duration and easing come from --motion-slow and --motion-ease-out, which
 * already go to 0ms under prefers-reduced-motion -- a zero duration simply
 * lets the rows jump, as they did before.
 */
export function useFlip(list: RefObject<HTMLElement | null>) {
  const last = useRef<{ order: string; tops: Map<string, number> }>({ order: '', tops: new Map() });
  const running = useRef(new Map<string, Animation>());

  useLayoutEffect(() => {
    const root = list.current;
    const rows = root
      ? Array.from(root.children).filter(
          (el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.flipKey,
        )
      : [];
    const order = rows.map((row) => row.dataset.flipKey).join('|');
    const tops = new Map(rows.map((row) => [row.dataset.flipKey!, topIn(root!, row)]));

    const before = last.current;
    last.current = { order, tops };
    if (!root || order === before.order) return;

    const style = getComputedStyle(root);
    const duration = toMs(style.getPropertyValue('--motion-slow'));
    const easing = style.getPropertyValue('--motion-ease-out').trim() || 'ease-out';

    for (const row of rows) {
      const key = row.dataset.flipKey!;
      // Read before cancelling: this is where the row is drawn right now.
      const drawn = slideOffset(row);
      running.current.get(key)?.cancel();
      running.current.delete(key);

      const was = before.tops.get(key);
      if (was === undefined || duration <= 0) continue;

      const dy = was + drawn - tops.get(key)!;
      if (Math.abs(dy) < 1) continue;

      const slide = row.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        { duration, easing },
      );
      slide.onfinish = () => {
        if (running.current.get(key) === slide) running.current.delete(key);
      };
      running.current.set(key, slide);
    }
  });
}
