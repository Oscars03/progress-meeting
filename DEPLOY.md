# การ deploy

ทุกการเปลี่ยนแปลงเข้า `master` ผ่าน pull request เท่านั้น แล้วค่อย deploy ขึ้น
Vercel ด้วยมือ — ไม่มี auto-deploy จาก push

**Production:** https://irish-progress.vercel.app
**Vercel project:** `irish-progress` (team `irishlab101-7231s-projects`)

---

## ขั้นตอนเต็ม

### 1. แตกกิ่ง

```bash
git checkout master
git pull --ff-only
git checkout -b ชื่อ-กิ่ง
```

**push เข้า `master` ตรง ๆ ไม่ได้แล้ว** — ตั้งแต่ 20 ก.ย. 2026 GitHub บังคับให้เอง
ด้วย ruleset ชื่อ `master: PR + green CI` (`enforcement: active`, bypass list ว่าง
จึงไม่มีใครข้ามได้ รวมถึงเจ้าของ repo):

| กฎ | ผล |
|---|---|
| `pull_request` | ทุกอย่างเข้า master ต้องผ่าน PR — approvals = 0 เพราะ GitHub ไม่ให้ approve PR ตัวเอง ตั้งเป็น 1 แล้วจะ merge ไม่ได้เลย |
| `required_status_checks` | ต้องผ่าน `lint · types · tests · build` ก่อน |
| `non_fast_forward` | force push ไม่ได้ |
| `deletion` | ลบ master ไม่ได้ |

ก่อนหน้านี้เอกสารตรงนี้เขียนว่า GitHub บังคับไม่ได้เพราะ repo เป็น private บน
บัญชีฟรี — ไม่จริงทั้งสองท่อน repo เป็น public มาตลอด และ ruleset ใช้ได้ฟรีบน
repo สาธารณะ ที่บังคับไม่ได้จริง ๆ คือ "ยังไม่มีใครตั้ง"

> **ถ้าช่อง status check ใน UI หา `lint · types · tests · build` ไม่เจอ**
> เพราะ CI รันเฉพาะ `pull_request` จึงไม่เคยมีประวัติรันบน master ให้ค้นหา
> สั่ง `gh workflow run ci.yml --ref master` หนึ่งครั้งแล้วค่อยกลับมาเลือก

### 2. รันเช็คในเครื่องก่อนเปิด PR

```bash
npm run lint
npm test
npm run build
npx tsc --noEmit
```

เรียง `build` ก่อน `typecheck` เหมือนใน CI เพราะ `tsc` ที่ยังไม่มี generated
globals ของ Next จะฟ้องเรื่องพวกนั้นแทนที่จะฟ้องโค้ดจริง

> **อ่านบรรทัด `Test Files` ไม่ใช่แค่ `Tests`**
> ไฟล์เทสต์ที่ **โหลดไม่ขึ้น** จะรายงานว่า 0 เทสต์ ไม่ใช่เทสต์ที่ fail สรุปจะขึ้นว่า
> `Tests 57 passed` โดยมี `Test Files 1 failed` อยู่บรรทัดบน เคยเกิดขึ้นจริง —
> `auth.test.ts` import พัง เทสต์หายไป 6 ตัวเงียบ ๆ และถูกรายงานว่าเขียว

### 3. เปิด PR

```bash
git push -u origin ชื่อ-กิ่ง
gh pr create --title "..." --body "..."
```

`gh` อยู่ที่ `C:/Program Files/GitHub CLI/gh.exe` — terminal ที่เปิดก่อนติดตั้ง
อาจต้องใช้ path เต็ม

### 4. รอ CI แล้ว**อ่านทุกขั้น**

```bash
gh pr checks <เลข PR>
gh run view --job=<job id>          # ดูทีละขั้น
```

ต้องเห็นครบ **5 ขั้น**: `Install` · `Lint` · `Tests` · `Build` · `Typecheck`

