import { desiredCheckInReminder, desiredFocusBlockReminders, desiredFollowUpReminder, desiredHourlyCheckInReminders, diffReminders } from '../reminderEngine';
import { createSamplePreferences } from '../../data/sampleData';
import { buildHourlyGrid } from '../../hourly/hourlyEngine';
import { DEFAULT_HOURLY_SETTINGS } from '../../hourly/types';
import type { HourlyEntry } from '../../hourly/types';
import type { PlanVersion } from '../../planning/types';
import type { InterviewEntry } from '../../prep/types';
import type { ScheduledReminder } from '../types';

function makePlan(blocks: PlanVersion['blocks']): PlanVersion {
  return {
    id: 'p1',
    version: 1,
    date: '2026-10-07',
    status: 'accepted',
    blocks,
    unscheduledTasks: [],
    atRiskTasks: [],
    changes: [],
    explanations: [],
    createdAt: '2026-10-07T06:00:00.000Z',
  };
}

const NOW = '2026-10-07T06:00:00.000Z';

describe('desiredFocusBlockReminders', () => {
  it('computes a reminder starting `leadMinutes` before each future task block', () => {
    const plan = makePlan([
      { id: 'b1', kind: 'task', taskId: 't1', title: 'Write report', start: '2026-10-07T10:00:00.000Z', end: '2026-10-07T11:00:00.000Z', flexibility: 'flexible', reason: '' },
    ]);
    const reminders = desiredFocusBlockReminders(plan, NOW, 10);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].refId).toBe('t1');
    expect(reminders[0].scheduledFor).toBe('2026-10-07T09:50:00.000Z');
  });

  it('excludes blocks that would fire in the past relative to now', () => {
    const plan = makePlan([
      { id: 'b1', kind: 'task', taskId: 't1', title: 'Already happening', start: '2026-10-07T06:05:00.000Z', end: '2026-10-07T07:00:00.000Z', flexibility: 'flexible', reason: '' },
    ]);
    // lead time pushes the reminder to 05:55, before NOW (06:00) -> excluded.
    const reminders = desiredFocusBlockReminders(plan, NOW, 10);
    expect(reminders).toHaveLength(0);
  });

  it('ignores non-task blocks (meals, breaks, fixed commitments)', () => {
    const plan = makePlan([
      { id: 'b1', kind: 'meal', title: 'Lunch', start: '2026-10-07T12:00:00.000Z', end: '2026-10-07T12:30:00.000Z', flexibility: 'protected', reason: '' },
      { id: 'b2', kind: 'break', title: 'Break', start: '2026-10-07T12:30:00.000Z', end: '2026-10-07T12:40:00.000Z', flexibility: 'flexible', reason: '' },
    ]);
    expect(desiredFocusBlockReminders(plan, NOW, 10)).toHaveLength(0);
  });
});

describe('diffReminders — dedup and rescheduling on plan revision', () => {
  it('leaves an unchanged reminder alone (no cancel, no recreate)', () => {
    const existing: ScheduledReminder[] = [
      { id: 'r1', kind: 'focus_block', refId: 't1', scheduledFor: '2026-10-07T09:50:00.000Z', notificationId: 'n1', title: '', body: '', createdAt: NOW },
    ];
    const desired = [{ kind: 'focus_block' as const, refId: 't1', scheduledFor: '2026-10-07T09:50:00.000Z', title: '', body: '' }];

    const diff = diffReminders(desired, existing, ['focus_block']);
    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toCancel).toHaveLength(0);
    expect(diff.unchanged.map((r) => r.id)).toEqual(['r1']);
  });

  it('reschedules a reminder whose task moved to a new time after a replan', () => {
    const existing: ScheduledReminder[] = [
      { id: 'r1', kind: 'focus_block', refId: 't1', scheduledFor: '2026-10-07T09:50:00.000Z', notificationId: 'n1', title: '', body: '', createdAt: NOW },
    ];
    const desired = [{ kind: 'focus_block' as const, refId: 't1', scheduledFor: '2026-10-07T11:20:00.000Z', title: '', body: '' }];

    const diff = diffReminders(desired, existing, ['focus_block']);
    expect(diff.toCancel.map((r) => r.id)).toEqual(['r1']);
    expect(diff.toCreate).toHaveLength(1);
    expect(diff.toCreate[0].scheduledFor).toBe('2026-10-07T11:20:00.000Z');
  });

  it('cancels a reminder for a task no longer in the plan (deferred or completed)', () => {
    const existing: ScheduledReminder[] = [
      { id: 'r1', kind: 'focus_block', refId: 't1', scheduledFor: '2026-10-07T09:50:00.000Z', notificationId: 'n1', title: '', body: '', createdAt: NOW },
    ];
    const diff = diffReminders([], existing, ['focus_block']);
    expect(diff.toCancel.map((r) => r.id)).toEqual(['r1']);
    expect(diff.toCreate).toHaveLength(0);
  });

  it('creates a reminder for a newly-added task block', () => {
    const desired = [{ kind: 'focus_block' as const, refId: 't2', scheduledFor: '2026-10-07T14:00:00.000Z', title: '', body: '' }];
    const diff = diffReminders(desired, [], ['focus_block']);
    expect(diff.toCreate).toHaveLength(1);
    expect(diff.toCancel).toHaveLength(0);
  });

  it('never touches reminders of a kind outside the requested scope', () => {
    const existing: ScheduledReminder[] = [
      { id: 'follow1', kind: 'follow_up', refId: 'interview1', scheduledFor: '2026-10-08T09:00:00.000Z', notificationId: 'n2', title: '', body: '', createdAt: NOW },
    ];
    // Resyncing focus_block reminders with nothing desired must not cancel the unrelated follow-up reminder.
    const diff = diffReminders([], existing, ['focus_block']);
    expect(diff.toCancel).toHaveLength(0);
  });
});

