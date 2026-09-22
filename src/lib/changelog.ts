/**
 * What changed, in the words of somebody who uses the app.
 *
 * The lab finds out what is new by noticing it, which means a change that
 * moves a familiar button reads as a fault until somebody explains it. This
 * is the explanation, kept where it is read rather than in a commit message
 * nobody in the lab will open.
 *
 * The list itself is no longer written here: `scripts/build-changelog.ts`
 * reads it off the commits on master (`npm run changelog`), keeping `feat:`
 * and `fix:` and dropping everything the lab cannot see. A hand-kept list was
 * accurate on the day somebody remembered and stale from then on.
 *
 * What stays by hand is the Thai. A commit subject is written for whoever
 * reads the diff; the sidebar is read by the lab. Two ways to supply it:
 *
 * - `Changelog-TH: <one line>` as a trailer on the commit. Preferred -- the
 *   sentence is written once, by whoever knew what they were changing.
 * - `TH_BY_SUBJECT` below, for commits already made. It is keyed by the
 *   English subject, so it is a translation table and not a second list to
 *   keep in step.
 *
 * `APP_VERSION` is the date of the newest change (YYYY.MM.DD), because the
 * question it answers is "is what I am looking at today's app", which a
 * semantic version does not. Several releases in a day share it; the list is
 * what distinguishes them.
 */

import { GENERATED_CHANGELOG, GENERATED_VERSION } from './changelog.generated';

export type ChangeKind = 'new' | 'fix';

export type ChangeEntry = {
  /** ISO date, for grouping and for the dates shown beside each line. */
  date: string;
  kind: ChangeKind;
  /** One line. Long enough to recognise, short enough to scan. */
  th: string;
  en: string;
};

export const APP_VERSION = GENERATED_VERSION;

/**
 * Thai for commits written before the `Changelog-TH:` trailer existed.
 *
 * Only worth filling in for changes recent enough to still be on screen; the
 * older entries scroll off and nobody will miss them.
 */
