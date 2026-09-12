/**
 * One-off migration: replace plaintext values in users.password_hash with bcrypt
 * hashes of the same password, in place.
 *
 * Login compares with bcrypt only, so rows left in plaintext fail closed. Run
 * this once against any sheet seeded before hashing was introduced.
 */
import { getSheetsApi, getSpreadsheetId } from '../src/lib/db/sheet-client';
import { SCHEMAS } from '../src/lib/db/schema';
import { hashPassword, isHashed } from '../src/lib/password';

async function main() {
  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'users!A:ZZ' });
  const values = res.data.values ?? [];

  if (values.length <= 1) {
    console.log('No user rows found. Nothing to migrate.');
    return;
  }

  const headers = values[0] as string[];
  const pwdIdx = headers.indexOf('password_hash');
  const emailIdx = headers.indexOf('email');

  if (pwdIdx === -1) {
    throw new Error('users sheet has no password_hash column');
  }

  const columnLetter = String.fromCharCode(65 + pwdIdx);
  const updates: { range: string; values: string[][] }[] = [];
  let alreadyHashed = 0;
  let blank = 0;

  for (let i = 1; i < values.length; i++) {
    const current = (values[i][pwdIdx] ?? '') as string;
    const email = emailIdx === -1 ? `row ${i + 1}` : values[i][emailIdx];

    if (!current) {
      blank++;
      continue;
    }
    if (isHashed(current)) {
      alreadyHashed++;
      continue;
    }

    updates.push({
      range: `users!${columnLetter}${i + 1}`,
      values: [[await hashPassword(current)]],
    });
    console.log(`  will hash: ${email}`);
  }

  if (updates.length === 0) {
    console.log(
      `Nothing to do. ${alreadyHashed} row(s) already hashed, ${blank} blank (Google-only accounts).`
    );
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data: updates },
  });

  console.log(
    `\nMigrated ${updates.length} password(s). ${alreadyHashed} already hashed, ${blank} blank.`
  );
  console.log(`Schema columns checked against: ${SCHEMAS.users.join(', ')}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Password migration failed:', err);
    process.exit(1);
  });
