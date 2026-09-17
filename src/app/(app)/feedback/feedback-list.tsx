'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { deleteFeedbackAction, setFeedbackStatusAction } from './actions';
import { formatLabTime } from '@/lib/lab-time';

export type FeedbackRow = {
  id: string;
  body: string;
  category: string;
  status: string;
  authorName: string;
  createdAt: string;
  rowVersion: number;
  /** Whether the person looking at it may withdraw it. */
  canRemove: boolean;
  /**
   * Pictures sent with it. These are attachment row ids, not Drive ids -- the
   * file itself is private to the lab's Drive and only /api/attachments can
   * read it.
   */
  images: { id: string; name: string }[];
};

const CATEGORY_STYLE: Record<string, string> = {
  problem: 'bg-red-50 text-red-700 border-red-200',
  idea: 'bg-blue-50 text-blue-700 border-blue-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function FeedbackList({
  rows,
  canResolve,
}: {
  rows: FeedbackRow[];
  /** Admin only: whether this viewer can mark something dealt with. */
  canResolve: boolean;
}) {
  const { t, locale } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const act = (work: () => Promise<{ ok: boolean }>) => {
    startTransition(async () => {
      await work();
      router.refresh();
    });
  };

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li
          key={row.id}
          className={`p-4 rounded-xl border ${
            row.status === 'done'
              ? 'bg-gray-50 border-gray-200'
              : 'bg-white border-gray-100 shadow-sm'
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.other
              }`}
            >
              {t(`feedback.category.${row.category}` as 'feedback.category.problem')}
            </span>

            {row.status === 'done' && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                {t('feedback.done')}
              </span>
            )}

            <span className="text-xs text-gray-500">{row.authorName}</span>
            <span className="text-xs text-gray-400 tabular-nums">
              {formatLabTime(row.createdAt, locale)}
            </span>
          </div>

          {/* whitespace-pre-line: people write in paragraphs and a collapsed
              message reads as one run-on complaint. */}
          <p className="text-sm text-gray-900 whitespace-pre-line break-words">{row.body}</p>

          {/* A thumbnail that opens the full picture in a tab. Not next/image:
              these are served by an app route behind a session, so there is no
              loader that could fetch or cache them, and the optimiser would
              only put a second request in front of one that already needs the
              viewer's cookies. */}
          {row.images.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {row.images.map((image) => (
                <li key={image.id}>
                  <a
                    href={`/api/attachments/${image.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={image.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/attachments/${image.id}`}
                      alt={image.name}
                      loading="lazy"
                      className="h-28 w-28 rounded-lg border border-gray-200 object-cover transition hover:brightness-95"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {(canResolve || row.canRemove) && (
            <div className="flex flex-wrap gap-3 mt-3 text-sm">
              {canResolve && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    act(() =>
                      setFeedbackStatusAction(
                        row.id,
                        row.status === 'done' ? 'open' : 'done',
                        row.rowVersion
                      )
                    )
                  }
                  className="text-blue-600 hover:underline disabled:opacity-50"
                >
                  {row.status === 'done' ? t('feedback.reopen') : t('feedback.markDone')}
                </button>
              )}

              {row.canRemove && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => act(() => deleteFeedbackAction(row.id, row.rowVersion))}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
