/**
 * Who may say what, and who may act on it.
 *
 * A suggestion box is only useful if people trust it: the author is taken from
 * the session and never from the caller, an author can withdraw their own words
 * and nobody else's, and deciding something has been "dealt with" is a claim
 * about what the admins did, so only an admin can make it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServerSessionMock = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock('../lib/auth', () => ({ authOptions: {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const tables: Record<string, unknown[]> = {};
const insert = vi.fn(async () => ({ id: 'f-new', row_version: 1 }));
const update = vi.fn(async () => ({}));
const remove = vi.fn(async () => {});

vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: async (table: string) => tables[table] ?? [],
    findOne: async (table: string, id: string) =>
      (tables[table] ?? []).find((r) => (r as { id: string }).id === id) ?? null,
    insert: (...a: Parameters<typeof insert>) => insert(...a),
    update: (...a: Parameters<typeof update>) => update(...a),
    delete: (...a: Parameters<typeof remove>) => remove(...a),
  },
}));

// Drive is mocked: these tests are about the rule, not about Google. The
// upload is asserted through the calls it would have made.
const storeFile = vi.fn(async () => ({ fileId: 'drive-1', size: 11 }));
const removeFile = vi.fn(async () => {});
vi.mock('../lib/google/drive', () => ({
  storeFile: (...a: unknown[]) => storeFile(...(a as [])),
  removeFile: (...a: unknown[]) => removeFile(...(a as [])),
}));

const { submitFeedbackAction, setFeedbackStatusAction, deleteFeedbackAction } = await import(
  '../app/(app)/feedback/actions'
);
const { FEEDBACK_MAX_LENGTH } = await import('../app/(app)/feedback/categories');
const { MAX_IMAGE_BYTES } = await import('../lib/uploads');

function signedInAs(id: string, role = 'student') {
  getServerSessionMock.mockResolvedValue({
    user: { id, name: id, email: `${id}@test.com`, role },
  });
}

/** The form's payload, which is FormData because it may carry a file. */
function formOf(body: string, category: string, image?: File): FormData {
  const form = new FormData();
  form.set('body', body);
  form.set('category', category);
  if (image) form.set('image', image);
  return form;
}

/** A file of `size` bytes claiming to be `type`. */
function fileOf(name: string, type: string, size = 11): File {
  return new File([new Uint8Array(size)], name, { type });
}

beforeEach(() => {
  getServerSessionMock.mockReset();
  insert.mockClear();
  update.mockClear();
  remove.mockClear();
  storeFile.mockClear();
  removeFile.mockClear();
  for (const key of Object.keys(tables)) delete tables[key];
  tables['feedback'] = [
    { id: 'f1', body: 'Mine', category: 'problem', status: 'open', created_by: 'me', row_version: 2 },
  ];
});

