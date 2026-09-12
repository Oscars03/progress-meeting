import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db/init-db';

export async function POST() {
  try {
    const result = await initDatabase();
    return NextResponse.json({
      success: true,
      message: `ติดตั้งโครงสร้างฐานข้อมูลสำเร็จ (สร้าง/พบข้อมูลผู้ใช้ ${result.seededCount} รายการ)`,
      data: result
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error?.message || 'เกิดข้อผิดพลาดในการติดตั้งฐานข้อมูล'
    }, { status: 500 });
  }
}
