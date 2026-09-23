import { defineMessages } from './define';

/** Telling whoever runs the lab what you think of the app. */
export const feedback = defineMessages({
  th: {
    'nav.feedback': 'ข้อเสนอแนะ',

    'feedback.title': 'ข้อเสนอแนะ',
    'feedback.memberHint': 'บอกสิ่งที่ติดขัด หรือสิ่งที่อยากให้มี ผู้ดูแลระบบจะเห็นข้อความของคุณ',
    'feedback.adminHint': 'ข้อเสนอแนะทั้งหมดจากสมาชิกในแล็บ',

    'feedback.writeTitle': 'เขียนถึงผู้ดูแลระบบ',
    'feedback.placeholder': 'เช่น ตอนกดยืนยันเวลาแล้วไม่มีอะไรเกิดขึ้น',
    'feedback.category': 'ประเภท',
    'feedback.category.problem': 'มีปัญหา',
    'feedback.category.idea': 'อยากให้เพิ่ม',
    'feedback.category.other': 'อื่นๆ',
    'feedback.send': 'ส่งข้อเสนอแนะ',
    'feedback.thanks': 'ส่งแล้ว ขอบคุณครับ',
    'feedback.addImage': '+ แนบรูปภาพ',
    'feedback.removeImage': 'เอารูปออก',

    'uploads.error.type': 'แนบได้เฉพาะไฟล์รูปภาพ (PNG, JPEG, WebP, GIF)',
    'uploads.error.tooBig': 'ไฟล์ใหญ่เกินไป แนบได้ไม่เกิน 5MB',
    'uploads.error.empty': 'ไฟล์นี้ว่างเปล่า',

    'drive.title': 'ที่เก็บไฟล์ของแล็บ (Google Drive)',
    'drive.subtitle': 'รูปที่แนบมากับข้อเสนอแนะจะถูกเก็บไว้ใน Drive ของบัญชีแล็บ ไม่ได้แชร์ให้ใครนอกระบบ',
    'drive.account': 'บัญชีที่ใช้เก็บไฟล์:',
    'drive.connected': 'เชื่อมต่อแล้ว — แนบรูปได้',
    'drive.notConnected': 'ยังไม่ได้เชื่อมต่อ ตอนนี้จึงยังแนบรูปไม่ได้',
    'drive.broke': 'การเชื่อมต่อใช้ไม่ได้แล้ว ต้องเชื่อมต่อใหม่',
    'drive.connect': 'เชื่อมต่อ Drive ของแล็บ',
    'drive.reconnect': 'เชื่อมต่อใหม่',
    'drive.chooseAccountHint': 'Google จะให้เลือกบัญชี — ต้องเลือกบัญชีแล็บตามที่ระบุไว้ข้างบน',
    'drive.noAccountConfigured': 'ยังไม่ได้ตั้งค่า LAB_DRIVE_EMAIL จึงยังไม่รู้ว่าจะเก็บไฟล์ไว้ที่บัญชีไหน',
    'drive.notConnectedError': 'ยังไม่ได้เชื่อมต่อ Drive ของแล็บ จึงแนบรูปไม่ได้ (ผู้ดูแลระบบตั้งค่าได้ที่หน้าการตั้งค่า)',

    'feedback.openHeading': 'ยังไม่ได้จัดการ ({n})',
    'feedback.doneHeading': 'จัดการแล้ว ({n})',
    'feedback.nothingOpen': 'ไม่มีรายการที่ยังค้างอยู่',
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
    'feedback.placeholder': 'e.g. nothing happens when I confirm a time',
    'feedback.category': 'Kind',
    'feedback.category.problem': 'Something is broken',
    'feedback.category.idea': 'I wish it did',
    'feedback.category.other': 'Something else',
    'feedback.send': 'Send',
    'feedback.thanks': 'Sent — thank you.',
    'feedback.addImage': '+ Attach a picture',
    'feedback.removeImage': 'Remove picture',

    'uploads.error.type': 'Only images can be attached (PNG, JPEG, WebP, GIF)',
    'uploads.error.tooBig': 'That file is too large — 5MB is the limit',
    'uploads.error.empty': 'That file is empty',

    'drive.title': "The lab's file storage (Google Drive)",
    'drive.subtitle':
      "Pictures sent with feedback are kept on the lab account's Drive. They are not shared outside the app.",
    'drive.account': 'Files are kept on:',
    'drive.connected': 'Connected — pictures can be attached.',
    'drive.notConnected': 'Not connected, so pictures cannot be attached yet.',
    'drive.broke': 'This connection has stopped working and needs reconnecting.',
    'drive.connect': "Connect the lab's Drive",
    'drive.reconnect': 'Reconnect',
    'drive.chooseAccountHint':
      'Google will ask which account to use — choose the lab account named above.',
    'drive.noAccountConfigured':
      'LAB_DRIVE_EMAIL is not set, so there is no account to keep files on yet.',
    'drive.notConnectedError':
      "The lab's Drive is not connected, so a picture cannot be attached. An admin can connect it in Settings.",

    'feedback.openHeading': 'Not dealt with yet ({n})',
    'feedback.doneHeading': 'Dealt with ({n})',
    'feedback.nothingOpen': 'Nothing outstanding.',
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
