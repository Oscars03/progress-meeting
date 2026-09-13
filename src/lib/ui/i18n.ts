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
