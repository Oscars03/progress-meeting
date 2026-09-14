import { defineMessages } from './define';

/** Colouring and labelling the hours somebody blocks out. */
export const events = defineMessages({
  th: {
    'events.category': 'ประเภท',
    'events.category.teaching': 'สอน',
    'events.category.study': 'เรียน',
    'events.category.meeting': 'ประชุม',
    'events.category.personal': 'ส่วนตัว',

    'events.color': 'สี',
    'events.colorAuto': 'ใช้สีตามประเภท',

    'events.editTitle': 'แก้ไขช่วงเวลาที่ไม่ว่าง',
  },
  en: {
    'events.category': 'Kind',
    'events.category.teaching': 'Teaching',
    'events.category.study': 'Study',
    'events.category.meeting': 'Meeting',
    'events.category.personal': 'Personal',

    'events.color': 'Colour',
    'events.colorAuto': 'Use the kind’s colour',

    'events.editTitle': 'Edit these hours',
  },
});