const TH_BY_SUBJECT: Record<string, string> = {
  // 2026-09-22 -- shipped without a Changelog-TH trailer.
  'Android widget in three steps with Web Image Widget; KWGT in seven':
    'วิดเจ็ต Android ตั้งง่ายขึ้น — ใช้แอป Web Image Widget แค่ 3 ขั้น (แบบ KWGT เหลือ 7 ขั้น)',
  "the login page shows the lab's mark and name": 'หน้าเข้าสู่ระบบมีโลโก้และชื่อแล็บแล้ว',
  'sidebar links stay compact; Settings sub-menu opens on every visit':
    'เมนูด้านซ้ายไม่ห่างกันแล้ว และเมนูย่อยการตั้งค่าเปิดเองทุกครั้งที่เข้า',
  'Settings becomes five pages with a sub-menu in the sidebar': 'การตั้งค่าแยกเป็น 5 หน้า เลือกได้จากเมนูย่อยในแถบซ้าย',
  'pages use the full width; users listed by role, one colour each':
    'หน้าต่าง ๆ กว้างเต็มจอ และรายชื่อผู้ใช้เรียงตามสิทธิ์ แยกสีแต่ละสิทธิ์',
  'tapping the Android widget opens the site and refreshes it': 'แตะวิดเจ็ต Android แล้วเปิดเว็บและรีเฟรชข้อมูลทันที',
  "Android steps follow KWGT's real editor, screen by screen": 'ภาพขั้นตอน Android ตรงกับหน้าจอ KWGT จริงทุกขั้น',
  "Android set-up shows KWGT's Explore screen and its + Create button": 'เพิ่มขั้นตอนหน้า Explore และปุ่ม + Create ของ KWGT',
  'widget set-up links to the App Store and Play Store again': 'มีปุ่มดาวน์โหลดแอปสำหรับตั้งวิดเจ็ตกลับมาแล้ว',
  'widget becomes a four-tile dashboard; Settings shows every step':
    'วิดเจ็ตเป็นแดชบอร์ด 4 ช่อง พร้อมภาพทุกขั้นตอนในหน้าการตั้งค่า',
  'phone widget for iPhone and Android':
    'วิดเจ็ตบนมือถือ iPhone และ Android — ดูประชุม ลำดับนำเสนอ งาน และโพลได้จากหน้าจอโฮม',
  'serve /favicon.ico so clients that skip <link rel="icon"> stop getting 404':
    'ไอคอนเว็บขึ้นครบทุกเบราว์เซอร์และในพรีวิวลิงก์',
  'a signed-out visit to a page redirects without logging an error':
    'เปิดหน้าตอนยังไม่ได้เข้าสู่ระบบ จะพาไปหน้าเข้าสู่ระบบอย่างเรียบร้อย',
  'Google sign-in no longer logs a url.parse() deprecation as an error':
    'เข้าสู่ระบบด้วย Google ไม่ทิ้งคำเตือนไว้ใน log ของระบบแล้ว',
  "match branches with a slash -- '*' stops at '/', '**' does not":
    'ไม่สร้างเว็บทดลองของกิ่งอื่นอีก เหลือเฉพาะเว็บจริง',

  "the what's-new panel folds into the days things shipped":
    'แถบ "มีอะไรใหม่" จัดกลุ่มตามวัน กดเปิดดูย้อนหลังได้ทีละวัน',
  'put back the 33 changelog entries a shallow clone dropped':
    'รายการ "มีอะไรใหม่" ที่หายไป 33 บรรทัดกลับมาครบแล้ว',
  'the cron endpoint can hand out the open feedback':
    'ดึงรายการข้อเสนอแนะที่ยังไม่ปิดผ่าน /api/cron ได้ สำหรับให้ automation อ่านไปสรุป',
  'the sidebar says which version this is, and holds its footer':
    'แถบซ้ายบอกเวอร์ชันและมีรายการสิ่งที่เปลี่ยน ปุ่มล่างไม่หลุดจอบนหน้าจอเตี้ย',
  'an admin can grant one ability to one person':
    'ตั้งสิทธิ์รายคนได้ในหน้าตั้งค่า โดยไม่ต้องเปลี่ยนบทบาท',
  'an empty calendar means free, and the advisors are not polled':
    'ช่วงที่ไม่มีใครกรอกถือว่าว่าง และโพลไม่รออาจารย์ตอบ',
  'the week says who is arranging it, and a block opens in a dialog':
    'แถบสัปดาห์บอกผู้ดูแลของสัปดาห์นั้น และรายละเอียดช่วงเวลาเด้งเป็นหน้าต่าง',
  'a free block opens into the hours you can actually book':
    'กดบล็อกสีเขียวแล้วเลือกช่วงประชุมได้เลย พร้อมเลือกความยาว 30 นาที – 2 ชม.',
  'the availability grid says free, busy or booked, in blocks':
    'ตารางเวลาว่างรวมช่วงที่เหมือนกันเป็นบล็อกเดียว เหลือแค่ว่าง/ไม่ว่าง/นัดแล้ว',
  'an advisor can take back work as well as set it':
    'อาจารย์ลบงานของคนอื่นได้ เช่นเดียวกับที่สั่งงานและแก้งานได้',
  'a meeting stops announcing an hour it is no longer at':
    'ชื่อการประชุมไม่บอกเวลาซ้ำอีก เวลาที่เลื่อนแล้วจะไม่ค้างชื่อเดิม',
  'an advisor directs the work and no longer runs the week':
    'อาจารย์ดูแลเรื่องงาน ส่วนการจัดสัปดาห์เป็นของผู้รับผิดชอบสัปดาห์นั้น',
  'scrolling the week no longer paints a time selection':
    'เลื่อนหน้าจอบนปฏิทินไม่กลายเป็นการเลือกเวลาอีกต่อไป',
  "a tap opens somebody else's block, as a click already did":
    'แตะดูช่วงเวลาของคนอื่นบนมือถือได้แล้ว',
  'marking yourself busy works again over an hour somebody else has taken':
    'ลากทับช่วงของคนอื่นเพื่อเพิ่มเวลาไม่ว่างของตัวเองได้แล้ว',
  'the advisor arranges the running order, and the order says who did':
    'ลำดับนำเสนอบอกว่าใครเป็นคนจัด',
};

/** The generated list, with the Thai filled in where we have it. */
export const CHANGELOG: ChangeEntry[] = GENERATED_CHANGELOG.map((entry) => ({
  ...entry,
  // A trailer on the commit beats the table: `th` differs from `en` only when
  // the commit carried one.
  th: entry.th !== entry.en ? entry.th : TH_BY_SUBJECT[entry.en] ?? entry.en,
}));

/** The few most recent lines -- the list is for recognising, not studying. */
export function recentChanges(limit = 8): ChangeEntry[] {
  return CHANGELOG.slice(0, limit);
}

/** One release day, with everything that shipped on it. */
export type ChangeDay = {
  /** ISO date, shared by every entry in `entries`. */
  date: string;
  entries: ChangeEntry[];
};

/**
 * The same list folded into the days it shipped on.
 *
 * A flat list of eight lines showed a week at best and hid the rest. Days are
 * the unit people remember a release by ("the one from Friday"), and folding
 * them lets the panel offer months of history without becoming a wall of text
 * -- the sidebar opens the newest day and leaves the others shut.
 *
 * `CHANGELOG` is already newest-first and every entry carries a date, so a
 * single pass keeps both the day order and the order within a day.
 */
export function changesByDay(dayLimit = 12): ChangeDay[] {
  const days: ChangeDay[] = [];

  for (const entry of CHANGELOG) {
    const last = days[days.length - 1];
    if (last?.date === entry.date) {
      last.entries.push(entry);
      continue;
    }
    if (days.length === dayLimit) break;
    days.push({ date: entry.date, entries: [entry] });
  }

  return days;
}