describe('desiredFollowUpReminder', () => {
  const interview: InterviewEntry = {
    id: 'i1',
    company: 'Acme',
    role: 'Engineer',
    stage: 'phone_screen',
    outcome: 'pending',
    followUpDate: '2026-10-10',
    followUpDone: false,
    questionsAsked: [],
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('builds a reminder for the follow-up date at the given local time', () => {
    const reminder = desiredFollowUpReminder(interview, '09:00', NOW);
    expect(reminder?.refId).toBe('i1');
    expect(reminder?.kind).toBe('follow_up');
  });

  it('returns null once the follow-up has been marked done', () => {
    expect(desiredFollowUpReminder({ ...interview, followUpDone: true }, '09:00', NOW)).toBeNull();
  });

  it('returns null when there is no follow-up date set', () => {
    expect(desiredFollowUpReminder({ ...interview, followUpDate: undefined }, '09:00', NOW)).toBeNull();
  });

  it('returns null instead of a past-due reminder — this exact case crashed native scheduling on iOS', () => {
    // Follow-up date is "today", but the local time-of-day (09:00) has
    // already passed relative to `now` (which is 06:00 on the SAME day in
    // UTC, but the interview's follow-up date is set to a day already
    // behind `now`'s local calendar day here to force the past-due case).
    const pastDue = desiredFollowUpReminder({ ...interview, followUpDate: '2026-10-06' }, '09:00', NOW);
    expect(pastDue).toBeNull();
  });
});

describe('desiredHourlyCheckInReminders', () => {
  const localISO = (literal: string) => new Date(literal).toISOString();
  const DATE = '2026-10-07';
  const preferences = createSamplePreferences(); // wake 07:00, sleep 23:00

  it('builds one reminder per eligible, unanswered hour at the default 60-minute cadence', () => {
    const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true };
    const slots = buildHourlyGrid(DATE, null, preferences);
    const now = localISO(`${DATE}T06:00:00`);
    const reminders = desiredHourlyCheckInReminders(DATE, slots, settings, preferences, [], now);

    // One per awake hour (07:00-23:00, 16 hours), each a single sub-slot at the top of the hour.
    expect(reminders).toHaveLength(16);
    const nineAm = reminders.find((r) => r.refId === `${DATE}:9:0`);
    expect(nineAm?.scheduledFor).toBe(localISO(`${DATE}T09:00:00`));
  });

  it('skips an hour that has already been responded to', () => {
    const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true };
    const slots = buildHourlyGrid(DATE, null, preferences);
    const now = localISO(`${DATE}T06:00:00`);
    const entries: HourlyEntry[] = [
      { id: 'hourly:x', date: DATE, hour: 9, pastChoice: 'followed_plan', respondedAt: now, createdAt: now, updatedAt: now },
    ];
    const reminders = desiredHourlyCheckInReminders(DATE, slots, settings, preferences, entries, now);
    expect(reminders.some((r) => r.refId.startsWith(`${DATE}:9:`))).toBe(false);
  });

  it('returns nothing while disabled', () => {
    const slots = buildHourlyGrid(DATE, null, preferences);
    const reminders = desiredHourlyCheckInReminders(DATE, slots, DEFAULT_HOURLY_SETTINGS, preferences, [], localISO(`${DATE}T06:00:00`));
    expect(reminders).toHaveLength(0);
  });

  it('builds two sub-slot reminders per hour when the frequency is 30 minutes', () => {
    const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true, frequencyMinutes: 30 as const };
    const slots = buildHourlyGrid(DATE, null, preferences);
    const now = localISO(`${DATE}T06:00:00`);
    const reminders = desiredHourlyCheckInReminders(DATE, slots, settings, preferences, [], now);
    const nineAm = reminders.filter((r) => r.refId.startsWith(`${DATE}:9:`));
    expect(nineAm).toHaveLength(2);
    expect(nineAm.map((r) => r.scheduledFor).sort()).toEqual(
      [localISO(`${DATE}T09:00:00`), localISO(`${DATE}T09:30:00`)].sort()
    );
  });

  it('round-trips through diffReminders without duplicates when re-derived unchanged', () => {
    const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true };
    const slots = buildHourlyGrid(DATE, null, preferences);
    const now = localISO(`${DATE}T06:00:00`);
    const desired = desiredHourlyCheckInReminders(DATE, slots, settings, preferences, [], now);

    const existing: ScheduledReminder[] = desired.map((d, i) => ({
      id: `r${i}`,
      kind: d.kind,
      refId: d.refId,
      scheduledFor: d.scheduledFor,
      notificationId: `n${i}`,
      title: d.title,
      body: d.body,
      createdAt: now,
    }));

    const diff = diffReminders(desired, existing, ['hourly_checkin']);
    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toCancel).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(desired.length);
  });

  it('cancels an hour\'s reminder once that hour becomes answered, and leaves the rest alone', () => {
    const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true };
    const slots = buildHourlyGrid(DATE, null, preferences);
    const now = localISO(`${DATE}T06:00:00`);
    const before = desiredHourlyCheckInReminders(DATE, slots, settings, preferences, [], now);
    const existing: ScheduledReminder[] = before.map((d, i) => ({
      id: `r${i}`,
      kind: d.kind,
      refId: d.refId,
      scheduledFor: d.scheduledFor,
      notificationId: `n${i}`,
      title: d.title,
      body: d.body,
      createdAt: now,
    }));

    const entries: HourlyEntry[] = [
      { id: 'hourly:x', date: DATE, hour: 9, pastChoice: 'followed_plan', respondedAt: now, createdAt: now, updatedAt: now },
    ];
    const after = desiredHourlyCheckInReminders(DATE, slots, settings, preferences, entries, now);
    const diff = diffReminders(after, existing, ['hourly_checkin']);
    expect(diff.toCancel.map((r) => r.refId)).toEqual([`${DATE}:9:0`]);
    expect(diff.toCreate).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(before.length - 1);
  });
});

