'use client';

import InfoTip from '@/lib/ui/info-tip';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { Presence } from '@/lib/ui/presence';
import { ModalScope } from '@/lib/ui/modal';
import { useToast } from '@/lib/ui/toast';
import { byRoleThenName, roleStyle } from '@/lib/role-display';
import {
  updateUserPasswordAction,
  addUserAction,
  setUserActiveAction,
  updateUserRoleAction,
  updateUserNameAction,
  deleteUserAction,
} from './actions';

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  row_version: number;
  /**
   * The stored permission override, '' for anybody on their role's defaults.
   * Read by the permission table beside this one; nothing here uses it.
   */
  permissions: string;
};

const ROLES = ['student', 'professor', 'admin'] as const;

const MIN_PASSWORD_LENGTH = 8;

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function UserManager({
  initialUsers,
  loadError = false,
}: {
  initialUsers: SafeUser[];
  loadError?: boolean;
}) {
  const router = useRouter();
  const { t } = usePrefs();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  // Errors stay on the page; a success is a toast. The success used to be a
  // green box at the top of the page, which on a phone was a screen and a half
  // above the row that had just changed.
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fail = (text: string) => {
    setError(text);
    // Brought into view, for the same reason: it is drawn above the list.
    requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newRole, setNewRole] = useState('student');

  const roleName = (role: string) =>
    (ROLES as readonly string[]).includes(role) ? t(`role.${role}` as 'role.student') : role;

  const run = (work: () => Promise<string | null>) => {
    setError(null);
    startTransition(async () => {
      try {
        const done = await work();
        if (done) toast(done);
        router.refresh();
      } catch (err) {
        fail(errorText(err, t('users.failed')));
      }
    });
  };

  // Deleting is permanent, so it asks first -- but by showing who is about to
  // go and making the admin tick that they understand, not by making them
  // retype an address the dialog is already showing them. Cancel holds the
  // focus, so a stray Enter keeps the account.
  const [deleting, setDeleting] = useState<SafeUser | null>(null);
  const [understood, setUnderstood] = useState(false);

  const handleDeleteUser = (user: SafeUser) => {
    setUnderstood(false);
    setDeleting(user);
  };

  const confirmDelete = (user: SafeUser) => {
    setDeleting(null);
    run(async () => {
      const res = await deleteUserAction(user.id, user.row_version);
      return t('users.deleted', { email: res.email });
    });
  };
  // The name every other page shows this person by -- the rotation, the week's
  // lead, "[name] event" on the calendar all read the same field.
  const handleSaveName = (user: SafeUser) => {
    const next = draftName.trim();
    if (next === user.name) {
      setEditingNameId(null);
      return;
    }
    run(async () => {
      const res = await updateUserNameAction(user.id, next, user.row_version);
      if (!res.ok) {
        fail(t(res.error, res.vars));
        return null;
      }
      setEditingNameId(null);
      return t('users.renamed', { from: user.name, to: next });
    });
  };

  const handleSaveRole = (user: SafeUser) => {
    if (draftRole === user.role) {
      setEditingRoleId(null);
      return;
    }
    run(async () => {
      await updateUserRoleAction(user.id, draftRole, user.row_version);
      setEditingRoleId(null);
      return t('users.roleChanged', { name: user.name, role: roleName(draftRole) });
    });
  };

  const handleSavePassword = (user: SafeUser) => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      fail(t('users.passwordTooShort', { n: MIN_PASSWORD_LENGTH }));
      return;
    }
    run(async () => {
      await updateUserPasswordAction(user.id, newPassword, user.row_version);
      setEditingUserId(null);
      setNewPassword('');
      return t('users.passwordSet', { name: user.name });
    });
  };

  const handleToggleActive = (user: SafeUser) => {
    run(async () => {
      await setUserActiveAction(user.id, !user.active, user.row_version);
      return t(user.active ? 'users.deactivated' : 'users.activated', { name: user.name });
    });
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await addUserAction({
        name: newName,
        email: newEmail,
        password: newUserPassword,
        role: newRole,
      });
      const added = newName;
      setShowAddForm(false);
      setNewName('');
      setNewEmail('');
      setNewUserPassword('');
      setNewRole('student');
      return t('users.added', { name: added });
    });
  };

  // Each piece of a user's row, drawn the same in the table on a wide screen
  // and in the card on a phone.
  const nameControl = (u: SafeUser) =>
    editingNameId === u.id ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={draftName}
          autoFocus
          maxLength={60}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveName(u);
            if (e.key === 'Escape') setEditingNameId(null);
          }}
          aria-label={t('users.nameOf', { name: u.name })}
          className="px-2 py-1 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white w-40"
        />
        <button
          type="button"
          onClick={() => handleSaveName(u)}
          disabled={isPending}
          className="btn btn-primary btn-sm"
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          onClick={() => setEditingNameId(null)}
          className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
        >
          {t('common.cancel')}
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => {
          setEditingNameId(u.id);
          setDraftName(u.name);
        }}
        title={t('users.renameHint')}
        className="text-left font-medium text-gray-900 transition hover:underline decoration-dotted underline-offset-4"
      >
        {u.name} <span className="text-gray-400" aria-hidden="true">✎</span>
      </button>
    );

  const roleControl = (u: SafeUser) =>
    editingRoleId === u.id ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={draftRole}
          onChange={(e) => setDraftRole(e.target.value)}
          aria-label={t('users.roleOf', { name: u.name })}
          className="px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-900 bg-white"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {roleName(role)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => handleSaveRole(u)}
          disabled={isPending}
          className="btn btn-primary btn-sm"
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          onClick={() => setEditingRoleId(null)}
          className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
        >
          {t('common.cancel')}
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => {
          setEditingRoleId(u.id);
          setDraftRole(u.role);
        }}
        title={t('users.roleHint')}
        className={`px-2 py-0.5 rounded-full text-xs font-medium transition hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 ${roleStyle(u.role).badge}`}
      >
        {roleName(u.role)} <span aria-hidden="true">✎</span>
      </button>
    );

  const status = (u: SafeUser) => (
    <span className={`text-xs font-medium ${u.active ? 'text-green-700' : 'text-gray-500'}`}>
      {u.active ? t('users.active') : t('users.inactive')}
    </span>
  );

  const actions = (u: SafeUser) =>
    editingUserId === u.id ? (
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={t('users.newPassword')}
          aria-label={t('users.newPasswordOf', { name: u.name })}
          className="px-2 py-1 text-xs border border-gray-300 rounded w-36"
        />
        <button
          type="button"
          onClick={() => handleSavePassword(u)}
          disabled={isPending}
          className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingUserId(null);
            setNewPassword('');
          }}
          className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300"
        >
          {t('common.cancel')}
        </button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
        <button
          type="button"
          onClick={() => {
            setEditingUserId(u.id);
            setNewPassword('');
          }}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
        >
          {t('users.resetPassword')}
        </button>
        <button
          type="button"
          onClick={() => handleToggleActive(u)}
          disabled={isPending}
          className="text-xs text-gray-600 hover:text-gray-800 font-medium hover:underline disabled:opacity-50"
        >
          {u.active ? t('users.deactivate') : t('users.activate')}
        </button>
        {/* Apart from the other two, at the far end: it is the one that
            cannot be taken back. */}
        <button
          type="button"
          onClick={() => handleDeleteUser(u)}
          disabled={isPending}
          title={t('users.deleteHint')}
          className="ml-auto sm:ml-2 text-xs text-red-600 hover:text-red-800 font-medium hover:underline disabled:opacity-50"
        >
          {t('common.delete')}
        </button>
      </div>
    );

  const users = [...initialUsers].sort(byRoleThenName);
  const empty =
    initialUsers.length === 0 ? (loadError ? t('users.loadError') : t('users.none')) : null;

  return (
    <div className="space-y-6">
      {error && (
        <div
          ref={errorRef}
          className="p-4 rounded-lg text-sm border bg-red-50 text-red-800 border-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="p-4 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 basis-60 flex items-center gap-1.5">
            <h3 className="text-lg font-semibold text-gray-900">{t('users.title')}</h3>
            <InfoTip>{t('users.hint')}</InfoTip>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            aria-expanded={showAddForm}
            className="text-sm px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium transition whitespace-nowrap"
          >
            {showAddForm ? t('users.closeForm') : t('users.add')}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAddUser}
            className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
          >
            <h4 className="font-medium text-sm text-gray-900">{t('users.addTitle')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="new-name">
                  {t('users.name')}
                </label>
                <input
                  id="new-name"
                  type="text"
                  required
                  placeholder={t('users.namePlaceholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="new-email">
                  {t('users.email')}
                </label>
                <input
                  id="new-email"
                  type="email"
                  required
                  placeholder="user@test.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="new-password">
                  {t('users.password', { n: MIN_PASSWORD_LENGTH })}
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  placeholder={t('users.passwordPlaceholder')}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="new-role">
                  {t('users.role')}
                </label>
                <select
                  id="new-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleName(role)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="btn btn-primary btn-sm"
            >
              {t('users.saveNew')}
            </button>
          </form>
        )}

        {/* A phone gets one card per person. The table needed about 600px,
            so the actions sat in a fifth column off the right of the screen. */}
        <ul className="sm:hidden space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className={`p-3 rounded-lg border border-gray-200 border-l-4 ${roleStyle(u.role).stripe} ${roleStyle(u.role).row} space-y-2`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">{nameControl(u)}</div>
                {status(u)}
              </div>
              <p className="text-sm text-gray-600 break-all">{u.email}</p>
              <div>{roleControl(u)}</div>
              <div className="pt-1 border-t border-gray-200">{actions(u)}</div>
            </li>
          ))}
          {empty && <li className="py-6 text-center text-sm text-gray-500">{empty}</li>}
        </ul>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 border-b">
              <tr>
                <th className="py-2.5 px-3">{t('users.col.name')}</th>
                <th className="py-2.5 px-3">{t('users.col.email')}</th>
                <th className="py-2.5 px-3">{t('users.col.role')}</th>
                <th className="py-2.5 px-3">{t('users.col.status')}</th>
                <th className="py-2.5 px-3 text-right">{t('users.col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className={roleStyle(u.role).row}>
                  <td className={`py-3 px-3 border-l-4 ${roleStyle(u.role).stripe}`}>{nameControl(u)}</td>
                  <td className="py-3 px-3 text-gray-600">{u.email}</td>
                  <td className="py-3 px-3">{roleControl(u)}</td>
                  <td className="py-3 px-3">{status(u)}</td>
                  <td className="py-3 px-3 text-right">{actions(u)}</td>
                </tr>
              ))}
              {empty && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    {empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Presence value={deleting}>
        {(user) => (
          <ModalScope onClose={() => setDeleting(null)}>
          <div
            className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDeleting(null);
            }}
          >
            <div className="motion-dialog bg-white rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4">
              <h3 id="delete-user-title" className="text-lg font-semibold text-gray-900">
                {t('users.deleteTitle')}
              </h3>

              <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{user.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleStyle(user.role).badge}`}>
                    {roleName(user.role)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 break-all">{user.email}</p>
              </div>

              <p className="text-sm text-gray-700">{t('users.deleteBody')}</p>

              <label className="flex items-start gap-2.5 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-red-600"
                />
                {t('users.deleteUnderstood')}
              </label>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setDeleting(null)}
                  className="btn btn-ghost"
                >
                  {t('common.cancel')}
                </button>
                {user.active && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleting(null);
                      handleToggleActive(user);
                    }}
                    className="btn btn-secondary"
                  >
                    {t('users.deactivateInstead')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => confirmDelete(user)}
                  disabled={!understood || isPending}
                  className="btn btn-danger"
                >
                  {t('users.deleteForever')}
                </button>
              </div>
            </div>
          </div>
          </ModalScope>
        )}
      </Presence>
    </div>
  );
}