> **เช็คแดงคือรายการ ไม่ใช่พาดหัว**
> เมื่อก่อนขั้นตอนจะหยุดที่ตัวแรกที่พัง รันแดงจึงรายงานปัญหาเดียวและปล่อยที่เหลือไม่รู้
> PR ที่มี lint error 5 จุดเคยถูก merge ด้วยเหตุผลว่า "แค่ lint" — ทั้งที่ tests,
> build, typecheck **ยังไม่ได้รันกับโค้ดนั้นเลย** ตอนนี้ทั้ง 3 ขั้นรันเสมอไม่ว่าขั้นก่อน
> จะพังหรือไม่ เหลือ 2 ขั้นที่ยังกั้นไว้ตั้งใจ: `Install` (ไม่มีมันก็รันอะไรไม่ได้) และ
> `Build` ก่อน `Typecheck`

> **รอให้รันจบจริง ๆ ก่อน merge**
> PR #41 ถูก merge ในนาทีเดียวกับที่ CI ยังรันอยู่ แล้ว CI ก็ fail

### 5. Merge

```bash
gh pr merge <เลข PR> --rebase --delete-branch
```

rebase ทำให้ commit ได้ SHA ใหม่ `git branch -d` จึงบอกว่ากิ่งยัง unmerged —
ยืนยันด้วย `git diff --quiet master <กิ่ง>` ก่อนลบด้วย `-D`

### 6. รีเฟรช changelog — **เป็น PR อีกใบ ไม่ใช่ commit ลง master**

```bash
git checkout master
git pull --ff-only
git checkout -b chore/refresh-changelog
npm run changelog        # อ่าน commit แล้วเขียน src/lib/changelog.generated.ts
git commit -am "chore: refresh the changelog"
git push -u origin chore/refresh-changelog
gh pr create --title "chore: refresh the changelog" --body "..."
```