describe('sending feedback', () => {
  it('lets any signed-in member send some', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction(formOf('  it is broken  ', 'problem'));

    expect(result.ok).toBe(true);
    // Trimmed, opened, and attributed to the session rather than to anything
    // the caller passed -- there is no author field to forge.
    expect(insert).toHaveBeenCalledWith(
      'feedback',
      { body: 'it is broken', category: 'problem', status: 'open' },
      'student1'
    );
  });

  it('refuses an empty message rather than filing a blank row', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction(formOf('   ', 'idea'));

    expect(result).toMatchObject({ ok: false, error: 'feedback.error.empty' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a message too long to read', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction(formOf('x'.repeat(FEEDBACK_MAX_LENGTH + 1), 'other'));

    expect(result).toMatchObject({ ok: false, error: 'feedback.error.tooLong' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a category it does not recognise', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction(formOf('hello', 'urgent!!'));

    expect(result).toMatchObject({ ok: false, error: 'error.invalidValue' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const result = await submitFeedbackAction(formOf('hello', 'idea'));

    expect(result).toMatchObject({ ok: false, error: 'error.signInRequired' });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('sending a picture with it', () => {
  it('stores the file and records what it belongs to', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction(
      formOf('look at this', 'problem', fileOf('screen.png', 'image/png'))
    );

    expect(result.ok).toBe(true);
    expect(storeFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'screen.png', mime: 'image/png' })
    );
    // The row points at the Drive id and at the feedback it came with.
    expect(insert).toHaveBeenCalledWith(
      'attachments',
      expect.objectContaining({
        entity_type: 'feedback',
        entity_id: 'f-new',
        url: 'drive-1',
        mime: 'image/png',
      }),
      'student1'
    );
  });

  it('refuses a file that is not an image, and stores nothing', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction(
      formOf('here', 'problem', fileOf('payload.pdf', 'application/pdf'))
    );

    expect(result).toMatchObject({ ok: false, error: 'uploads.error.type' });
    expect(storeFile).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses one too large, without uploading it first', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction(
      formOf('here', 'problem', fileOf('huge.png', 'image/png', MAX_IMAGE_BYTES + 1))
    );

    expect(result).toMatchObject({ ok: false, error: 'uploads.error.tooBig' });
    expect(storeFile).not.toHaveBeenCalled();
  });

  // The browser's check decides nothing: this is the one that does.
  it('checks the file even though the form already did', async () => {
    signedInAs('student1');
    await submitFeedbackAction(formOf('here', 'problem', fileOf('x.exe', 'application/x-msdownload')));

    expect(storeFile).not.toHaveBeenCalled();
  });

  it('takes the file back when the sheet refuses, so nothing is orphaned', async () => {
    signedInAs('student1');
    insert.mockRejectedValueOnce(new Error('sheet is down'));

    const result = await submitFeedbackAction(
      formOf('look', 'problem', fileOf('screen.png', 'image/png'))
    );

    expect(result.ok).toBe(false);
    expect(removeFile).toHaveBeenCalledWith('drive-1');
  });

  it('strips a path out of the file name rather than storing it', async () => {
    signedInAs('student1');
    await submitFeedbackAction(
      formOf('look', 'problem', fileOf('../../etc/passwd.png', 'image/png'))
    );

    expect(storeFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'passwd.png' }));
  });

  it('files feedback with no picture exactly as before', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction(formOf('just words', 'idea'));

    expect(result.ok).toBe(true);
    expect(storeFile).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe('withdrawing feedback that had a picture', () => {
  beforeEach(() => {
    tables['attachments'] = [
      {
        id: 'a1',
        entity_type: 'feedback',
        entity_id: 'f1',
        name: 'screen.png',
        url: 'drive-1',
        mime: 'image/png',
        size: 11,
        row_version: 1,
      },
      // Somebody else's, which must be left alone.
      {
        id: 'a2',
        entity_type: 'feedback',
        entity_id: 'f2',
        name: 'other.png',
        url: 'drive-2',
        mime: 'image/png',
        size: 11,
        row_version: 1,
      },
    ];
  });

  it('takes the picture with it', async () => {
    signedInAs('me');
    const result = await deleteFeedbackAction('f1', 2);

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('attachments', 'a1', 1, 'me');
    expect(removeFile).toHaveBeenCalledWith('drive-1');
  });

  it('leaves another message’s picture alone', async () => {
    signedInAs('me');
    await deleteFeedbackAction('f1', 2);

    expect(removeFile).not.toHaveBeenCalledWith('drive-2');
    expect(remove).not.toHaveBeenCalledWith('attachments', 'a2', 1, 'me');
  });

  it('removes nothing at all when the caller is refused', async () => {
    signedInAs('someone-else');
    const result = await deleteFeedbackAction('f1', 2);

    expect(result).toMatchObject({ ok: false, error: 'error.forbidden' });
    expect(removeFile).not.toHaveBeenCalled();
  });
});

describe('marking feedback dealt with', () => {
  it('lets an admin', async () => {
    signedInAs('boss', 'admin');
    const result = await setFeedbackStatusAction('f1', 'done', 2);

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith('feedback', 'f1', { status: 'done' }, 2, 'boss');
  });

  // Otherwise anyone could close their own complaint and it would look answered.
  it('refuses the author of the message', async () => {
    signedInAs('me');
    const result = await setFeedbackStatusAction('f1', 'done', 2);

    expect(result).toMatchObject({ ok: false, error: 'error.roleRequired' });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a professor, who outranks a student but does not run the app', async () => {
    signedInAs('prof', 'professor');
    const result = await setFeedbackStatusAction('f1', 'done', 2);

    expect(result).toMatchObject({ ok: false, error: 'error.roleRequired' });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a status it does not recognise', async () => {
    signedInAs('boss', 'admin');
    const result = await setFeedbackStatusAction('f1', 'ignored', 2);

    expect(result).toMatchObject({ ok: false, error: 'error.invalidValue' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('withdrawing feedback', () => {
  it('lets the author take their own words back', async () => {
    signedInAs('me');
    const result = await deleteFeedbackAction('f1', 2);

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('feedback', 'f1', 2, 'me');
  });

  it('lets an admin remove anything, which is the only way to clear a mistake', async () => {
    signedInAs('boss', 'admin');
    const result = await deleteFeedbackAction('f1', 2);

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('feedback', 'f1', 2, 'boss');
  });

  it('refuses somebody else, so one member cannot silence another', async () => {
    signedInAs('someone-else');
    const result = await deleteFeedbackAction('f1', 2);

    expect(result).toMatchObject({ ok: false, error: 'error.forbidden' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('reports a message already gone rather than pretending it worked', async () => {
    signedInAs('boss', 'admin');
    const result = await deleteFeedbackAction('missing', 1);

    expect(result).toMatchObject({ ok: false, error: 'error.notFound' });
    expect(remove).not.toHaveBeenCalled();
  });
});
