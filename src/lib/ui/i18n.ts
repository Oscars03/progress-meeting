/**
 * Minimal two-locale dictionary.
 *
 * A full i18n library is not worth its weight for two languages and a fixed
 * string set. Keys are grouped by surface. A missing English string falls back
 * to Thai rather than rendering the key -- an untranslated label is a smaller
 * problem than "nav.tasks" in front of a user.
 */

export const LOCALES = ['th', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DICT = {
  th: {
    'app.title': 'Weekly Progress',
    'app.name': 'Weekly Progress Meeting',
    'app.tagline': 'ระบบจัดการการประชุมความคืบหน้ารายสัปดาห์',
    'nav.dashboard': 'ภาพรวม',
    'nav.tasks': 'งาน',
    'nav.meetings': 'ปฏิทิน',
    'nav.report': 'รายงาน',
    'nav.settings': 'การตั้งค่า',
    'nav.signOut': 'ออกจากระบบ',
    'nav.collapse': 'ยุบแถบเมนู',
    'nav.expand': 'ขยายแถบเมนู',

    'theme.toLight': 'เปลี่ยนเป็นโหมดสว่าง',
    'theme.toDark': 'เปลี่ยนเป็นโหมดมืด',
    'locale.label': 'ภาษา',

    'login.title': 'เข้าสู่ระบบ',
    'login.email': 'อีเมล',
    'login.password': 'รหัสผ่าน',
    'login.submit': 'เข้าสู่ระบบ',
    'login.submitting': 'กำลังเข้าสู่ระบบ...',
    'login.google': 'เข้าสู่ระบบด้วย Google',
    'login.or': 'หรือ',
    'login.noAccount': 'ยังไม่มีบัญชี?',
    'login.hasAccount': 'มีบัญชีอยู่แล้ว?',
    'login.failed': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'login.error': 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง',

    'register.title': 'สมัครสมาชิก',
    'register.name': 'ชื่อ-นามสกุล',
    'register.submit': 'สมัครสมาชิก',
    'register.submitting': 'กำลังส่งคำขอ...',
    'register.domainHint': 'รับเฉพาะโดเมน:',
    'register.passwordHint': 'อย่างน้อย {n} ตัวอักษร',
    'register.approvalNote': 'บัญชีใหม่ต้องรอผู้ดูแลระบบอนุมัติก่อนจึงจะเข้าใช้งานได้',
    'register.failed': 'สมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',

    'dashboard.title': 'ภาพรวม (Dashboard)',
    'dashboard.total': 'งานทั้งหมด',
    'dashboard.open': 'งานที่ยังไม่เสร็จ',
    'dashboard.overdue': 'งานที่เกินกำหนด',

    'avail.title': 'ตารางเวลาว่างรายสัปดาห์',
    'avail.subtitle': 'รวมเวลาว่างของทุกคนให้อัตโนมัติ ช่องละ 1 ชั่วโมง',
    'avail.prevWeek': 'สัปดาห์ก่อน',
    'avail.thisWeek': 'สัปดาห์นี้',
    'avail.nextWeek': 'สัปดาห์ถัดไป',
    'avail.legendAllFree': 'ทุกคนว่าง',
    'avail.legendSomeBusy': 'มีคนไม่ว่าง',
    'avail.legendIncomplete': 'ยังไม่ทราบสถานะบางคน',
    'avail.coverage': 'อ่าน Google Calendar ได้ {read} จาก {total} คน — คนที่เหลือระบบรู้แค่ช่วงที่มีประชุมอยู่ในระบบ จึงยังยืนยันไม่ได้ว่าว่าง',
    'avail.coverageAll': 'อ่าน Google Calendar ได้ครบทั้ง {total} คน',
    'avail.time': 'เวลา',
    'avail.cellTitle': '{when} · ว่าง {free} · ไม่ว่าง {busy} · ไม่ทราบ {unknown}',
    'avail.pickHint': 'กดช่องเวลาเพื่อดูว่าใครว่างหรือไม่ว่าง',
    'avail.free': 'ว่าง',
    'avail.busy': 'ไม่ว่าง',
    'avail.unknown': 'ไม่ทราบสถานะ',
    'avail.nobody': 'ไม่มี',
    'avail.ask': 'ขอให้ทุกคนยืนยันช่วงนี้',
    'avail.asking': 'กำลังสร้างคำขอ...',
    'avail.askConfirm': 'สร้างโพลช่วง {when} ให้ทุกคนตอบยืนยัน?',
    'avail.askNotAllFree': 'ช่วง {when} มีคนไม่ว่างหรือยังไม่ทราบสถานะ ยังจะส่งให้ทุกคนยืนยันอยู่ไหม?',
    'avail.pollTitle': 'ยืนยันเวลาประชุม {when}',
    'avail.managerOnly': 'ต้องมีสิทธิ์ระดับ manager ขึ้นไปจึงจะส่งคำขอยืนยันได้',
    'avail.past': 'ช่วงเวลานี้ผ่านไปแล้ว',
    'avail.loading': 'กำลังรวมเวลาว่าง...',
    'avail.failed': 'โหลดตารางเวลาว่างไม่สำเร็จ',
  },
  en: {
    'app.title': 'Weekly Progress',
    'app.name': 'Weekly Progress Meeting',
    'app.tagline': 'Plan meetings, report progress, follow up',
    'nav.dashboard': 'Dashboard',
    'nav.tasks': 'Tasks',
    'nav.meetings': 'Calendar',
    'nav.report': 'Report',
    'nav.settings': 'Settings',
    'nav.signOut': 'Sign out',
    'nav.collapse': 'Collapse sidebar',
    'nav.expand': 'Expand sidebar',

    'theme.toLight': 'Switch to light mode',
    'theme.toDark': 'Switch to dark mode',
    'locale.label': 'Language',

    'login.title': 'Sign in',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.submitting': 'Signing in...',
    'login.google': 'Sign in with Google',
    'login.or': 'or',
    'login.noAccount': "Don't have an account?",
    'login.hasAccount': 'Already have an account?',
    'login.failed': 'Incorrect email or password',
    'login.error': 'Something went wrong signing in. Please try again.',

    'register.title': 'Create account',
    'register.name': 'Full name',
    'register.submit': 'Create account',
    'register.submitting': 'Sending request...',
    'register.domainHint': 'Accepted domains:',
    'register.passwordHint': 'At least {n} characters',
    'register.approvalNote': 'New accounts need an administrator to approve them before sign-in.',
    'register.failed': 'Could not create the account. Please try again.',

    'dashboard.title': 'Dashboard',
    'dashboard.total': 'All tasks',
    'dashboard.open': 'Open tasks',
    'dashboard.overdue': 'Overdue tasks',

    'avail.title': 'Weekly availability',
    'avail.subtitle': "Everyone's free time, gathered automatically, one hour per cell",
    'avail.prevWeek': 'Previous week',
    'avail.thisWeek': 'This week',
    'avail.nextWeek': 'Next week',
    'avail.legendAllFree': 'Everyone free',
    'avail.legendSomeBusy': 'Someone busy',
    'avail.legendIncomplete': 'Some people unknown',
    'avail.coverage': "Google Calendar read for {read} of {total} people. For the rest, only meetings in this app are known, so they can't be confirmed free.",
    'avail.coverageAll': 'Google Calendar read for all {total} people',
    'avail.time': 'Time',
    'avail.cellTitle': '{when} · free {free} · busy {busy} · unknown {unknown}',
    'avail.pickHint': 'Select a time to see who is free or busy',
    'avail.free': 'Free',
    'avail.busy': 'Busy',
    'avail.unknown': 'Unknown',
    'avail.nobody': 'None',
    'avail.ask': 'Ask everyone to confirm this time',
    'avail.asking': 'Creating request...',
    'avail.askConfirm': 'Create a poll for {when} for everyone to confirm?',
    'avail.askNotAllFree': 'Not everyone is known to be free at {when}. Ask everyone anyway?',
    'avail.pollTitle': 'Confirm meeting time {when}',
    'avail.managerOnly': 'Manager rank or above is needed to ask for confirmation',
    'avail.past': 'This time has already passed',
    'avail.loading': 'Gathering availability...',
    'avail.failed': 'Could not load availability',
  },
} as const;

export type TranslationKey = keyof (typeof DICT)['th'];

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const table = DICT[locale] as Record<string, string>;
  const raw = table[key] ?? (DICT.th as Record<string, string>)[key] ?? key;
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (out, [name, value]) => out.replaceAll(`{${name}}`, String(value)),
    raw
  );
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
