import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import { getT } from '@/lib/ui/server-i18n';
import type { AttachmentRecord, FeedbackRecord, UserRecord } from '@/lib/db/schema';
import FeedbackForm from './feedback-form';
import FeedbackList, { type FeedbackRow } from './feedback-list';

/**
 * Where anybody says what they think of the app.
 *
 * Everyone writes; an admin reads the lot. A member sees only their own, which
 * is the difference between a suggestion box and a forum -- this is meant for
 * telling whoever runs the lab something, not for a discussion that then needs
 * moderating.
 */
export default async function FeedbackPage() {
  const [actor, t] = await Promise.all([requirePageSession(), getT()]);
  const isAdmin = actor.role === 'admin';

  const [all, users, attachments] = await Promise.all([
    SheetRepo.find<FeedbackRecord>('feedback').catch(() => []),
    SheetRepo.find<UserRecord>('users').catch(() => []),
    SheetRepo.find<AttachmentRecord>('attachments').catch(() => []),
  ]);

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? '—';

  const visible = (isAdmin ? all : all.filter((row) => row.created_by === actor.id))
    // Newest first: the thing somebody just wrote is the thing they want to see.
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Only the row id travels to the browser, never the Drive id: the picture is
  // fetched back through /api/attachments, which is the only thing that can
  // read it.
  const picturesFor = (feedbackId: string) =>
    attachments
      .filter((a) => a.entity_type === 'feedback' && a.entity_id === feedbackId)
      .map((a) => ({ id: a.id, name: a.name }));

  const rows: FeedbackRow[] = visible.map((row) => ({
    id: row.id,
    body: row.body,
    category: row.category,
    status: row.status,
    authorName: nameOf(row.created_by),
    createdAt: row.created_at,
    rowVersion: row.row_version,
    canRemove: isAdmin || row.created_by === actor.id,
    images: picturesFor(row.id),
  }));

  const open = rows.filter((row) => row.status !== 'done');
  const done = rows.filter((row) => row.status === 'done');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('feedback.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? t('feedback.adminHint') : t('feedback.memberHint')}
        </p>
      </div>

      <FeedbackForm />

      {rows.length === 0 ? (
        /* Not a congratulation. Nothing has been said yet, which is different
           from everything having been dealt with -- see CLAUDE.md. Said only
           to the admin, who reads the list; a member with nothing sent sees
           the form and nothing under it. */
        isAdmin && <p className="text-sm text-gray-500">{t('feedback.noneYetAdmin')}</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500">
              {t('feedback.openHeading', { n: open.length })}
            </h3>
            {open.length === 0 ? (
              <p className="text-sm text-gray-500">{t('feedback.nothingOpen')}</p>
            ) : (
              <FeedbackList rows={open} canResolve={isAdmin} />
            )}
          </section>

          {done.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500">
                {t('feedback.doneHeading', { n: done.length })}
              </h3>
              <FeedbackList rows={done} canResolve={isAdmin} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
