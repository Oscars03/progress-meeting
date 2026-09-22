import type { WidgetSummary } from './widget-summary';

/**
 * Made-up data for the preview in Settings: every tile filled in, so the
 * picture shows what each one does. Not anybody's real meeting -- the preview
 * is the same for everyone, and says so under it.
 */
export const SAMPLE_SUMMARY: WidgetSummary = {
  generatedAt: '2026-09-22T05:00:00.000Z',
  meeting: {
    title: 'Progress meeting',
    startAt: '2026-09-24T06:30:00.000Z',
    when: 'พฤ. 24 ก.ย. 13:30',
    time: '13:30–15:00',
    location: 'ห้อง 401',
    daysAway: 2,
  },
  presentations: [
    { position: 1, name: 'สมชาย', topics: ['วิเคราะห์ข้อมูล'], isMe: false },
    { position: 2, name: 'วิภา', topics: ['ผลการทดลองรอบที่ 2'], isMe: true },
    { position: 3, name: 'มานี', topics: ['ทบทวนวรรณกรรม'], isMe: false },
    { position: 4, name: 'ก้อง', topics: ['ออกแบบระบบ'], isMe: false },
  ],
  myPosition: 2,
  tasks: [
    { title: 'ส่งร่างบทที่ 3', dueDate: '2026-09-20', due: 'overdue' },
    { title: 'ทำสไลด์ประชุม', dueDate: '2026-09-24', due: 'soon' },
    { title: 'อ่านเปเปอร์', dueDate: '2026-10-20', due: 'later' },
  ],
  taskCounts: { total: 3, overdue: 1, soon: 1, later: 1, none: 0 },
  polls: [{ title: 'เวลาประชุมสัปดาห์หน้า', remaining: 2 }],
  text: { meeting: '', presentations: '', tasks: '', polls: '' },
};
