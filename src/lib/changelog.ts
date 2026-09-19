/**
 * What changed, in the words of somebody who uses the app.
 *
 * The lab finds out what is new by noticing it, which means a change that
 * moves a familiar button reads as a fault until somebody explains it. This
 * is the explanation, kept where it is read rather than in a commit message
 * nobody in the lab will open.
 *
 * One line per change, newest first, and no more detail than that: the point
 * is to recognise something you have already seen, not to study a release.
 * Entries are written by hand and deliberately short -- a generated list of
 * commit subjects would be longer and say less.
 *
 * `APP_VERSION` is date-based (YYYY.MM.DD) because the question it answers is
 * "is what I am looking at today's app", which a semantic version does not.
 * Several releases in a day share it; the list below is what distinguishes
 * them.
 */

export const APP_VERSION = '2026.09.19';

export type ChangeKind = 'new' | 'fix';

export type ChangeEntry = {
  /** ISO date, for grouping and for the dates shown beside each line. */
  date: string;
  kind: ChangeKind;
  /** One line, Thai. Long enough to recognise, short enough to scan. */
  th: string;
  en: string;
};

export const CHANGELOG: ChangeEntry[] = [
  {
    date: '2026-09-19',
    kind: 'new',
    th: 'ตั้งสิทธิ์รายคนได้ในหน้าตั้งค่า โดยไม่ต้องเปลี่ยนบทบาท',
    en: 'Grant an ability to one person in Settings, without changing their role',
  },
  {
    date: '2026-09-19',
    kind: 'new',
    th: 'ตารางเวลาว่างรวมช่วงที่เหมือนกันเป็นบล็อกเดียว เหลือแค่ว่าง/ไม่ว่าง/นัดแล้ว',
    en: 'The availability grid merges equal stretches: free, busy or booked',
  },
  {
    date: '2026-09-19',
    kind: 'new',
    th: 'กดบล็อกสีเขียวแล้วเลือกช่วงประชุมได้เลย พร้อมเลือกความยาว 30 นาที – 2 ชม.',
    en: 'A free block opens into the slots you can book, 30 min to 2 hr',
  },
  {
    date: '2026-09-19',
    kind: 'new',
    th: 'แถบสัปดาห์บอกผู้ดูแลของสัปดาห์นั้น และรายละเอียดช่วงเวลาเด้งเป็นหน้าต่างแทนการเลื่อนลง',
    en: "The week bar names its lead, and a block's detail opens as a dialog",
  },
  {
    date: '2026-09-19',
    kind: 'new',
    th: 'ช่วงที่ไม่มีใครกรอกถือว่าว่าง และโพลไม่รออาจารย์ตอบ',
    en: 'An empty calendar means free, and a poll no longer waits on advisors',
  },
  {
    date: '2026-09-19',
    kind: 'fix',
    th: 'ชื่อการประชุมไม่บอกเวลาซ้ำอีก เวลาที่เลื่อนแล้วจะไม่ค้างชื่อเดิม',
    en: 'A meeting no longer names a time it has been moved away from',
  },
  {
    date: '2026-09-19',
    kind: 'new',
    th: 'แก้เวลาประชุมแล้วเลือกได้ว่าจะแจ้งอีเมลหรือไม่',
    en: 'Rescheduling asks whether to email everyone',
  },
  {
    date: '2026-09-19',
    kind: 'fix',
    th: 'ลากทับช่วงของคนอื่นในปฏิทินเพื่อเพิ่มเวลาไม่ว่างได้แล้ว และเลื่อนหน้าจอไม่กลายเป็นการเลือกเวลา',
    en: "Dragging over someone else's block works again, and scrolling is not a selection",
  },
  {
    date: '2026-09-18',
    kind: 'new',
    th: 'อาจารย์ดูลำดับนำเสนอและปฏิทินได้ ส่วนการจัดลำดับเป็นของผู้รับผิดชอบสัปดาห์',
    en: 'Advisors read the running order; arranging it belongs to the week lead',
  },
  {
    date: '2026-09-18',
    kind: 'new',
    th: 'หน้าแรกแสดงลำดับนำเสนอ งานที่ทำอยู่ และปุ่มหาเวลาว่างของผู้รับผิดชอบ',
    en: 'The dashboard shows your turn, your work, and the lead controls',
  },
];

/** The few most recent lines -- the list is for recognising, not studying. */
export function recentChanges(limit = 8): ChangeEntry[] {
  return CHANGELOG.slice(0, limit);
}
