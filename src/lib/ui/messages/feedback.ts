import { defineMessages } from './define';

/** Telling whoever runs the lab what you think of the app. */
export const feedback = defineMessages({
  th: {
    'nav.feedback': 'ข้อเสนอแนะ',

    'feedback.title': 'ข้อเสนอแนะ',
    'feedback.memberHint': 'บอกสิ่งที่ติดขัด หรือสิ่งที่อยากให้มี ผู้ดูแลระบบจะเห็นข้อความของคุณ',
    'feedback.adminHint': 'ข้อเสนอแนะทั้งหมดจากสมาชิกในแล็บ',

    'feedback.writeTitle': 'เขียนถึงผู้ดูแลระบบ',
    'feedback.writeHint': 'เขียนสั้นๆ ได้ ไม่ต้องเป็นทางการ',
    'feedback.placeholder': 'เช่น ตอนกดยืนยันเวลาแล้วไม่มีอะไรเกิดขึ้น',
    'feedback.category': 'ประเภท',
    'feedback.category.problem': 'มีปัญหา',
    'feedback.category.idea': 'อยากให้เพิ่ม',
    'feedback.category.other': 'อื่นๆ',
    'feedback.send': 'ส่งข้อเสนอแนะ',
    'feedback.thanks': 'ส่งแล้ว ขอบคุณครับ',

    'feedback.openHeading': 'ยังไม่ได้จัดการ ({n})',
    'feedback.doneHeading': 'จัดการแล้ว ({n})',
    'feedback.nothingOpen': 'ไม่มีรายการที่ยังค้างอยู่',
    'feedback.noneYetMine': 'คุณยังไม่ได้ส่งข้อเสนอแนะ',
    'feedback.noneYetAdmin': 'ยังไม่มีใครส่งข้อเสนอแนะเข้ามา',
    'feedback.done': 'จัดการแล้ว',
    'feedback.markDone': 'ทำเครื่องหมายว่าจัดการแล้ว',
    'feedback.reopen': 'เอากลับมาที่ค้างอยู่',

    'feedback.error.empty': 'กรุณาเขียนข้อความก่อนส่ง',
    'feedback.error.tooLong': 'ข้อความยาวเกินไป (ไม่เกิน {max} ตัวอักษร)',

    'dashboard.feedbackWaiting': 'มีข้อเสนอแนะรอการจัดการ',
    'dashboard.feedbackWaitingHint': 'สมาชิกส่งเข้ามาและยังไม่ได้ตอบรับ',
    'dashboard.feedbackOpen': 'ดูทั้งหมด',
  },
  en: {
    'nav.feedback': 'Feedback',

    'feedback.title': 'Feedback',
    'feedback.memberHint':
      'Tell us what is getting in the way, or what you wish the app did. An admin reads it.',
    'feedback.adminHint': 'Everything the lab has sent in.',

    'feedback.writeTitle': 'Write to the admins',
    'feedback.writeHint': 'Short is fine. It does not have to be formal.',
    'feedback.placeholder': 'e.g. nothing happens when I confirm a time',
    'feedback.category': 'Kind',
    'feedback.category.problem': 'Something is broken',
    'feedback.category.idea': 'I wish it did',
    'feedback.category.other': 'Something else',
    'feedback.send': 'Send',
    'feedback.thanks': 'Sent — thank you.',

    'feedback.openHeading': 'Not dealt with yet ({n})',
    'feedback.doneHeading': 'Dealt with ({n})',
    'feedback.nothingOpen': 'Nothing outstanding.',
    'feedback.noneYetMine': 'You have not sent anything yet.',
    'feedback.noneYetAdmin': 'Nobody has sent anything yet.',
    'feedback.done': 'Done',
    'feedback.markDone': 'Mark as dealt with',
    'feedback.reopen': 'Move back to outstanding',

    'feedback.error.empty': 'Write something first.',
    'feedback.error.tooLong': 'That is too long ({max} characters at most).',

    'dashboard.feedbackWaiting': 'Feedback waiting',
    'dashboard.feedbackWaitingHint': 'Sent in by members and not yet answered',
    'dashboard.feedbackOpen': 'See all',
  },
});
