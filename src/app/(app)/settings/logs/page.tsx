import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageSession } from '@/lib/auth-guard';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { AppLogRecord, UserRecord } from '@/lib/db/schema';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { formatLabTime } from '@/lib/lab-time';
import { KEEP_DAYS } from '@/lib/app-log-retention';
import {
  filterLog,
  formatLogDetail,
  isLevelFilter,
  readableLogRows,
  summarizeLog,
  type LogLevelFilter,
} from '@/lib/app-log-view';
import type { TranslationKey } from '@/lib/ui/i18n';

/** Enough to scroll back through a bad afternoon; the sheet holds the rest. */
const SHOWN = 200;

const BADGE: Record<string, string> = {
  error: 'bg-red-50 text-red-700 border-red-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
};

const FILTERS: { level: LogLevelFilter; key: TranslationKey }[] = [
  { level: 'all', key: 'logs.filter.all' },
  { level: 'error', key: 'logs.filter.error' },
  { level: 'warn', key: 'logs.filter.warn' },
  { level: 'info', key: 'logs.filter.info' },
];

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/**
 * Settings → Logs: what went wrong, and who was using the app when it did.
 *
 * The admin's alone, like System -- a log names people and what they opened.
 * Reads the `app_log` tab that lib/app-log.ts writes, fresh each time: the
 * point of opening it is usually the thing that happened a minute ago.
 */
export default async function LogsSettingsPage(props: PageProps<'/settings/logs'>) {
  const actor = await requirePageSession();
  if (actor.role !== 'admin') redirect('/settings/account');

  const [t, locale, params] = await Promise.all([getT(), getLocale(), props.searchParams]);
  const level = isLevelFilter(one(params.level)) ? (one(params.level) as LogLevelFilter) : 'all';
  const userId = one(params.user);

  const [rows, users] = await Promise.all([
    SheetRepo.find<AppLogRecord>('app_log', { fresh: true }).then(readableLogRows, () => null),
    SheetRepo.find<UserRecord>('users').catch((): UserRecord[] => []),
  ]);

  const nameOf = (id: string) =>
    id ? (users.find((u) => u.id === id)?.name ?? id) : t('logs.nobody');

  const hrefFor = (next: { level?: LogLevelFilter; user?: string }) => {
    const q = new URLSearchParams();
    const l = next.level ?? level;
    const u = next.user ?? userId;
    if (l !== 'all') q.set('level', l);
    if (u) q.set('user', u);
    const s = q.toString();
    return s ? `/settings/logs?${s}` : '/settings/logs';
  };

  const header = (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-gray-900">{t('logs.title')}</h3>
      <p className="text-sm text-gray-600">{t('logs.subtitle')}</p>
      <p className="text-xs text-gray-500">
        {t('logs.retention', { info: KEEP_DAYS.info, other: KEEP_DAYS.error })}{' '}
        <a
          href={`https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {t('logs.openSheet')}
        </a>
      </p>
    </div>
  );

  if (!rows) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        {header}
        <p className="text-sm text-gray-600">{t('logs.loadError')}</p>
      </div>
    );
  }

  const stats = summarizeLog(rows, new Date().getTime());
  const matching = filterLog(rows, { level, userId });
  const shown = matching.slice(0, SHOWN);
  const people = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
    .map((id) => ({ id, name: nameOf(id) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  const tiles: { key: TranslationKey; value: number; href: string }[] = [
    { key: 'logs.stat.errors', value: stats.errors, href: hrefFor({ level: 'error' }) },
    { key: 'logs.stat.warnings', value: stats.warnings, href: hrefFor({ level: 'warn' }) },
    { key: 'logs.stat.users', value: stats.people, href: hrefFor({ level: 'info' }) },
    { key: 'logs.stat.views', value: stats.views, href: hrefFor({ level: 'info' }) },
  ];

  return (
    <div className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-5">
      {header}

      <section className="space-y-2">
        <p className="text-xs text-gray-500">{t('logs.last7')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tiles.map((tile) => (
            <Link
              key={tile.key}
              href={tile.href}
              className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <span className="block text-2xl font-semibold text-gray-900 tabular-nums">{tile.value}</span>
              <span className="block text-xs text-gray-600">{t(tile.key)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col sm:flex-row sm:items-end gap-3 border-t border-gray-100 pt-4">
        <div className="space-y-1">
          <span className="block text-xs text-gray-500">{t('logs.filter.level')}</span>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.level}
                href={hrefFor({ level: f.level })}
                aria-current={f.level === level ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  f.level === level
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t(f.key)}
              </Link>
            ))}
          </div>
        </div>

        <form method="get" action="/settings/logs" className="flex items-end gap-2 sm:ml-auto">
          {level !== 'all' && <input type="hidden" name="level" value={level} />}
          <label className="space-y-1">
            <span className="block text-xs text-gray-500">{t('logs.filter.user')}</span>
            <select
              name="user"
              defaultValue={userId}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 max-w-[14rem]"
            >
              <option value="">{t('logs.filter.anyone')}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="btn btn-secondary btn-sm"
          >
            {t('logs.filter.apply')}
          </button>
        </form>
      </section>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500">{t('logs.none')}</p>
      ) : (
        <section className="space-y-2">
          <p className="text-xs text-gray-500">
            {t('logs.showing', { shown: shown.length, total: matching.length })}
          </p>
          <ul className="divide-y divide-gray-100 border-t border-b border-gray-100">
            {shown.map((row) => {
              const detail = formatLogDetail(row.detail);
              const levelKey = `logs.level.${row.level}` as TranslationKey;
              const meta = (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <span className={`px-1.5 py-0.5 rounded border font-medium ${BADGE[row.level] ?? BADGE.info}`}>
                    {BADGE[row.level] ? t(levelKey) : row.level}
                  </span>
                  <span className="font-mono text-gray-700">{row.event}</span>
                  <time dateTime={row.created_at}>{formatLabTime(row.created_at, locale)}</time>
                  <span>{nameOf(row.user_id)}</span>
                  {row.path && <span className="font-mono break-all">{row.path}</span>}
                </div>
              );
              const message = row.message && (
                <p className="text-sm text-gray-800 break-words">{row.message}</p>
              );

              return (
                <li key={row.id} className="py-3 space-y-1">
                  {detail ? (
                    <details>
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden space-y-1">
                        {meta}
                        {message}
                        <span className="text-xs text-blue-600">{t('logs.detail')} ▾</span>
                      </summary>
                      <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-700 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                        {detail}
                      </pre>
                    </details>
                  ) : (
                    <>
                      {meta}
                      {message}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