แล้วรอ CI กับ merge ตามขั้น 4–5 เหมือนกิ่งอื่นทุกประการ ไฟล์ที่ generate ออกมา
ก็เป็นการเปลี่ยนแปลงหนึ่ง กฎในขั้น 1 ไม่ได้ยกเว้นให้ — `df4e0a7` (PR #82) กับ
`95266d7` (PR #86) เข้ามาทางนี้ทั้งคู่

ใช้ `chore:` ตั้งใจ เพื่อไม่ให้ commit นี้กลายเป็นอีกบรรทัดในลิสต์ที่ตัวเองกำลัง
generate

`npm run changelog` สร้างรายการ "มีอะไรใหม่" ในแถบซ้ายจาก commit บน HEAD
เก็บเฉพาะ `feat:` กับ `fix:` และต้อง commit ไฟล์ที่ได้ไปด้วย เพราะ Vercel
clone แบบตื้นจึงอ่านประวัติ commit เองไม่ได้

ข้อความไทยมาจาก trailer บน commit — เขียนบรรทัดนี้ต่อท้าย commit message:

```
Changelog-TH: กดบล็อกสีเขียวแล้วเลือกช่วงประชุมได้เลย
```

ถ้าไม่มี trailer จะใช้ subject ภาษาอังกฤษแทน (หรือเติมคำแปลใน
`TH_BY_SUBJECT` ใน `src/lib/changelog.ts` สำหรับ commit ที่ทำไปแล้ว)
`npm run changelog -- --check` บอกว่าไฟล์ตรงกับประวัติหรือยัง

> **เขียน trailer ตั้งแต่ commit — แก้ตอน merge ไม่ได้**
> `gh pr merge --rebase` เก็บ commit message เดิมทั้งดุ้น ไม่มีจังหวะให้แก้
> (มีเฉพาะ `--squash`) commit ที่ push แล้วต้อง amend + force-push หรือไม่ก็
> ปล่อยไปเติมใน `TH_BY_SUBJECT` ทีหลัง

> **`changelog.test.ts` จะทำให้ PR นี้แดงถ้ามีบรรทัดไหนยังไม่มีไทย**
> เทสต์บังคับว่าทุกบรรทัดที่ `recentChanges()` เอาขึ้นจอต้องมีไทย commit ที่
> merge ไปแล้วโดยไม่มี trailer จึงมาโผล่ตรงนี้ เติมคำแปลใน `TH_BY_SUBJECT`
> ใน PR เดียวกันนี้ (PR #86 แดงด้วยเหตุนี้ — `116bac8` ไม่มี trailer)

### 7. Deploy

```bash
git checkout master
git pull --ff-only
npx vercel --prod --yes
```

ขึ้น `▲ Aliased https://irish-progress.vercel.app` คือสำเร็จ

### 8. ตรวจหลัง deploy

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://irish-progress.vercel.app/login
curl -s https://irish-progress.vercel.app/api/auth/providers   # callback URL ถูกไหม
```

แล้วเปิดหน้าเว็บจริงดูสิ่งที่เพิ่งแก้ **lint/tests/build/typecheck เขียวไม่ได้แปลว่า
ฟีเจอร์ทำงาน** — เคยมีบั๊กจริง 2 ตัวที่ผ่านทั้งสี่อย่างมาได้

---

## เรื่องที่คนมักสะดุด

### master ไม่มีเครื่องหมาย CI — ปกติ

CI รันบน `pull_request` (กับสั่งมือผ่าน `workflow_dispatch`) เท่านั้น commit บน
master หลัง merge จึงไม่มีติ๊กถูก **ไม่ใช่รันพังหรือถูกข้าม** — รันของ PR คือตัวที่นับ

ถ้าอยากเช็ค master เองจริง ๆ สั่งจากแท็บ Actions ได้

### `npx vercel --prod` ตอบ `Not authorized`

ไม่ได้แปลว่ายังไม่ได้ล็อกอิน — `whoami` ยังตอบชื่อได้ปกติตอนที่ deploy พัง
สั่ง link ใหม่แล้วลองอีกครั้ง:

```bash
npx vercel link --yes --project irish-progress --scope irishlab101-7231s-projects
npx vercel --prod --yes
```

`.vercel/` อยู่ใน `.gitignore` เป็นของแต่ละเครื่อง ไม่ได้มากับ clone จึงหลุดจาก
ของจริงได้เงียบ ๆ การ link ใหม่ทั้งเขียน `.vercel/project.json` ให้ถูกและดึง
`VERCEL_OIDC_TOKEN` ใหม่ลง `.env.local` — ครั้งที่เจอจริง ไฟล์เก่าค้าง
`projectName` ไว้เป็นชื่อเดิมของโปรเจกต์ (`progress-meeting`) ส่วน `projectId`
กับ `orgId` ถูกอยู่แล้ว **ยังไม่ทราบว่าสองอย่างนี้อย่างไหนคือสาเหตุ** — link ใหม่
แก้ทั้งคู่พร้อมกัน

> **`orgId` ขึ้นต้นด้วย `team_` เป็นเรื่องปกติ**
> `team_3eK4b0XShm65GNE3pPZfHnjO` **คือ** `irishlab101-7231s-projects` ซึ่งเป็น
> scope ส่วนตัวแบบ hobby — บัญชี hobby ก็ได้ id ขึ้นต้น `team_` เหมือนกัน
> อย่าอ่านว่าเป็นทีมอื่นแล้วไล่แก้ผิดทาง

> **`vercel whoami` พังไม่ได้แปลว่า token เสีย**
> token ที่ผูกกับโปรเจกต์เดียว (`vcp_…`) ไม่มีตัวตนผู้ใช้ `whoami`, `ls`,
> `env ls` จะตอบ `404 User not found` ทั้งที่ `vercel --prod` ใช้ได้ปกติ
> ใช้แบบนี้เวลา deploy จากที่อื่นที่ไม่ใช่เครื่องตัวเอง

### Environment variables

อยู่ 2 ที่ และไม่ sync กันเอง:

| ที่ | ใช้ตอน |
|---|---|
| `.env.local` | รันในเครื่อง |
| Vercel → Settings → Environment Variables | production |

```bash
npx vercel env ls production
npx vercel env update ชื่อตัวแปร production     # แก้ค่าเดิม
npx vercel env add ชื่อตัวแปร production        # เพิ่มใหม่
```

**env ที่แก้แล้วยังไม่มีผลจนกว่าจะ deploy ใหม่**

ตัวที่ต้องมีบน production: `SPREADSHEET_ID` · `SERVICE_ACCOUNT_JSON` ·
`NEXTAUTH_SECRET` · `NEXTAUTH_URL` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` ·
`ALLOWED_SIGNUP_DOMAINS` · `CRON_SECRET` · `LAB_DRIVE_EMAIL`

ไม่บังคับ: `CRON_READ_SECRET` — กุญแจอ่านอย่างเดียวของ `/api/cron`
ขอได้เฉพาะ `open_feedback` นอกนั้นคืน 403 ใช้กับ automation ที่รันนอกแล็บ
แทนการยก `CRON_SECRET` ตัวเต็มให้ ต้องตั้งเป็นคนละค่ากับ `CRON_SECRET`

### ถ้าเปลี่ยนโดเมน

3 อย่างนี้ลืมแล้วล็อกอินพัง และ**ต้องทำตามลำดับ**:

1. **Google Cloud Console ก่อน** — เพิ่ม (ไม่ต้องลบของเดิม) ที่
   [Credentials](https://console.cloud.google.com/apis/credentials?project=564538306798)
   - Authorized JavaScript origins: `https://โดเมนใหม่`
   - Authorized redirect URIs: `https://โดเมนใหม่/api/auth/callback/google`
2. เปลี่ยนโดเมน / ชื่อโปรเจกต์ใน Vercel
3. `npx vercel env update NEXTAUTH_URL production` → `https://โดเมนใหม่` แล้ว deploy

ยืนยันว่า `NEXTAUTH_URL` มีผลจริงด้วย `/api/auth/providers` — callback ที่คืนมา
ต้องตรงกับที่ใส่ใน Google Console เป๊ะ

การเชื่อม Google Calendar / Drive ของสมาชิก**ไม่หลุด** เพราะ refresh token
ไม่ผูกกับโดเมน

### Schema ของฐานข้อมูล

ถ้า PR แตะ `SCHEMAS` ใน `src/lib/db/schema.ts` ต้องรัน migration ด้วยมือ —
**ไม่มีอะไรรันให้อัตโนมัติตอน deploy**

```bash
npm run db:migrate-schema -- --dry-run    # ดูแผนก่อน
npm run db:migrate-schema
```

อย่าใช้ `db:init` กับชีตที่มีข้อมูลแล้ว มันเขียนแถว header ทับที่เดิมโดยไม่ขยับ
แถวข้อมูล ค่าทุกตัวจะเลื่อนหลุดจาก header ของมัน (ตอนนี้มันปฏิเสธที่จะรันถ้ามีแถว
ข้อมูลอยู่)

---

## ย้อนกลับ (rollback)

**ทางที่เร็วที่สุด** — ชี้ alias กลับไป deployment เดิม ไม่ต้อง build ใหม่:

```bash
npx vercel ls                                   # หา deployment ก่อนหน้า
npx vercel alias set <deployment-url> irish-progress.vercel.app
```

**ถ้าโค้ดผิดจริง** — revert commit แล้วเข้ากระบวนการ PR ตามปกติ:

```bash
git revert <sha>
```

> ระวัง: **ข้อมูลในสเปรดชีตย้อนกลับไม่ได้ด้วยวิธีนี้** ถ้า deploy ที่พังเขียนแถวผิด
> ลงไปแล้ว การชี้ alias กลับแก้แค่โค้ด ข้อมูลต้องซ่อมแยกต่างหาก — ค่าเดิมหาได้จาก
> ตาราง `audit_log` ซึ่งเก็บ `old` ของทุกการเปลี่ยนแปลงไว้

---

## สรุปสั้น

```bash
git checkout -b my-change
# ...แก้โค้ด... เขียน Changelog-TH: ต่อท้าย commit message ตั้งแต่ตอนนี้
npm run lint && npm test && npm run build && npx tsc --noEmit
git push -u origin my-change
gh pr create --title "..." --body "..."
gh pr checks <n>                                # รอครบ 5 ขั้น แล้วอ่านให้ครบ
gh pr merge <n> --rebase --delete-branch

git checkout master && git pull --ff-only       # changelog เป็น PR อีกใบ
git checkout -b chore/refresh-changelog
npm run changelog && git commit -am "chore: refresh the changelog"
git push -u origin chore/refresh-changelog
gh pr create --title "chore: refresh the changelog" --body "..."
gh pr checks <n> && gh pr merge <n> --rebase --delete-branch

git checkout master && git pull --ff-only       # แล้วค่อย deploy
npx vercel --prod --yes
```
