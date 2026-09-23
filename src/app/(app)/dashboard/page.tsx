import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import {
  activeWeekKey,
  leadForWeek,
  meetingsInWeek,
  nextMeeting,
  rotationMembers,
  suggestNextHost,
} from '@/lib/rotation';
import NewMeetingButton from '../meetings/new-meeting-button';
import HostPicker from './host-picker';
import PendingUsers from './pending-users';
import { autoAssignWeekLead } from '../meetings/actions';
import { formatLabClock, formatLabTime, labDay } from '@/lib/lab-time';
import { openPolls } from '@/lib/poll-tally';
import { brokenConnections } from '@/lib/google/tokens';
import { breakForWeek } from '@/lib/term-breaks';
import { memberIds } from '@/lib/members';
import { intlLocale } from '@/lib/ui/i18n';
import { effectiveTopicOrder, groupByPresenter, topicsForWeek } from '@/lib/presentation-order';
import { actsAsWeekLead } from '@/lib/rotation';
import { labInstant } from '@/lib/lab-time';
import { can } from '@/lib/permissions';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
  MeetingRecord,
  PersonalEventRecord,
  TopicRecord,
  UserRecord,
  WeekLeadRecord,
  TermBreakRecord,
  TaskRecord,
  FeedbackRecord,
} from '@/lib/db/schema';

/**
 * The lead's buttons. Big enough to hit on a tablet (44px) and a clear step
 * apart: the one thing to do next is solid, anything after it is outlined.
 * Every colour here is one globals.css already remaps for the dark theme.
 */
const ACTION = 'inline-flex items-center justify-center min-h-11 px-5 rounded-lg text-base font-semibold shadow-sm transition';
const PRIMARY_ACTION = `${ACTION} bg-blue-600 hover:bg-blue-700 text-white`;
const SECONDARY_ACTION = `${ACTION} border-2 border-blue-300 bg-white text-blue-700 hover:bg-blue-100`;

