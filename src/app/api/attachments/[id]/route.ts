import { NextResponse } from 'next/server';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, AuthorizationError } from '@/lib/auth-guard';
import { readFile } from '@/lib/google/drive';
import type { AttachmentRecord } from '@/lib/db/schema';

/**
 * Hand back an uploaded picture.
 *
 * The files are private to the lab's Drive and are never link-shared, so this
 * route is the only way to see one -- which is the point. A screenshot sent as
 * feedback can hold whatever was on the sender's screen, and publishing it to
 * anyone holding a Google link is not a promise this app should make for them.
 * Signing in is the whole check: every member can already read the feedback
 * these belong to.
 *
 * The id in the path is the attachment row, not the Drive file id. Somebody
 * guessing ids gets nothing they could not reach through the page, and the
 * Drive id never appears in a URL at all.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch (error) {
    const status = error instanceof AuthorizationError ? 401 : 500;
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status });
  }

  const { id } = await params;

  const row = await SheetRepo.findOne<AttachmentRecord>('attachments', id);
  if (!row || !row.url) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    const file = await readFile(row.url);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': file.mime,
        'Content-Length': String(file.bytes.length),
        // Private, because the response is only for the person who asked and
        // a shared cache in front of this must not hand it to the next caller.
        // Immutable because an attachment's bytes never change: the row is
        // written once and deleted, never edited.
        'Cache-Control': 'private, max-age=86400, immutable',
        'Content-Disposition': `inline; filename="${encodeURIComponent(row.name || 'image')}"`,
      },
    });
  } catch (error) {
    console.error(`Could not read attachment ${id}:`, error);
    return NextResponse.json({ error: 'UNAVAILABLE' }, { status: 502 });
  }
}
