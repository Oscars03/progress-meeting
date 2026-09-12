# Weekly Progress Meeting System

ระบบจัดการการประชุมความคืบหน้ารายสัปดาห์แบบ Zero-Ops ที่ใช้ Google Sheets เป็นฐานข้อมูล (Single Source of Truth) เพื่อลดภาระการดูแลระบบฐานข้อมูล

## ข้อจำกัดของ Sheets-as-DB (โปรดอ่าน)

เนื่องจากระบบนี้ใช้ Google Sheets แทน Database แบบปกติ จึงมีข้อจำกัดและข้อควรระวังดังนี้:

1. **Performance Limit**: อ่าน/เขียนช้ากว่า Database ปกติ ระบบจึงมี In-memory Cache (TTL 60 วินาที) สำหรับการอ่าน
2. **Concurrency**: มี Write Queue (FIFO + Mutex) กันการเขียนชนกัน **แต่ทำงานภายในโปรเซสเดียวเท่านั้น** — บน Vercel หรือ host ที่รันหลาย instance คำขอจะกระจายไปคนละโปรเซสและคิวจะไม่ครอบคลุมข้ามกัน **ตัวกันข้อมูลทับกันจริง ๆ คือ `row_version`** (optimistic concurrency) ซึ่งบังคับใช้เสมอในทุกการ update
3. **Cache Staleness**: cache เป็นแบบ per-process เช่นกัน — instance อื่นอาจเห็นข้อมูลเก่าได้นานสุดตาม TTL
4. **Quota Limit**: Google Sheets API จำกัดโควต้า (60 requests / minute / user) ระบบจึงรวมการเขียนเป็น Batch Update
5. **Data Constraint**: ไม่มี Foreign Keys หรือ Cascade Delete ต้องทำ Logic ฝั่ง Application ทั้งหมด
6. **Size Limit**: ควรสำรองข้อมูลรายปีและขึ้น Sheet ใหม่หากแท็บใดเกิน 50,000 แถว

## การติดตั้ง (Setup)

1. คัดลอก `.env.example` เป็น `.env.local`
2. สร้าง Google Service Account จาก [Google Cloud Console](https://console.cloud.google.com/)
3. สร้าง Google Sheet เปล่า 1 เล่ม และ **แชร์สิทธิ์ Editor ให้กับ Email ของ Service Account**
4. ใส่ `SPREADSHEET_ID` และ `SERVICE_ACCOUNT_JSON` ใน `.env.local` (JSON บรรทัดเดียวในเครื่องหมาย `''`)
5. ตั้งค่า `NEXTAUTH_SECRET` — สร้างด้วย `openssl rand -base64 32`
6. ตั้งค่า `SEED_PASSWORD` เป็นรหัสผ่านของบัญชีทดสอบ (ค่าเริ่มต้น `changeme123` — **ควรเปลี่ยน**)
7. รัน `npm run db:init` เพื่อสร้างแท็บและข้อมูลเริ่มต้น
8. รัน `npm run dev`

## ความปลอดภัย (Security)

- **รหัสผ่านถูกเก็บเป็น bcrypt hash เสมอ** คอลัมน์ `password_hash` ไม่เคยเก็บ plaintext และหน้าเว็บไม่แสดงรหัสผ่านเดิม (ตั้งใหม่ได้อย่างเดียว)
- **ทุก Server Action ตรวจสอบสิทธิ์ (role) ของตัวเอง** — Server Action เข้าถึงได้เหมือน public API endpoint การซ่อน UI ไม่ถือเป็นการป้องกัน
- ลำดับสิทธิ์: `admin` > `manager` > `member` > `viewer` การจัดการผู้ใช้ต้องเป็น `admin`
- **Google sign-in ไม่สร้างบัญชีให้อัตโนมัติ** โดยค่าเริ่มต้น — ต้องให้ admin สร้างไว้ก่อน หากต้องการให้สมัครเองได้ ตั้ง `ALLOWED_SIGNUP_DOMAINS` (เช่น `sut.ac.th`) บัญชีที่สมัครเองจะถูกสร้างแบบ **ปิดใช้งาน** รอ admin อนุมัติ
- `NEXT_PUBLIC_SHOW_DEV_TOOLS` ต้องเป็น `false` ใน production (ควบคุมการแสดงคำใบ้บัญชีทดสอบบนหน้า login)

### อัปเกรดรหัสผ่านเดิมที่เป็น plaintext

ชีตที่สร้างไว้ก่อนหน้านี้อาจมีรหัสผ่านเป็น plaintext ซึ่ง **จะล็อกอินไม่ผ่าน** เพราะระบบเทียบด้วย bcrypt เท่านั้น (fail closed) ให้รันครั้งเดียว:

```bash
npm run db:migrate-passwords
```

## Cron / Scheduled jobs

เรียกผ่าน **Authorization header** เท่านั้น (ไม่ใช่ query string ซึ่งจะติดอยู่ใน access log):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron?action=reminders"
```

> **Roadmap — ยังไม่ได้พัฒนา**: `backup`, `recurring_meetings`, `reminders` ปัจจุบันตอบกลับ `501 Not Implemented` ตามจริง (เดิมตอบ success ทั้งที่ไม่ได้ทำอะไร)

## คำสั่งที่ใช้บ่อย

| คำสั่ง | หน้าที่ |
| --- | --- |
| `npm run dev` | รัน dev server |
| `npm run build` | build production |
| `npm run lint` | ตรวจ ESLint |
| `npm test` | รันชุดทดสอบ (vitest) |
| `npm run db:init` | สร้างแท็บ/หัวตาราง และ seed ข้อมูลเริ่มต้น |
| `npm run db:migrate-passwords` | แปลงรหัสผ่าน plaintext เดิมเป็น bcrypt |