export default async function DashboardPage() {
  const [
    actor,
    users,
    meetings,
    initialLeads,
    polls,
    slots,
    votes,
    termBreaks,
    tasks,
    feedback,
    allTopics,
    personalEvents,
    t,
    locale,
  ] = await Promise.all([
    requirePageSession(),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<AvailabilityPollRecord>('availability_polls'),
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
    SheetRepo.find<AvailabilityVoteRecord>('availability_votes'),
    SheetRepo.find<TermBreakRecord>('term_breaks'),
    SheetRepo.find<TaskRecord>('tasks').catch(() => []),
    SheetRepo.find<FeedbackRecord>('feedback').catch(() => []),
    SheetRepo.find<TopicRecord>('topics').catch(() => []),
    SheetRepo.find<PersonalEventRecord>('personal_events').catch(() => []),
    getT(),
    getLocale(),
  ]);

  const upcoming = nextMeeting(meetings);
  const thisWeek = meetingsInWeek(meetings);
  const students = rotationMembers(users);
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? '';

  // The next meeting has its own card, so listing it again under "this week"
  // says the same thing twice. What is left is what the card does not show.
  const restOfWeek = thisWeek.filter((meeting) => meeting.id !== upcoming?.id);
  // The duty belongs to the week itself, so it stands whether or not anything
  // has been scheduled yet -- and once a full lab day has passed since that
  // week's meeting ended, the board has already moved on to the next one.
  const thisWeekKey = activeWeekKey(meetings);
  const assignedAutomatically = await autoAssignWeekLead(thisWeekKey);
  const leads = assignedAutomatically ? await SheetRepo.find<WeekLeadRecord>('week_leads') : initialLeads;
  const currentBreak = breakForWeek(termBreaks, thisWeekKey);
  const lead = currentBreak ? null : leadForWeek(leads, thisWeekKey);
  const confirmedHost = lead ? nameOf(lead.user_id) : '';
  const suggested = (confirmedHost || currentBreak) ? null : suggestNextHost(users, leads);

  // Self-registration lands inactive, so somebody is stuck until an admin acts.
  // Only an admin can do anything about it, so only an admin is told.
  const awaitingApproval =
    actor.role === 'admin'
      ? users
          .filter((user) => user.active !== true)
          .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            row_version: user.row_version,
          }))
      : [];

  // A calendar the app can no longer read makes the availability grid quietly
  // less true rather than visibly broken, so nobody notices unless told. Only
  // the person themselves can reconnect, but only an admin sees who has to.
  const brokenCalendars =
    actor.role === 'admin'
      ? (await brokenConnections().catch(() => [])).map((row) => ({
          ...row,
          name: nameOf(row.userId) || row.accountEmail,
        }))
      : [];

  // Somebody took the trouble to say something. Only an admin can answer it,
  // and a suggestion box nobody empties stops being used.
  const openFeedback = actor.role === 'admin' ? feedback.filter((f) => f.status !== 'done').length : 0;

  // Asking is the lead's job, but answering is every *member's*, and the ask is
  // easy to miss on a page nobody opens. It sits at the top of the page they do.
  //
  // Not admin, though. Its availability is not weighed when finding a slot and
  // not counted when deciding whether everyone has answered, so being chased
  // for an answer nobody wants is the one thing left that treated it as a
  // member.
  const iAmAVoter = memberIds(users).has(actor.id);
  const open = iAmAVoter ? openPolls(polls, slots, votes, actor.id) : [];
  const awaiting = open.filter((row) => row.remaining > 0);
  const answered = open.filter((row) => row.remaining === 0);
  const canConfirm = actor.role === 'admin';
  // Booking a meeting outright skips the poll, so it is admin's escape hatch.
  // Everyone else schedules by proposing times and confirming the winner.
  const canSchedule = actor.role === 'admin';

  // Where you come in this week's meeting, and what you are down to show.
  // The order itself lives on /presentations; what belongs here is the one
  // line about it that concerns the person reading -- being third is something
  // you want to know without going to look.
  const weekTopics = topicsForWeek(allTopics, thisWeekKey);
  const presenters = groupByPresenter(effectiveTopicOrder(weekTopics).ordered);
  const myPlaceIndex = presenters.findIndex((block) => block.ownerId === actor.id);
  const myTurn =
    myPlaceIndex >= 0
      ? {
          position: myPlaceIndex + 1,
          outOf: presenters.length,
          topics: presenters[myPlaceIndex].topics,
          // Whoever goes immediately before you. After your own number, this
          // is the fact that decides when to stop typing and get ready.
          after: myPlaceIndex > 0 ? nameOf(presenters[myPlaceIndex - 1].ownerId) : '',
        }
      : null;

  // Arranging the week's meeting is the lead's job, and the two things it
  // takes -- finding an hour everyone is free, and asking them to confirm it --
  // were both two pages away from where they start.
  //
  // Admin sees it as well: admin can already do all of this, and is the one who
  // steps in for a week whose lead has not been settled or has gone quiet.
  // Being able to do a job and being shown where it starts should not differ.
  const amThisWeeksLead = !currentBreak && actsAsWeekLead(actor, leads, thisWeekKey);

  /**
   * Arranging a meeting and arranging its running order are not the same
   * right, and the card offers both.
   *
   * Finding an hour and asking everyone to confirm it belongs to whoever runs
   * the week. Ordering the presenters is a manager's as well -- a professor
   * could always do it, and simply had no way in from here, so they were sent
   * to find the page themselves.
   *
   * Each button is shown to whoever the action behind it will actually accept.
   * A card offering three things and refusing two of them would be worse than
   * not showing it.
   */
  const canRunTheWeek = !currentBreak && (actor.role === 'admin' || amThisWeeksLead);
  const canArrangeOrder = !currentBreak && (can(actor, 'arrangeOrder') || amThisWeeksLead);
  const iLeadThisWeek = canRunTheWeek || canArrangeOrder;

  const today = labDay(new Date());

  /**
   * What is on your own diary today: the lab's meetings you are part of, and
   * the hours you blocked out yourself.
   *
   * Only today, and only yours. A dashboard that reprints the calendar is a
   * worse calendar; what it can do that the calendar cannot is answer "is
   * there anything I am supposed to be at today" without leaving the page.
   */
  const myDay = [
    ...meetings
      .filter((meeting) => meeting.status !== 'cancelled')
      .map((meeting) => ({
        id: meeting.id,
        kind: 'meeting' as const,
        title: meeting.title,
        at: labInstant(meeting.start_at),
        href: `/meetings/${meeting.id}`,
      })),
    ...personalEvents
      .filter((event) => event.user_id === actor.id)
      .map((event) => ({
        id: event.id,
        kind: 'personal' as const,
        title: event.title,
        at: labInstant(event.start_at),
        href: '/meetings',
      })),
  ]
    .filter((item): item is typeof item & { at: Date } => item.at !== null && labDay(item.at) === today)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const myOpenTasks = tasks
    .filter(task => {
      const assignees = Array.isArray(task.assignee_ids) ? task.assignee_ids : (task.assignee_ids ? [task.assignee_ids as string] : []);
      return assignees.includes(actor.id) && task.status !== 'done';
    })
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

  /**
   * The meeting and the poll that settles one, hoisted so the two can change
   * places.
   *
   * A scheduled meeting is the first thing anybody opens this page for. Until
   * there is one, the thing that produces one is -- so when nothing is booked
   * the poll leads and the meeting card, which then has only "nothing
   * scheduled" to say, falls in behind it.
   */
  const meetingCard = (
    <section className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <h3 className="text-sm font-semibold text-gray-500">{t('dashboard.nextMeeting')}</h3>

      {upcoming ? (
        <>
          <p className="text-xl font-bold text-gray-900">{upcoming.title}</p>
          <p className="text-sm text-gray-600 tabular-nums">
            {formatLabTime(upcoming.start_at, locale)}
          </p>
          {upcoming.location && <p className="text-sm text-gray-500">{upcoming.location}</p>}
          <Link
            href={`/meetings/${upcoming.id}`}
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            {t('dashboard.openMeeting')}
          </Link>
        </>
      ) : currentBreak ? (
        <>
          <p className="text-xl font-bold text-gray-900">{t('dashboard.breakWeek', { name: currentBreak.name })}</p>
          <p className="text-sm text-gray-500">
            {(() => {
              const resumes = new Date(currentBreak.end_date);
              resumes.setUTCDate(resumes.getUTCDate() + 1);
              const formatter = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long' });
              return t('dashboard.breakResumes', { date: formatter.format(resumes) });
            })()}
          </p>
        </>
      ) : (
        <>
          <p className="text-xl font-bold text-gray-900">{t('dashboard.notScheduled')}</p>
          {canSchedule && (
            <Link
              href="/meetings"
              className="inline-block text-sm text-blue-600 hover:underline"
            >
              {t('dashboard.scheduleNow')}
            </Link>
          )}
        </>
      )}

      {/* The lead stands whether or not anything is scheduled, so this strip
          shows in both states above. */}
      {!currentBreak && (
        <div className="pt-3 border-t border-gray-100 space-y-2">
          {students.length === 0 ? (
            <p className="text-sm text-gray-500">
              <span className="text-gray-400">{t('rotation.title')}: </span>
              {t('rotation.noStudents')}
            </p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-gray-500">{t('rotation.title')}:</span>
                <span className="font-semibold text-gray-900">
                  {confirmedHost || suggested?.name}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    confirmedHost ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {confirmedHost ? t('rotation.confirmed') : t('rotation.suggested')}
                </span>
              </p>

              {lead?.user_id === actor.id && (
                <div className="pt-2">
                  <Link
                    href="/tasks/weekly"
                    className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition"
                  >
                    {t('weekly.recordProgress', { fallback: 'Record Weekly Progress' })}
                  </Link>
                </div>
              )}

              {canConfirm && (
                <HostPicker
                  weekKey={thisWeekKey}
                  students={students.map((student) => ({ id: student.id, name: student.name }))}
                  hostId={lead?.user_id ?? ''}
                  suggestedId={suggested?.id ?? ''}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  );

  const pollCard = awaiting.length > 0 ? (
    <section className="p-5 sm:p-6 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
      <div>
        <h3 className="font-semibold text-amber-900">{t('dashboard.awaitingYou')}</h3>
        <p className="text-sm text-amber-800">{t('dashboard.awaitingHint')}</p>
      </div>

      <ul className="space-y-2">
        {awaiting.map(({ poll, remaining }) => (
          <li key={poll.id}>
            <Link
              href={`/meetings/polls/${poll.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 bg-white rounded-lg border border-amber-200 hover:border-amber-400 transition"
            >
              <span className="font-medium text-gray-900 flex-1 min-w-48">{poll.title}</span>
              <span className="text-xs text-gray-500 tabular-nums">
                {t('dashboard.awaitingSlots', { n: remaining })}
              </span>
              <span className="text-sm font-medium text-blue-600">
                {t('dashboard.answerNow')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h2>
        {canSchedule && <NewMeetingButton />}
      </div>

      {/* Above the meeting, and the only notice that is. Somebody waiting on
          approval cannot use the app at all until an admin acts, so it is the
          one card whose cost of being scrolled past is measured in days of
          somebody else being locked out. */}
      {awaitingApproval.length > 0 && (
        <section className="p-5 sm:p-6 bg-purple-100 border border-gray-200 rounded-xl space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <h3 className="font-semibold text-purple-700">{t('pending.title')}</h3>
              <p className="text-sm text-gray-600">{t('pending.hint')}</p>
            </div>
            <Link href="/settings/users" className="text-sm text-blue-600 hover:underline">
              {t('pending.manage')}
            </Link>
          </div>

          <PendingUsers users={awaitingApproval} />
        </section>
      )}

      {/* Meeting first, or the poll that will produce one -- see above. */}
      {upcoming ? (
        <>
          {meetingCard}
          {pollCard}
        </>
      ) : (
        <>
          {pollCard}
          {meetingCard}
        </>
      )}

      {/* What the lead has to do this week, where they start the week rather
          than two pages into it. Not shown during a term break: there is no
          meeting to arrange. */}
      {iLeadThisWeek && (
        <section className="p-5 sm:p-6 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
          <div>
            {/* An admin is shown this because they can do it, not because it
                is their turn -- so it does not tell them it is. */}
            <h3 className="font-semibold text-blue-800">
              {t(amThisWeeksLead ? 'dashboard.yourLeadTurn' : 'dashboard.runThisWeek')}
            </h3>
            <p className="text-sm text-blue-700">
              {t(canRunTheWeek ? 'dashboard.yourLeadTurnHint' : 'dashboard.arrangeOnlyHint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* One way in: the grid. Picking a free block there already makes
                the poll, so a separate "create a poll" button was a second
                road to the same place, and the longer one. */}
            {canRunTheWeek && (
              <Link
                href="/meetings/polls#availability"
                className={PRIMARY_ACTION}
              >
                {t('dashboard.findFreeTime')}
              </Link>
            )}

            {canArrangeOrder && (
              <Link
                href="/presentations"
                className={canRunTheWeek ? SECONDARY_ACTION : PRIMARY_ACTION}
              >
                {t('dashboard.arrangeOrder')}
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Your place in the running order. Shown even when you have nothing
          down, because "you have not added a topic" is the more useful of the
          two answers in the days before a meeting. Not to a professor: they
          listen to the order rather than take a place in it. */}
      {!currentBreak && actor.role !== 'professor' && (
        <section className="p-5 sm:p-6 bg-white border border-gray-100 shadow-sm rounded-xl space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-semibold text-gray-900">{t('dashboard.yourTurn')}</h3>
            <Link href="/presentations" className="text-sm text-blue-600 hover:underline">
              {t('dashboard.seeFullOrder')}
            </Link>
          </div>

          {myTurn ? (
            <>
              {/* The number, not a sentence about the number. Being third is a
                  fact you want off the page in one glance, and "คุณนำเสนอเป็น
                  ลำดับที่ 3 จาก 5 คน" made you read eleven words to get it. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-blue-600 tabular-nums leading-none">
                    {myTurn.position}
                  </span>
                  <span className="text-sm text-gray-500 tabular-nums">
                    {t('dashboard.ofPresenters', { of: myTurn.outOf })}
                  </span>
                </p>

                {/* The queue itself. One mark per presenter, yours filled --
                    position and length in the same glance, without counting. */}
                <ol
                  className="flex flex-wrap items-center gap-1.5"
                  aria-label={t('dashboard.yourPosition', {
                    n: myTurn.position,
                    of: myTurn.outOf,
                  })}
                >
                  {Array.from({ length: myTurn.outOf }, (_, i) => (
                    <li
                      key={i}
                      className={
                        i + 1 === myTurn.position
                          ? 'h-2.5 w-6 rounded-full bg-blue-600'
                          : 'h-2.5 w-2.5 rounded-full bg-gray-300'
                      }
                    />
                  ))}
                </ol>
              </div>

              {/* The one other fact that decides when to get ready. */}
              <p className="text-sm text-gray-500">
                {myTurn.after
                  ? t('dashboard.afterPerson', { name: myTurn.after })
                  : t('dashboard.firstUp')}
              </p>

              <ul className="space-y-2">
                {myTurn.topics.map((topic) => (
                  <li
                    key={topic.id}
                    className="flex gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50"
                  >
                    {/* A dot, not a number -- the big number above is the
                        only one on this card that means anything. */}
                    <span className="shrink-0 mt-2 h-1.5 w-1.5 rounded-full bg-current text-gray-400" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 break-words">{topic.title}</p>
                      {topic.details && (
                        <p className="text-sm text-gray-500 whitespace-pre-line break-words">
                          {topic.details}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            /* Not a congratulation: nothing is down, which is different from
               everything being ready -- see CLAUDE.md. */
            <p className="text-sm text-gray-500">{t('dashboard.noTopicYet')}</p>
          )}
        </section>
      )}

      {myOpenTasks.length > 0 && (
        <section className="p-5 sm:p-6 bg-white border border-gray-100 shadow-sm rounded-xl space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <h3 className="font-semibold text-gray-900">{t('dashboard.myTasks')}</h3>
              <p className="text-sm text-gray-500">{t('dashboard.myTasksHint')}</p>
            </div>
            <Link href="/tasks" className="text-sm text-blue-600 hover:underline">
              {t('dashboard.total')}
            </Link>
          </div>

          <ul className="space-y-2">
            {myOpenTasks.map((task) => {
              // Both sides as lab days. Comparing a due date against the
              // server's `new Date()` made the badge a day late every morning
              // before 07:00, when UTC is still on yesterday.
              const overdue = Boolean(task.due_date) && task.due_date < today;
              return (
                <li key={task.id}>
                  <Link
                    href={`/tasks`}
                    className={`block p-4 rounded-xl border transition ${
                      overdue ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                      <span className={`font-semibold ${overdue ? 'text-red-900' : 'text-gray-900'}`}>
                        {task.title}
                      </span>
                      {task.due_date && (
                        <span className={`text-xs font-medium tabular-nums ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                          {t('tasks.due')}: {task.due_date} {overdue && t('tasks.overdue')}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {openFeedback > 0 && (
        <section className="p-5 sm:p-6 bg-white border border-gray-100 shadow-sm rounded-xl">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <h3 className="font-semibold text-gray-900">
                {t('dashboard.feedbackWaiting')} ({openFeedback})
              </h3>
              <p className="text-sm text-gray-500">{t('dashboard.feedbackWaitingHint')}</p>
            </div>
            <Link href="/feedback" className="text-sm text-blue-600 hover:underline">
              {t('dashboard.feedbackOpen')}
            </Link>
          </div>
        </section>
      )}

      {brokenCalendars.length > 0 && (
        <section className="p-5 sm:p-6 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div>
            <h3 className="font-semibold text-amber-900">{t('calendarBroken.title')}</h3>
            <p className="text-sm text-amber-800">{t('calendarBroken.hint')}</p>
          </div>

          <ul className="space-y-1.5">
            {brokenCalendars.map((row) => (
              <li
                key={row.userId}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
              >
                <span className="font-medium text-gray-900">{row.name}</span>
                <span className="text-gray-500">{row.accountEmail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {myDay.length > 0 && (
        <section className="p-5 sm:p-6 bg-white border border-gray-100 shadow-sm rounded-xl space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <h3 className="font-semibold text-gray-900">{t('dashboard.today')}</h3>
              <p className="text-sm text-gray-500">{t('dashboard.todayHint')}</p>
            </div>
            <Link href="/meetings" className="text-sm text-blue-600 hover:underline">
              {t('dashboard.openCalendar')}
            </Link>
          </div>

          <ul className="space-y-2">
            {myDay.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.href}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:border-gray-300 transition"
                >
                  <span className="text-sm font-semibold text-gray-700 tabular-nums">
                    {formatLabClock(item.at.toISOString(), locale)}
                  </span>
                  <span className="flex-1 min-w-40 text-gray-900">{item.title}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      item.kind === 'meeting'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}
                  >
                    {t(item.kind === 'meeting' ? 'dashboard.kindMeeting' : 'dashboard.kindPersonal')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Answered, but still open: quieter than the amber card above, because
          it is not something to do -- it is somewhere to go back to. */}
      {answered.length > 0 && (
        <section className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-500">{t('dashboard.answeredPolls')}</h3>
            <p className="text-sm text-gray-500">{t('dashboard.answeredHint')}</p>
          </div>

          <ul className="space-y-2">
            {answered.map(({ poll }) => (
              <li key={poll.id}>
                <Link
                  href={`/meetings/polls/${poll.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 rounded-lg border border-gray-200 hover:border-gray-400 transition"
                >
                  <span className="font-medium text-gray-900 flex-1 min-w-48">{poll.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                    {t('polls.myDone')}
                  </span>
                  <span className="text-sm font-medium text-blue-600">
                    {t('dashboard.editAnswer')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What the card above does not already show */}
      {restOfWeek.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">{t('dashboard.restOfWeek')}</h3>

          <ul className="space-y-2">
            {restOfWeek.map((meeting) => (
              <li key={meeting.id}>
                <Link
                  href={`/meetings/${meeting.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-gray-300 transition"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-semibold text-gray-900 flex-1 min-w-48">
                      {meeting.title}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {formatLabTime(meeting.start_at, locale)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}
