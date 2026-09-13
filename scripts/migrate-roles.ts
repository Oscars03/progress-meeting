/**
 * One-off: collapse the old five roles onto admin / professor / student.
 *
 * manager meant two different things -- advisors and the student lead -- so it
 * cannot be mapped by role alone. Anyone whose name marks them as a student
 * stays a student; every other manager becomes a professor.
 *
 * Writes through SheetRepo so each change carries a row_version check and lands
 * in audit_log, exactly as the Settings screen would.
 */
import { SheetRepo } from '../src/lib/db/sheet-repo';
import type { UserRecord } from '../src/lib/db/schema';

const STUDENT_MARKERS = ['นักศึกษา', 'student'];

function looksLikeStudent(user: UserRecord): boolean {
  const haystack = `${user.name} ${user.email}`.toLowerCase();
  return STUDENT_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()));
}

function nextRole(user: UserRecord): string | null {
  switch (user.role) {
    case 'admin':
    case 'professor':
    case 'student':
      return null;
    case 'manager':
      return looksLikeStudent(user) ? 'student' : 'professor';
    default:
      return 'student';
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const users = await SheetRepo.find<UserRecord>('users');

  const changes = users
    .map((user) => ({ user, to: nextRole(user) }))
    .filter((c): c is { user: UserRecord; to: string } => c.to !== null);

  if (changes.length === 0) {
    console.log('Nothing to change -- every account already holds one of the three roles.');
    return;
  }

  for (const { user, to } of changes) {
    console.log(`${dryRun ? 'would set' : 'set'} ${user.email.padEnd(24)} ${user.role} -> ${to}`);
    if (!dryRun) {
      await SheetRepo.update('users', user.id, { role: to }, user.row_version, 'role-migration');
    }
  }

  console.log(`${dryRun ? 'Would update' : 'Updated'} ${changes.length} account(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
