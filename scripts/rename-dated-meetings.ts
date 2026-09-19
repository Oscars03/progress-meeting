/**
 * Take the time back out of meeting names.
 *
 * A meeting created from a poll used to inherit the poll's title, which is
 * generated as "ยืนยันเวลาประชุม เสาร์ 19 ก.ย. 18:00–19:00" -- the time baked
 * into the text. Moving the meeting afterwards changed start_at and end_at
 * and could not change that, so the invitation in everybody's inbox and the
 * block on the calendar went on announcing an hour the meeting was no longer
 * at. Meetings are named and not dated now; this repairs the ones already in
 * the sheet.
 *
 * Writes go through SheetRepo, so each one takes the row_version it just read
 * and leaves an audit_log row -- the same as if somebody had done it in the
 * app. Nothing else about the meeting is touched, and a Google event already
 * created keeps its old summary until the meeting is next pushed.
 *
 *   npm run db:rename-meetings -- --dry-run   # print what would change
 *   npm run db:rename-meetings                # apply
 */

import { SheetRepo } from '../src/lib/db/sheet-repo';
import type { MeetingRecord, UserRecord } from '../src/lib/db/schema';
import { translate } from '../src/lib/ui/i18n';

/** A clock in a title: 18:00, 18.00, or either side of a dash. */
const HAS_A_TIME = /\d{1,2}[:.]\d{2}/;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const [meetings, users] = await Promise.all([
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<UserRecord>('users'),
  ]);

  // Attributed to a real admin rather than a made-up id, so the audit row
  // names somebody the sheet knows.
  const actor = users.find((u) => u.role === 'admin');
  if (!actor) throw new Error('No admin account to attribute the change to.');

  const dated = meetings.filter((m) => HAS_A_TIME.test(m.title ?? ''));
  const replacement = translate('th', 'avail.meetingTitle');

  if (dated.length === 0) {
    console.log('No meeting carries a time in its name.');
    return;
  }

  console.log(`${dated.length} meeting(s) name a time:\n`);
  for (const m of dated) {
    console.log(`  ${m.id}  ${m.start_at}`);
    console.log(`    "${m.title}"  ->  "${replacement}"`);
  }

  if (dryRun) {
    console.log('\nDry run: nothing written.');
    return;
  }

  for (const m of dated) {
    await SheetRepo.update<MeetingRecord>(
      'meetings',
      m.id,
      { title: replacement },
      m.row_version,
      actor.id
    );
  }
  console.log(`\nRenamed ${dated.length} meeting(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
