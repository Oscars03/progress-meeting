import { NextResponse } from 'next/server';
import { initDatabase, DatabaseAlreadyInitializedError } from '@/lib/db/init-db';
import { requireRole, AuthorizationError } from '@/lib/auth-guard';

/**
 * Destructive: rewrites every tab's header row and seeds the users tab.
 * Admin session required -- this handler is reachable by anyone who knows the URL.
 */
export async function POST(request: Request) {
  try {
    await requireRole('admin');
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 500;
    return NextResponse.json(
      { success: false, message: 'Administrator sign-in required' },
      { status }
    );
  }

  // Rewriting headers over a populated sheet is opt-in, never the default.
  let force = false;
  try {
    const body = await request.json();
    force = body?.force === true;
  } catch {
    // No body at all: treat as a plain, non-forced run.
  }

  try {
    const result = await initDatabase({ force });
    return NextResponse.json({
      success: true,
      message: `Database structure installed (${result.seededCount} seed users created)`,
      data: result,
    });
  } catch (error) {
    if (error instanceof DatabaseAlreadyInitializedError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
          populatedTabs: error.populatedTabs,
        },
        { status: 409 }
      );
    }
    console.error('db-init failed:', error);
    return NextResponse.json(
      { success: false, message: 'Database installation failed' },
      { status: 500 }
    );
  }
}
