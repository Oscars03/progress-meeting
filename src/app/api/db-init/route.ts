import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db/init-db';
import { requireRole, AuthorizationError } from '@/lib/auth-guard';

/**
 * Destructive: rewrites every tab's header row and seeds the users tab.
 * Admin session required -- this handler is reachable by anyone who knows the URL.
 */
export async function POST() {
  try {
    await requireRole('admin');
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 500;
    return NextResponse.json(
      { success: false, message: 'ต้องเข้าสู่ระบบด้วยสิทธิ์ผู้ดูแลระบบ' },
      { status }
    );
  }

  try {
    const result = await initDatabase();
    return NextResponse.json({
      success: true,
      message: `ติดตั้งโครงสร้างฐานข้อมูลสำเร็จ (สร้าง/พบข้อมูลผู้ใช้ ${result.seededCount} รายการ)`,
      data: result,
    });
  } catch (error) {
    console.error('db-init failed:', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการติดตั้งฐานข้อมูล' },
      { status: 500 }
    );
  }
}
