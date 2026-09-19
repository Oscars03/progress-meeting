'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { ABILITIES, effectiveAbilities, roleDefault, type Ability } from '@/lib/permissions';
import type { Role } from '@/lib/auth-guard';
import { setUserPermissionsAction } from './actions';
import type { SafeUser } from './user-manager';

type Grid = Record<string, Record<Ability, boolean>>;

const isRole = (value: string): value is Role =>
  value === 'admin' || value === 'professor' || value === 'student';

/** A row's role, with anything unrecognised treated as the least privileged. */
const roleOf = (user: SafeUser): Role => (isRole(user.role) ? user.role : 'student');

function buildGrid(users: SafeUser[]): Grid {
  return Object.fromEntries(
    users.map((u) => [u.id, effectiveAbilities(roleOf(u), u.permissions)])
  );
}

/**
 * Who may do what, as one table an admin can read across.
 *
 * Roles answer almost every question and should keep answering them. This is
 * for the exceptions, which until now meant promoting somebody to a role that
 * granted six other things by accident.
 *
 * Nothing is written while the boxes are being ticked. A permission change is
 * not a preference -- it changes what somebody can do to other people's work
 * the moment it lands -- so the table gathers the edits, says how many there
 * are and what they mean, and waits to be confirmed.
 */
export default function PermissionTable({ users }: { users: SafeUser[] }) {
  const { t } = usePrefs();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Admin accounts are not listed: they hold every ability by definition, and
  // an admin cannot edit their own row anyway.
  const rows = useMemo(() => users.filter((u) => u.active && u.role !== 'admin'), [users]);

  const [grid, setGrid] = useState<Grid>(() => buildGrid(rows));
  const [original, setOriginal] = useState<Grid>(() => buildGrid(rows));

  const changes = rows.flatMap((user) =>
    ABILITIES.filter((ability) => grid[user.id]?.[ability] !== original[user.id]?.[ability]).map(
      (ability) => ({ user, ability })
    )
  );

  const start = () => {
    const fresh = buildGrid(rows);
    setGrid(fresh);
    setOriginal(fresh);
    setError('');
    setSaved(false);
    setOpen(true);
  };

  const toggle = (userId: string, ability: Ability) =>
    setGrid((current) => ({
      ...current,
      [userId]: { ...current[userId], [ability]: !current[userId][ability] },
    }));

  const save = () => {
    setError('');
    startTransition(async () => {
      // One row at a time, each with the version it was read at, so two
      // admins editing at once collide instead of overwriting each other.
      const touched = [...new Set(changes.map((c) => c.user.id))];

      for (const id of touched) {
        const user = rows.find((u) => u.id === id);
        if (!user) continue;

        const result = await setUserPermissionsAction(id, grid[id], user.row_version);
        if (!result.ok) {
          setError(t(result.error as Parameters<typeof t>[0], result.vars) || result.error);
          return;
        }
      }

      setOriginal(grid);
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('perm.title')}</h3>
          <p className="text-sm text-gray-500">{t('perm.intro')}</p>
        </div>
        <button
          type="button"
          onClick={start}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
        >
          {t('perm.open')}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('perm.title')}
          onClick={(e) => {
            if (e.target === e.currentTarget && changes.length === 0) setOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-4xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4 sm:p-5">
              <div>
                <h4 className="font-semibold text-gray-900">{t('perm.title')}</h4>
                <p className="text-xs text-gray-500">{t('perm.intro')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('avail.close')}
                className="h-8 w-8 shrink-0 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-5">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-white p-2 text-left font-medium text-gray-600"
                    >
                      {t('perm.member')}
                    </th>
                    {ABILITIES.map((ability) => (
                      <th
                        key={ability}
                        scope="col"
                        className="p-2 align-bottom text-xs font-medium text-gray-600"
                      >
                        {t(`perm.ability.${ability}` as Parameters<typeof t>[0])}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((user) => (
                    <tr key={user.id} className="border-t border-gray-100">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-white p-2 text-left font-normal"
                      >
                        <span className="block text-gray-900">{user.name}</span>
                        <span className="block text-xs text-gray-500">{user.role}</span>
                      </th>
                      {ABILITIES.map((ability) => {
                        const value = grid[user.id]?.[ability] ?? false;
                        const isDefault = value === roleDefault(roleOf(user), ability);
                        const changed = value !== original[user.id]?.[ability];

                        return (
                          <td key={ability} className="p-2 text-center">
                            <label className="inline-flex flex-col items-center gap-0.5">
                              <span className="sr-only">
                                {user.name} · {t(`perm.ability.${ability}` as Parameters<typeof t>[0])}
                              </span>
                              <input
                                type="checkbox"
                                checked={value}
                                onChange={() => toggle(user.id, ability)}
                                className={`h-4 w-4 rounded text-blue-600 focus:ring-blue-500 ${
                                  changed ? 'ring-2 ring-amber-400' : ''
                                }`}
                              />
                              {/* Says which ticks are the role's doing, so an
                                  admin can tell a deliberate exception from a
                                  default they are about to freeze in. */}
                              {!isDefault && (
                                <span className="text-[0.6rem] leading-none text-amber-600">●</span>
                              )}
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 border-t border-gray-100 p-4 sm:p-5">
              {error && (
                <p role="status" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
                  {error}
                </p>
              )}
              {saved && changes.length === 0 && (
                <p role="status" className="text-sm text-green-700">
                  {t('perm.saved')}
                </p>
              )}

              {changes.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-900">
                    {t('perm.changed', { n: changes.length })}
                  </p>
                  <ul className="space-y-0.5 text-xs text-amber-900">
                    {changes.map(({ user, ability }) => (
                      <li key={`${user.id}-${ability}`}>
                        {grid[user.id][ability] ? '✓' : '✕'} {user.name} ·{' '}
                        {t(`perm.ability.${ability}` as Parameters<typeof t>[0])}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-800">{t('perm.warning')}</p>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGrid(original)}
                  disabled={changes.length === 0 || isPending}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  {t('perm.reset')}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={changes.length === 0 || isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {isPending ? t('perm.saving') : t('perm.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