describe('desiredCheckInReminder', () => {
  it('builds a reminder for today at the given local time when still in the future', () => {
    const reminder = desiredCheckInReminder('morning_checkin', '2026-10-07', '08:00', 'Morning check-in', '2026-10-07T00:00:00.000Z');
    expect(reminder).not.toBeNull();
    expect(reminder?.refId).toBe('2026-10-07');
  });

  it('returns null for a time of day that has already passed today — regression for ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE', () => {
    // Reproduces the exact bug: enabling reminders at 21:00 with a fixed
    // "08:00" daily check-in time used to build a reminder for a moment
    // already 13 hours in the past. On iOS that trigger throws natively
    // instead of just failing to fire (DATE triggers are implemented as
    // UNTimeIntervalNotificationTrigger, which requires a positive
    // interval) — this must never reach the scheduler in the first place.
    const reminder = desiredCheckInReminder('morning_checkin', '2026-10-07', '08:00', 'Morning check-in', '2026-10-07T21:00:00.000Z');
    expect(reminder).toBeNull();
  });

  it('returns null for a time right at the edge of "now" (inside the safety lead)', () => {
    const reminder = desiredCheckInReminder('evening_review', '2026-10-07', '20:30', 'Evening review', '2026-10-07T20:29:59.000Z');
    expect(reminder).toBeNull();
  });
});
