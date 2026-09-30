import Link from 'next/link';
import BackLink from '@/lib/ui/back-link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { formatLabTime } from '@/lib/lab-time';
import { agendaWeekKey } from '@/lib/rotation';
import { pastWeeks, weekRange } from '@/lib/meeting-history';
import type {
  MeetingRecord,
  MinutesRecord,
  TermBreakRecord,
  TopicRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';

/**
 * Every finished week, newest first, for anybody signed in to read.
 *
 * Read-only on purpose: a past week is a record of what was presented. Admin
 * gets a way into the week's running order to correct it; nobody else does,
 * and the topic actions refuse them anyway.
 */
export default async function MeetingHistoryPage() {
  const [actor, t, locale, users, meetings, minutes, topics, leads, breaks] = await Promise.all([
    requirePageSession(),
    getT(),
    getLocale(),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<MinutesRecord>('minutes'),
    SheetRepo.find<TopicRecord>('topics'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<TermBreakRecord>('term_breaks').catch(() => []),
  ]);

  const weeks = pastWeeks({ meetings, minutes, topics, leads }, agendaWeekKey(meetings, breaks));
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? t('common.deletedUser');
  const isAdmin = actor.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackLink href="/presentations" className="text-sm text-blue-600 hover:underline">
          ← {t('presentations.title')}
        </BackLink>
        <h2 className="text-2xl font-bold text-gray-900">{t('history.title')}</h2>
      </div>

      {weeks.length === 0 ? (
        <div className="p-6 text-center bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-gray-500">{t('history.empty')}</p>
        </div>
      ) : (
        <ol className="space-y-4">
          {weeks.map((week) => (
            <li
              key={week.weekKey}
              className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold text-gray-900 tabular-nums">
                  {t('history.week', { week: week.weekKey })}
                </h3>
                <span className="text-sm text-gray-500">{weekRange(week.weekKey, locale)}</span>
                <span className="text-sm text-gray-600">
                  {week.leadId ? t('history.lead', { name: nameOf(week.leadId) }) : t('history.noLead')}
                </span>
                {isAdmin && (
                  <Link
                    href={`/presentations?week=${week.weekKey}`}
                    className="ml-auto text-sm text-blue-600 hover:underline"
                  >
                    {t('history.edit')}
                  </Link>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-500">{t('history.topics')}</h4>
                {week.topics.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('history.noTopics')}</p>
                ) : (
                  <ol className="space-y-1.5 list-decimal pl-5 marker:text-gray-400">
                    {week.topics.map((topic) => (
                      <li key={topic.id} className="text-sm">
                        <span className="font-medium text-gray-900 break-words">{topic.title}</span>
                        <span className="text-gray-500"> — {nameOf(topic.owner_id)}</span>
                        {topic.details && (
                          <p className="text-gray-600 mt-0.5 whitespace-pre-line break-words">
                            {topic.details}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {week.meetings.length === 0 ? (
                <p className="text-sm text-gray-400">{t('history.noMeeting')}</p>
              ) : (
                week.meetings.map(({ meeting, minutes: record }) => (
                  <div key={meeting.id} className="pt-3 border-t border-gray-100 space-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-gray-900">{meeting.title}</span>
                      <span className="text-sm text-gray-500 tabular-nums">
                        {formatLabTime(meeting.start_at, locale) || t('meeting.noTime')}
                      </span>
                      <Link
                        href={`/meetings/${meeting.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {t('history.openMeeting')}
                      </Link>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">{t('minutes.title')}</h4>
                      {record?.content ? (
                        <p className="mt-1 text-sm text-gray-700 whitespace-pre-line break-words">
                          {record.content}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-gray-400">{t('minutes.noneYet')}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
