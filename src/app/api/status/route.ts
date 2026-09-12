import { NextResponse } from 'next/server';
import { writeQueue } from '@/lib/db/write-queue';
import { SheetRepo } from '@/lib/db/sheet-repo';

export async function GET() {
  try {
    // Just a simple check if we can reach the sheet meta
    await SheetRepo.find('meta');
    
    // Check queue depths
    const queues = ['users', 'tasks', 'meetings'].map(q => ({
      name: q,
      depth: writeQueue.getQueueDepth(q)
    }));

    return NextResponse.json({
      status: 'OK',
      queues,
      message: 'System is healthy'
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'ERROR',
      message: error.message
    }, { status: 500 });
  }
}
