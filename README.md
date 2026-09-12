# Weekly Progress Meeting System

ระบบจัดการการประชุมความคืบหน้ารายสัปดาห์แบบ Zero-Ops ที่ใช้ Google Sheets เป็นฐานข้อมูล (Single Source of Truth) เพื่อลดภาระการดูแลระบบฐานข้อมูล

## ข้อจำกัดของ Sheets-as-DB (โปรดอ่าน)

เนื่องจากระบบนี้ใช้ Google Sheets แทน Database แบบปกติ จึงมีข้อจำกัดและข้อควรระวังดังนี้:
1. **Performance Limit**: การอ่านและเขียนทำได้ช้ากว่า Database ปกติ ระบบจึงมีการใช้ Write Queue แบบ FIFO และ Mutex Lock เพื่อป้องกันการเขียนชนกัน และมี In-memory Cache สำหรับการอ่านข้อมูล
2. **Quota Limit**: Google Sheets API มีข้อจำกัดโควต้า (60 requests / minute / user) ระบบจึงรวบรวมการเขียนทั้งหมดเป็น Batch Update (batchUpdate/batchGet)
3. **Data Constraint**: ไม่มี Foreign Keys หรือ Cascade Delete จริงๆ ต้องทำ Logic ในฝั่ง Application ทั้งหมด
4. **Size Limit**: 1 ชีตสามารถมีข้อมูลได้จำกัด ระบบจะมีการตั้งแจ้งเตือนหากแท็บใดแท็บหนึ่งมีข้อมูลเกิน 50,000 แถว ควรสำรองข้อมูลรายปีและขึ้น Sheet ใหม่

## การติดตั้ง (Setup)

1. คัดลอก `.env.example` เป็น `.env.local`
2. สร้าง Google Service Account จาก [Google Cloud Console](https://console.cloud.google.com/)
3. สร้าง Google Sheet เปล่าๆ ขึ้นมา 1 เล่ม และ **แชร์สิทธิ์ Editor ให้กับ Email ของ Service Account**
4. นำ `SPREADSHEET_ID` และ `SERVICE_ACCOUNT_JSON` มาใส่ใน `.env.local` (ใส่เป็น JSON String บรรทัดเดียวในเครื่องหมาย Single Quote `''`)
5. รันคำสั่ง `npm run db:init` เพื่อสร้างแท็บและโครงสร้างฐานข้อมูลเริ่มต้น พร้อมข้อมูลทดสอบ
6. รัน `npm run dev`

## การใช้งาน

- Login ด้วยอีเมล `admin@test.com` รหัสผ่าน `password` เพื่อเข้าใช้งานในฐานะผู้ดูแล
