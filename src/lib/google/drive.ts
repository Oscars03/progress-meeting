import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import { recordTokenError, tokenForGoogleAccount } from './tokens';
import { UserError } from '../user-error';

/**
 * File storage, on the lab's own Google Drive.
 *
 * This runs as a real user for the same reason the calendar does, and the
 * reason is worth stating because "the service account already talks to
 * Google" is the obvious wrong guess. A service account has no Drive storage
 * quota at all -- `about.get` reports `limit: 0` -- so it can read a
 * spreadsheet shared with it but can never *own* a file. An upload comes back:
 *
 *   Service Accounts do not have storage quota. Leverage shared drives, or
 *   use OAuth delegation instead.
 *
 * Shared drives need Google Workspace, and this lab's Drive is a personal
 * account, so delegation is the only door: one nominated Google account
 * connects, and everything the app stores lives in a folder on it.
 *
 * The scope is `drive.file`, which reaches only files this app created. The
 * app cannot see anything else in that Drive, which is what makes pointing it
 * at the lab's own account reasonable rather than alarming.
 */

/** Which Google account holds the files. Its Drive, its 15GB. */
export function labDriveEmail(): string {
  return (process.env.LAB_DRIVE_EMAIL ?? '').trim();
}

export class DriveNotConnectedError extends UserError {
  constructor() {
    super(
      'drive.notConnectedError',
      undefined,
      `No stored Google token grants Drive for ${labDriveEmail() || '(LAB_DRIVE_EMAIL unset)'}`
    );
    this.name = 'DriveNotConnectedError';
  }
}

/** The folder everything the app stores goes into. */
const FOLDER_NAME = 'IRiSH Progress Meeting — uploads';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * A built client, kept for the life of the process under Google's 60-minute
 * access token. Reads happen on every view of the feedback list, and paying
 * for a token exchange each time would be 200-500ms an image.
 */
const CLIENT_TTL = 50 * 60 * 1000;
let cached: { drive: drive_v3.Drive; userId: string; ts: number } | null = null;
let cachedFolderId = '';

/** Drop the built client, so the next call goes back to the stored token. */
export function forgetDriveClient(): void {
  cached = null;
  cachedFolderId = '';
}

async function driveClient(): Promise<{ drive: drive_v3.Drive; userId: string }> {
  if (cached && Date.now() - cached.ts < CLIENT_TTL) {
    return { drive: cached.drive, userId: cached.userId };
  }

  const stored = await tokenForGoogleAccount(labDriveEmail());
  if (!stored) throw new DriveNotConnectedError();

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: stored.refreshToken });
  const drive = google.drive({ version: 'v3', auth });

  cached = { drive, userId: stored.userId, ts: Date.now() };
  return { drive, userId: stored.userId };
}

/**
 * Run a Drive call as the lab account, recording an authorisation failure
 * against that connection so the UI can say it needs reconnecting.
 *
 * A revoked grant is permanent -- retrying never fixes it -- so it is stored
 * rather than swallowed, exactly as the calendar does.
 */
async function asLab<T>(work: (drive: drive_v3.Drive) => Promise<T>): Promise<T> {
  const { drive, userId } = await driveClient();
  try {
    return await work(drive);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/invalid_grant|unauthorized|invalid credentials/i.test(message)) {
      forgetDriveClient();
      await recordTokenError(userId, message);
    }
    throw err;
  }
}

/**
 * The app's folder, made on first use.
 *
 * `drive.file` can see the folder because the app created it; it could not
 * find one somebody made by hand, which is why this never looks for that.
 */
async function folderId(drive: drive_v3.Drive): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  const found = await drive.files.list({
    q: `mimeType='${FOLDER_MIME}' and name='${FOLDER_NAME.replace(/'/g, "\\'")}' and trashed=false`,
    fields: 'files(id)',
    pageSize: 1,
  });

  const existing = found.data.files?.[0]?.id;
  if (existing) {
    cachedFolderId = existing;
    return existing;
  }

  const made = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: 'id',
  });
  cachedFolderId = made.data.id!;
  return cachedFolderId;
}

export type StoredFile = { fileId: string; size: number };

/**
 * Put a file on the lab's Drive and hand back its id.
 *
 * Nothing is shared with anyone: the file stays private to the lab account and
 * is served back through the app, to people the app has already signed in. A
 * screenshot sent as feedback can hold anything that was on the sender's
 * screen, and "anyone with the link" is not a promise this app should make on
 * their behalf.
 */
export async function storeFile(input: {
  name: string;
  mime: string;
  bytes: Buffer;
}): Promise<StoredFile> {
  return asLab(async (drive) => {
    const parent = await folderId(drive);
    const created = await drive.files.create({
      requestBody: { name: input.name, parents: [parent] },
      media: { mimeType: input.mime, body: Readable.from(input.bytes) },
      fields: 'id,size',
    });
    return { fileId: created.data.id!, size: Number(created.data.size ?? input.bytes.length) };
  });
}

/** Read one back. The caller is responsible for deciding who may see it. */
export async function readFile(fileId: string): Promise<{ bytes: Buffer; mime: string }> {
  return asLab(async (drive) => {
    const meta = await drive.files.get({ fileId, fields: 'mimeType' });
    const got = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return {
      bytes: Buffer.from(got.data as ArrayBuffer),
      mime: meta.data.mimeType ?? 'application/octet-stream',
    };
  });
}

/**
 * Remove one.
 *
 * Best effort by design: a file left behind on the lab's Drive is untidy,
 * while a delete that refuses and takes the whole action down with it loses
 * the thing somebody actually asked to remove.
 */
export async function removeFile(fileId: string): Promise<void> {
  try {
    await asLab((drive) => drive.files.delete({ fileId }));
  } catch (err) {
    console.error(`Could not remove Drive file ${fileId}:`, err);
  }
}

export type DriveStatus = {
  /** Set when LAB_DRIVE_EMAIL names an account and a token for it is stored. */
  connected: boolean;
  /** The account that is meant to hold the files, connected or not. */
  account: string;
  /** Set when the connection existed and then broke. */
  brokeWith: string;
};

export async function driveStatus(): Promise<DriveStatus> {
  const account = labDriveEmail();
  if (!account) return { connected: false, account: '', brokeWith: '' };

  const stored = await tokenForGoogleAccount(account);
  return {
    connected: Boolean(stored),
    account,
    brokeWith: stored?.lastError ?? '',
  };
}
