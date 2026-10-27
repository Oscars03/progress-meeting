import type { ReactNode } from 'react';
import BackLink from './back-link';

/**
 * The top of every page: the same title, in the same place, at the same size.
 *
 * Each page used to write its own, and they drifted -- Tasks put its name
 * inside a card under a different name, the calendar shrank its title on a
 * phone and ran it into a row of badges. One component is the only way they
 * stay alike.
 *
 * - `back`: the href a BackLink above the title falls back to.
 * - `aside`: small things that belong to the title itself, on its line
 *   (a status badge).
 * - `description`: one quiet line under it.
 * - `actions`: the page's buttons, to the right on a wide screen and under
 *   the title on a narrow one.
 */
export default function PageHeader({
  title,
  back,
  aside,
  description,
  actions,
}: {
  title: ReactNode;
  back?: string;
  aside?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      {back && <BackLink href={back} />}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          {aside}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <div className="text-sm text-gray-500 space-y-1">{description}</div>}
    </div>
  );
}
