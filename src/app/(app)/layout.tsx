import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AppNav from './app-nav';
import PreviewBanner from './preview-banner';
import { requireSession } from '@/lib/auth-guard';
import { NavDepth } from '@/lib/ui/back-link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { UserRecord } from '@/lib/db/schema';

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // The name is read from the sheet, not from the session. A JWT carries
  // whatever was true when it was issued, so after somebody renames themselves
  // in Settings the sidebar would keep calling them the old name for up to two
  // days -- on the one screen they are looking at when they change it. The
  // session stays the authority on *who* they are; the sheet on what they are
  // called. A read that fails falls back rather than blocking the whole app.
  const me = session.user?.id
    ? await SheetRepo.findOne<UserRecord>('users', session.user.id).catch(() => null)
    : null;
  // ponytail: fail-open when sheet read fails (me===null from .catch) so a
  // transient API error doesn't lock everyone out. Server actions re-check anyway.
  if (me && me.active !== true) redirect('/login');

  const userName = me?.name || session.user?.name || '';

  // Only ever set for a real admin who asked for it -- see lib/role-preview.ts.
  const actor = await requireSession().catch(() => null);

  // h-dvh, not h-screen: on a phone or tablet 100vh is the height the page
  // would have with the browser toolbar hidden, so the bottom of the sidebar --
  // sign out -- sits underneath the toolbar and cannot be reached. dvh shrinks
  // with it.
  return (
    <div className="h-dvh flex flex-col md:flex-row bg-gray-50 text-gray-900 overflow-hidden">
      <NavDepth />
      <AppNav userName={userName} />

      {/* Inside the scrolling column, above the page: the banner belongs to
          what is being looked at, and pinning it over the nav would cover the
          one thing that still works normally. */}
      <main className="flex-1 overflow-y-auto">
        {actor?.previewing && <PreviewBanner role={actor.role} />}
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
