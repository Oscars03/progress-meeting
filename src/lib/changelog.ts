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
