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

const { submitFeedbackAction, setFeedbackStatusAction, deleteFeedbackAction } = await import(
  '../app/(app)/feedback/actions'
);
const { FEEDBACK_MAX_LENGTH } = await import('../app/(app)/feedback/categories');

function signedInAs(id: string, role = 'student') {
  getServerSessionMock.mockResolvedValue({
    user: { id, name: id, email: `${id}@test.com`, role },
  });
}

beforeEach(() => {
  getServerSessionMock.mockReset();
  insert.mockClear();
  update.mockClear();
  remove.mockClear();
  for (const key of Object.keys(tables)) delete tables[key];
  tables['feedback'] = [
    { id: 'f1', body: 'Mine', category: 'problem', status: 'open', created_by: 'me', row_version: 2 },
  ];
});

describe('sending feedback', () => {
  it('lets any signed-in member send some', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction({ body: '  it is broken  ', category: 'problem' });

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
    const result = await submitFeedbackAction({ body: '   ', category: 'idea' });

    expect(result).toMatchObject({ ok: false, error: 'feedback.error.empty' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a message too long to read', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction({
      body: 'x'.repeat(FEEDBACK_MAX_LENGTH + 1),
      category: 'other',
    });

    expect(result).toMatchObject({ ok: false, error: 'feedback.error.tooLong' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a category it does not recognise', async () => {
    signedInAs('student1');
    const result = await submitFeedbackAction({ body: 'hello', category: 'urgent!!' });

    expect(result).toMatchObject({ ok: false, error: 'error.invalidValue' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const result = await submitFeedbackAction({ body: 'hello', category: 'idea' });

    expect(result).toMatchObject({ ok: false, error: 'error.signInRequired' });
    expect(insert).not.toHaveBeenCalled();
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
