import { NextResponse } from 'next/server';
import { writeQueue } from '@/lib/db/write-queue';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, AuthorizationError } from '@/lib/auth-guard';

const WATCHED_TABS = ['users', 'tasks', 'meetings'] as const;

export async function GET() {
  try {
    await requireSession();
  } catch (error) {
    const status = error instanceof AuthorizationError ? 401 : 500;
    return NextResponse.json({ status: 'UNAUTHORIZED' }, { status });
  }

  try {
    await SheetRepo.find('meta');

    return NextResponse.json({
      status: 'OK',
      queues: WATCHED_TABS.map((name) => ({
        name,
        depth: writeQueue.getQueueDepth(name),
        busy: writeQueue.isBusy(name),
      })),
      message: 'System is healthy',
    });
  } catch (error) {
    // Detail stays server-side: Sheets errors carry the spreadsheet id and the
    // service-account address.
    console.error('status check failed:', error);
    return NextResponse.json(
      { status: 'ERROR', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' },
      { status: 500 }
    );
  }
}
