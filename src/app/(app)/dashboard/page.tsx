import InfoTip from '@/lib/ui/info-tip';
import PageHeader from '@/lib/ui/page-header';
import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { canAddTopic, requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import {
  activeWeekKey,
  leadForWeek,
  meetingsInWeek,
  nextMeeting,
  rotationMembers,
  suggestNextHost,
} from '@/lib/rotation';
import HostPicker from './host-picker';
import PendingUsers from './pending-users';
import { autoAssignWeekLead } from '../meetings/actions';
import { formatLabClock, formatLabTime, labDay } from '@/lib/lab-time';
import { openPolls, pollProgress } from '@/lib/poll-tally';
import { weekKey } from '@/lib/week';
import CopyLinkButton from '@/lib/ui/copy-link-button';
import { brokenConnections, getConnectedUserIds, googleOAuthConfigured } from '@/lib/google/tokens';
import { busyTimes } from '@/lib/google/calendar';
import { weekDays } from '@/lib/calendar-share';
import { needsBusyTimes } from '@/lib/busy-nudge';
import BusyTimeNudge from './busy-time-nudge';
import { breakForWeek } from '@/lib/term-breaks';
import { isMember, memberIds, pollVoters } from '@/lib/members';
import { intlLocale } from '@/lib/ui/i18n';
import { effectiveTopicOrder, groupByPresenter, topicsForWeek } from '@/lib/presentation-order';
import { actsAsWeekLead } from '@/lib/rotation';
import { labInstant } from '@/lib/lab-time';
import { can } from '@/lib/permissions';
import { taskTitles } from '@/lib/task-title';
import { daysBetween } from '@/lib/tracker';
import { facesOf } from '@/lib/avatar-face';
import { Avatar } from '@/lib/ui/avatar';
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
import { displayPollTitle, pollWhenLabel } from '@/lib/poll-title';

/**
 * The lead's buttons. Big enough to hit on a tablet (44px) and a clear step
 * apart: the one thing to do next is solid, anything after it is outlined.
 * The shared button classes, at their large size -- see globals.css.
 */
export default async function DashboardPage() {
  // Started with everything else so it rides in the same batched read, rather
  // than waiting for the role and then making a round trip of its own. Only an
  // admin's page ever looks at the answer -- see brokenCalendars below.
  const brokenCalendarsRead = brokenConnections().catch(() => []);
  // Same tab, same batched read -- see busyNudge below.
  const connectedRead = getConnectedUserIds().catch(() => new Set<string>());

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
      ? (await brokenCalendarsRead).map((row) => ({
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
  // An admin previewing a role sees that role's dashboard: previewing a
  // student has to show the polls a student is asked to answer, or the
  // preview reads as "students get no polls" when they do.
  const iAmAVoter = actor.previewing ? actor.role === 'student' : memberIds(users).has(actor.id);
  const canConfirm = actor.role === 'admin';

  /**
   * Every open poll, as the whole lab needs to read it: what time it puts
   * forward, how many of the people asked have answered, and who has not.
   *
   * This used to be two cards for the voter alone -- "waiting for you" and
   * "you answered" -- while the meeting card above them said "not scheduled",
   * as if nothing were under way. A proposed time *is* the state of the next
   * meeting, so it now sits in that card, with who is still to answer by
   * name: the lead needs to know whom to chase, and everybody else whether
   * the time is settled.
   */
  const voterIdList = pollVoters(users).map((user) => user.id);
  const labPolls = openPolls(polls, slots, votes, actor.id, new Date(), meetings).map(({ poll, remaining }) => {
    const pollSlots = slots
      .filter((slot) => slot.poll_id === poll.id)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
    const { done, waiting } = pollProgress(poll.id, slots, votes, voterIdList);
    return {
      id: poll.id,
      title: displayPollTitle(poll.title, pollSlots, locale),
      // One slot reads as the time itself; several as how many were offered.
      when: pollSlots.length === 1 ? pollWhenLabel(pollSlots[0].start_at, pollSlots[0].end_at, locale) : '',
      slotCount: pollSlots.length,
      done: done.length,
      total: voterIdList.length,
      waiting,
      myRemaining: iAmAVoter ? remaining : 0,
    };
  });

  // Somebody whose hours the grid cannot see looks free all week, and the lead
  // books over their lecture. Asked of every member, professors included --
  // their hours shape the choice too -- and of a previewed member role.
  const iAmAMember = actor.previewing
    ? actor.role === 'student' || actor.role === 'professor'
    : users.some((user) => user.id === actor.id && isMember(user));
  // A connected calendar answers only with something in it this week, so it
  // is read -- one freebusy call, and only for a member who is connected.
  const connectedIds = await connectedRead;
  const myConnected = iAmAMember && connectedIds.has(actor.id);
  const thisWeekDays = weekDays(thisWeekKey);
  const googleBusy =
    myConnected && thisWeekDays.length === 7
      ? await busyTimes(
          actor.id,
          new Date(thisWeekDays[0]).toISOString(),
          new Date(thisWeekDays[6] + 24 * 60 * 60 * 1000).toISOString()
        ).catch(() => null)
      : null;
  const busyNudge =
    iAmAMember &&
    needsBusyTimes({
      userId: actor.id,
      week: thisWeekKey,
      isBreak: Boolean(currentBreak),
      meetings,
      personalEvents,
      connected: connectedIds,
      googleBusy,
      // Lab-wide, not just polls this reader votes in: once any poll is out,
      // the hours have been picked.
      openPollCount: labPolls.length,
    });
  // Where you come in this week's meeting, and what you are down to show.
  // The order itself lives on /presentations; what belongs here is the one
  // line about it that concerns the person reading -- being third is something
  // you want to know without going to look.
  const weekTopics = topicsForWeek(allTopics, thisWeekKey);
  const weekOrder = effectiveTopicOrder(weekTopics);
  const presenters = groupByPresenter(weekOrder.ordered);
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

  /**
   * The weekly progress record is written after the meeting, by whoever led
   * that week. The button used to sit in the meeting card from Monday on, the
   * loudest thing on the page days before there was anything to record.
   *
   * It is due once a meeting has ended, and stays until the lab's week turns
   * over -- not just until the board rolls on to the next lead a day later,
   * which is too short a window for a write-up.
   */
  const now = new Date();
  const recordDue = meetings.some(
    (meeting) =>
      meeting.status !== 'cancelled' &&
      Boolean(meeting.start_at && meeting.end_at) &&
      new Date(meeting.end_at) <= now &&
      weekKey(new Date(meeting.start_at)) === weekKey(now) &&
      leadForWeek(leads, weekKey(new Date(meeting.start_at)))?.user_id === actor.id
  );

  /**
   * The week's meeting, if one is booked: the first step of the lead's list.
   * Matched by the week it falls in rather than taken as `upcoming`, which
   * may already be next week's.
   */
  const weekMeeting = meetings.find(
    (meeting) =>
      meeting.status !== 'cancelled' &&
      Boolean(meeting.start_at) &&
      weekKey(new Date(meeting.start_at)) === thisWeekKey
  );

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

  const taskTitle = taskTitles(tasks);
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
  // How soon, in the words people use: today, tomorrow, in three days.
  const upcomingAt = upcoming ? labInstant(upcoming.start_at) : null;
  const daysToGo = upcomingAt ? daysBetween(today, labDay(upcomingAt)) : null;
  const soon =
    daysToGo === null
      ? ''
      : daysToGo <= 0
        ? t('dashboard.meetingToday')
        : daysToGo === 1
          ? t('dashboard.meetingTomorrow')
          : t('dashboard.meetingInDays', { n: daysToGo });
  // Nothing booked and something proposed: the proposal is the news.
  const heroShowsPolls = !upcoming && !currentBreak && labPolls.length > 0;

  /**
   * Each open poll: the time, how far the answers have got, who is still
   * silent, and the one button that is this reader's next step -- answer it,
   * go and confirm it, or change an answer. `large` when it stands in for the
   * meeting at the top of the page.
   */
  const pollRows = (large: boolean) => (
    <ul className="space-y-4">
      {labPolls.map((p) => {
        const label =
          p.myRemaining > 0
            ? 'dashboard.answerPoll'
            : canRunTheWeek
              ? 'dashboard.goConfirm'
              : iAmAVoter
                ? 'dashboard.editAnswer'
                : 'dashboard.viewPoll';
        const primary = p.myRemaining > 0 || canRunTheWeek;
        return (
          <li key={p.id} className="space-y-2">
            <p
              className={
                large
                  ? 'text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums leading-tight'
                  : 'font-semibold text-gray-900'
              }
            >
              {p.when || p.title}
            </p>
            {!p.when && <p className="text-sm text-gray-500">{t('dashboard.pollSlots', { n: p.slotCount })}</p>}

            {/* "6/6" and "everyone has answered" are the same fact; once it
                is true, the words say it and the count steps aside. */}
            <p className="text-sm text-gray-700 tabular-nums">
              {p.waiting.length > 0 ? (
                <span className="font-semibold">{t('dashboard.pollProgress', { done: p.done, total: p.total })}</span>
              ) : (
                <span className="font-semibold text-green-700">{t('dashboard.pollAllAnswered')}</span>
              )}
              {p.myRemaining > 0 && (
                <span className="text-amber-800"> · {t('polls.myRemaining', { count: p.myRemaining })}</span>
              )}
            </p>

            {p.waiting.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-500">{t('dashboard.pollWaitingFor')}</span>
                {p.waiting.map((id) => (
                  <span key={id} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {id === actor.id ? t('dashboard.you') : nameOf(id)}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={`/meetings/polls/${p.id}`}
                className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              >
                {t(label)}
              </Link>
              {/* Chasing the silent is the lead's job, so the lead gets the
                  link to send them. */}
              {canRunTheWeek && (
                <CopyLinkButton
                  path={`/meetings/polls/${p.id}`}
                  label="polls.share"
                  message="polls.shareText"
                  vars={{ title: p.title }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const faces = facesOf(users);
  const leadFace = lead ? faces.get(lead.user_id) : suggested ? faces.get(suggested.id) : undefined;

  /**
   * The card the page exists for, drawn to look it: a band of accent down its
   * side, and when -- the day and the hour -- as the largest thing on the
   * screen. It used to be a white card like the four below it, with the time
   * in small grey type under the meeting's name, so the one fact everybody
   * opens the page for was the easiest to miss.
   */
  const meetingCard = (
    <section className="dash-hero p-5 sm:p-6 rounded-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold dash-hero-eyebrow">{t('dashboard.nextMeeting')}</h3>
        {upcoming && soon && (
          <span className="dash-hero-chip" data-today={daysToGo !== null && daysToGo <= 0 ? '' : undefined}>
            {soon}
          </span>
        )}
        {heroShowsPolls && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-800">
            {t('dashboard.pollPending')}
          </span>
        )}
      </div>

      {upcoming ? (
        <>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums leading-tight">
            {formatLabTime(upcoming.start_at, locale)}
          </p>
          <p className="text-base font-medium text-gray-700">{upcoming.title}</p>
          {upcoming.location && <p className="text-sm text-gray-500">{upcoming.location}</p>}
          <Link href={`/meetings/${upcoming.id}`} className="btn btn-secondary btn-sm">
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
      ) : heroShowsPolls ? (
        pollRows(true)
      ) : (
        // No "schedule" link here: whoever may arrange the meeting has the
        // week's card below, whose button starts it the usual way.
        <p className="text-xl font-bold text-gray-900">{t('dashboard.notScheduled')}</p>
      )}

      {/* The lead stands whether or not anything is scheduled, so this strip
          shows in both states above. */}
      {!currentBreak && (
        <div className="pt-3 border-t border-gray-100 space-y-2">
          {students.length === 0 ? (
            <p className="text-sm text-gray-500">
              <span className="text-gray-500">{t('rotation.title')}: </span>
              {t('rotation.noStudents')}
            </p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-gray-500">{t('rotation.title')}:</span>
                {leadFace && <Avatar person={leadFace} />}
                <span className="font-semibold text-gray-900">
                  {lead?.user_id === actor.id ? t('dashboard.you') : confirmedHost || suggested?.name}
                </span>
                {/* Only the exception is marked. Leads are assigned
                    automatically now, so "confirmed" sat beside nearly every
                    name and said nothing; "suggested" still means something. */}
                {!confirmedHost && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-800">
                    {t('rotation.suggested')}
                  </span>
                )}
              </p>

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

  // With a meeting already booked, an open poll (next week's, usually) still
  // needs answering: its own card under the meeting, amber while it is
  // waiting on you.
  const pollCard =
    upcoming && labPolls.length > 0 ? (
      <section
        className={`p-5 sm:p-6 rounded-xl space-y-3 border ${
          labPolls.some((p) => p.myRemaining > 0)
            ? 'bg-amber-50 border-amber-200'
            : 'bg-white border-gray-100 shadow-sm'
        }`}
      >
        <h3 className="font-semibold text-gray-900">{t('dashboard.openPolls')}</h3>
        {pollRows(false)}
      </section>
    ) : null;

  /**
   * What the lead has to do this week, as a list that says how far each part
   * has got. It was a sentence and two buttons that looked the same on
   * Monday as on Friday -- "arrange the meeting" stayed the loudest thing
   * on the page after the poll was already out.
   *
   * Each step says its state, and the first unfinished one with something to
   * press gets the one primary button, so the next thing to do is the thing
   * that stands out.
   */
  type StepState = 'done' | 'doing' | 'todo';
  type Step = { key: string; label: string; state: StepState; text: string; action?: { href: string; label: string } | 'share-order' };
  const steps: Step[] = [];
  if (iLeadThisWeek && canRunTheWeek) {
    const poll = labPolls[0];
    steps.push(
      weekMeeting
        ? { key: 'schedule', label: t('dashboard.step.schedule'), state: 'done', text: t('dashboard.step.scheduled', { when: formatLabTime(weekMeeting.start_at, locale) }) }
        : poll
          ? {
              key: 'schedule',
              label: t('dashboard.step.schedule'),
              state: 'doing',
              text: poll.waiting.length > 0 ? t('dashboard.step.polling', { n: poll.waiting.length }) : t('dashboard.step.pollAnswered'),
              // The card above already carries this poll's button.
              action: heroShowsPolls ? undefined : { href: `/meetings/polls/${poll.id}`, label: t('dashboard.goConfirm') },
            }
          : {
              key: 'schedule',
              label: t('dashboard.step.schedule'),
              state: 'todo',
              text: t('dashboard.step.notStarted'),
              action: { href: '/meetings/polls#availability', label: t('dashboard.findFreeTime') },
            }
    );
  }
  if (iLeadThisWeek && canArrangeOrder) {
    steps.push(
      weekTopics.length === 0
        ? { key: 'order', label: t('dashboard.step.order'), state: 'todo', text: t('dashboard.step.noTopics'), action: 'share-order' }
        : weekOrder.custom
          ? { key: 'order', label: t('dashboard.step.order'), state: 'done', text: t('dashboard.step.ordered', { n: weekTopics.length }) }
          : {
              key: 'order',
              label: t('dashboard.step.order'),
              state: 'doing',
              text: t('dashboard.step.topics', { n: weekTopics.length, people: presenters.length }),
              action: { href: '/presentations', label: t('dashboard.arrangeOrder') },
            }
    );
  }
  if (recordDue) {
    steps.push({
      key: 'record',
      label: t('dashboard.step.record'),
      state: 'todo',
      text: t('dashboard.step.recordDue'),
      action: { href: '/tasks/weekly', label: t('weekly.recordProgress') },
    });
  }
  const primaryStep = steps.find((step) => step.state !== 'done' && typeof step.action === 'object')?.key;
  const STEP_MARK: Record<StepState, { mark: string; className: string; label: string }> = {
    done: { mark: '✓', className: 'bg-green-50 text-green-700', label: t('dashboard.step.done') },
    doing: { mark: '…', className: 'bg-amber-50 text-amber-800', label: t('dashboard.step.inProgress') },
    todo: { mark: '○', className: 'bg-gray-100 text-gray-500', label: t('dashboard.step.todo') },
  };

  return (
    <div className="space-y-6">
      {/* One way to arrange the week from here: the grid, in the week's card
          below. Admin also had "+ Schedule meeting" in this header and a link
          in the meeting card -- three buttons with nearly one name, one of
          which skips the poll. Booking outright stays on /meetings. */}
      <PageHeader title={t('dashboard.title')} />

      {/* Above the meeting, and the only notice that is. Somebody waiting on
          approval cannot use the app at all until an admin acts, so it is the
          one card whose cost of being scrolled past is measured in days of
          somebody else being locked out. */}
      {awaitingApproval.length > 0 && (
        <section className="p-5 sm:p-6 bg-purple-100 border border-gray-200 rounded-xl space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-purple-700">{t('pending.title')}</h3>
              <InfoTip>{t('pending.hint')}</InfoTip>
            </div>
            <Link href="/settings/users" className="text-sm text-blue-600 hover:underline">
              {t('pending.manage')}
            </Link>
          </div>

          <PendingUsers users={awaitingApproval} />
        </section>
      )}

      {/* The meeting, or the poll that will produce one, in the same card;
          a poll for a later week below it. */}
      {meetingCard}
      {pollCard}

      {busyNudge && <BusyTimeNudge week={thisWeekKey} canConnect={googleOAuthConfigured() && !myConnected} />}

      {/* What the lead has to do this week, where they start the week rather
          than two pages into it. Not shown during a term break: there is no
          meeting to arrange. */}
      {steps.length > 0 && (
        <section className="p-5 sm:p-6 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
          <div className="flex items-center gap-1.5">
            {/* An admin is shown this because they can do it, not because it
                is their turn -- so it does not tell them it is. */}
            <h3 className="font-semibold text-blue-800">
              {t(
                !iLeadThisWeek
                  ? 'dashboard.afterMeeting'
                  : amThisWeeksLead
                    ? 'dashboard.yourLeadTurn'
                    : 'dashboard.runThisWeek'
              )}
            </h3>
            {iLeadThisWeek && (
              <InfoTip>{t(canRunTheWeek ? 'dashboard.yourLeadTurnHint' : 'dashboard.arrangeOnlyHint')}</InfoTip>
            )}
          </div>

          <ol>
            {steps.map((step, i) => {
              const mark = STEP_MARK[step.state];
              return (
                <li
                  key={step.key}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 ${i > 0 ? 'border-t border-blue-200' : ''}`}
                >
                  <span
                    className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${mark.className}`}
                    title={mark.label}
                  >
                    <span aria-hidden="true">{mark.mark}</span>
                    <span className="sr-only">{mark.label}</span>
                  </span>
                  <div className="flex-1 min-w-40">
                    <p className="font-medium text-gray-900">{step.label}</p>
                    <p className="text-sm text-gray-600">{step.text}</p>
                  </div>
                  {step.action === 'share-order' ? (
                    <CopyLinkButton
                      path={`/presentations?week=${thisWeekKey}`}
                      label="presentations.share"
                      message="presentations.shareText"
                      vars={{ week: thisWeekKey }}
                    />
                  ) : step.action ? (
                    <Link
                      href={step.action.href}
                      className={`btn ${step.key === primaryStep ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    >
                      {step.action.label}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ol>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-500">{t('dashboard.noTopicYet')}</p>
              {/* Straight to the form: the empty card used to point only at
                  the whole order, where the add button had to be found again. */}
              {canAddTopic(actor) && (
                <Link href="/presentations?add=1" className="btn btn-secondary btn-sm">
                  {t('dashboard.addMyTopic')}
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {myOpenTasks.length > 0 && (
        <section className="p-5 sm:p-6 bg-white border border-gray-100 shadow-sm rounded-xl space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-gray-900">{t('dashboard.myTasks')}</h3>
                <InfoTip>{t('dashboard.myTasksHint')}</InfoTip>
              </div>
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
                        {taskTitle(task)}
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
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-gray-900">
                {t('dashboard.feedbackWaiting')} ({openFeedback})
              </h3>
              <InfoTip>{t('dashboard.feedbackWaitingHint')}</InfoTip>
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
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-gray-900">{t('dashboard.today')}</h3>
                <InfoTip>{t('dashboard.todayHint')}</InfoTip>
              </div>
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
