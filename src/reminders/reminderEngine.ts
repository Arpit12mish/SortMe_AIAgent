import { isScheduledOn } from '../habits/habitEngine';
import type { HabitCheckIn, HabitDefinition } from '../habits/types';
import { findHourlyEntry, isHourEligibleForCheckIn, type HourSlot } from '../hourly/hourlyEngine';
import type { HourlyCheckInSettings, HourlyEntry } from '../hourly/types';
import { addMinutesToISO, dateAndTimeToISO } from '../planning/time';
import type { ISODate, ISODateTime, PlanVersion, Preferences, TimeString } from '../planning/types';
import type { InterviewEntry } from '../prep/types';
import type { ReminderKind, ScheduledReminder } from './types';

export function reminderKey(kind: ReminderKind, refId: string): string {
  return `${kind}:${refId}`;
}

export interface DesiredReminder {
  kind: ReminderKind;
  refId: string;
  scheduledFor: ISODateTime;
  title: string;
  body: string;
}

/**
 * A trigger time at or before "now" isn't just pointless to schedule — on
 * iOS it's a guaranteed native crash: a DATE trigger is implemented as
 * `UNTimeIntervalNotificationTrigger(timeInterval: date.timeIntervalSinceNow)`,
 * which throws for any non-positive interval (see TriggerRecords.swift in
 * expo-notifications). A fixed daily time like "08:00 today" is very
 * naturally in the past by the time a reminder is turned on later in the
 * day, so every builder below filters on this — not just the one for
 * upcoming plan blocks, which happens to be in the future by construction.
 */
const MIN_LEAD_MS = 3_000;

function isSufficientlyFuture(scheduledFor: ISODateTime, nowIso: ISODateTime): boolean {
  return new Date(scheduledFor).getTime() - new Date(nowIso).getTime() > MIN_LEAD_MS;
}

/**
 * Desired focus-block reminders for a plan, one per still-upcoming
 * task-kind block, `leadMinutes` before it starts. Keyed by `taskId` (not
 * block id): block ids are freshly generated on every replan even when a
 * task's slot doesn't move, so keying by the stable task id is what lets
 * `diffReminders` recognize "this is the same reminder, nothing changed"
 * instead of cancelling and recreating on every replan.
 */
export function desiredFocusBlockReminders(plan: PlanVersion, nowIso: ISODateTime, leadMinutes: number): DesiredReminder[] {
  return plan.blocks
    .filter((b): b is typeof b & { taskId: string } => b.kind === 'task' && !!b.taskId)
    .map((b) => ({
      kind: 'focus_block' as const,
      refId: b.taskId,
      scheduledFor: addMinutesToISO(b.start, -leadMinutes),
      title: 'Upcoming focus block',
      body: `"${b.title}" starts in ${leadMinutes} minutes.`,
    }))
    .filter((r) => isSufficientlyFuture(r.scheduledFor, nowIso));
}

export function desiredCheckInReminder(
  kind: 'morning_checkin' | 'evening_review',
  date: ISODate,
  atTime: TimeString,
  label: string,
  nowIso: ISODateTime
): DesiredReminder | null {
  const scheduledFor = dateAndTimeToISO(date, atTime);
  if (!isSufficientlyFuture(scheduledFor, nowIso)) return null;
  return {
    kind,
    refId: date,
    scheduledFor,
    title: label,
    body: kind === 'morning_checkin' ? 'Take a minute to plan today.' : 'Take a minute to review today.',
  };
}

export function desiredFollowUpReminder(
  interview: InterviewEntry,
  atTime: TimeString,
  nowIso: ISODateTime
): DesiredReminder | null {
  if (!interview.followUpDate || interview.followUpDone) return null;
  const scheduledFor = dateAndTimeToISO(interview.followUpDate, atTime);
  if (!isSufficientlyFuture(scheduledFor, nowIso)) return null;
  return {
    kind: 'follow_up',
    refId: interview.id,
    scheduledFor,
    title: 'Follow-up suggestion',
    body: `Consider following up with ${interview.company} (${interview.role}).`,
  };
}

/**
 * One desired reminder per habit that's active, has a reminder time set, is
 * scheduled today, and hasn't been checked in yet today. Keyed by habitId (not
 * date) — re-deriving daily naturally replaces yesterday's stale trigger with
 * today's via diffReminders' scheduledFor-changed check, the same way
 * desiredFocusBlockReminders keys by the stable taskId.
 */
export function desiredHabitReminders(
  habits: HabitDefinition[],
  checkIns: HabitCheckIn[],
  todayLocalDate: ISODate,
  nowIso: ISODateTime
): DesiredReminder[] {
  return habits
    .filter((h) => !h.archived && h.reminderTime && isScheduledOn(h, todayLocalDate))
    .filter((h) => !checkIns.some((c) => c.habitId === h.id && c.date === todayLocalDate))
    .map((h) => ({
      kind: 'habit' as const,
      refId: h.id,
      scheduledFor: dateAndTimeToISO(todayLocalDate, h.reminderTime as TimeString),
      title: h.name,
      body: h.goal ? `Time for "${h.name}" — ${h.goal}.` : `Time for "${h.name}".`,
    }))
    .filter((r) => isSufficientlyFuture(r.scheduledFor, nowIso));
}

/**
 * Desired hourly check-in reminders for one date's hour grid. Keyed by
 * `${date}:${hour}:${subSlot}` so diffReminders can tell an unchanged prompt
 * from one that needs rescheduling, the same way every other builder above
 * keys by something stable (taskId, habitId, date) rather than a freshly
 * generated id. When `frequencyMinutes` divides 60, more than one sub-slot
 * reminder fires within the hour, but all of them still resolve back to the
 * same hour's HourlyEntry when answered — the entry model stays per-hour
 * regardless of prompt cadence. An hour already responded to, not eligible
 * (sleep, outside the window, or during a fixed/protected block per
 * settings), gets no reminder at all.
 */
export function desiredHourlyCheckInReminders(
  date: ISODate,
  slots: HourSlot[],
  settings: HourlyCheckInSettings,
  preferences: Preferences,
  entries: HourlyEntry[],
  nowIso: ISODateTime
): DesiredReminder[] {
  if (!settings.enabled) return [];
  const subSlotCount = Math.max(1, Math.floor(60 / settings.frequencyMinutes));
  const results: DesiredReminder[] = [];
  for (const slot of slots) {
    if (!isHourEligibleForCheckIn(slot, settings, preferences)) continue;
    if (findHourlyEntry(entries, date, slot.hour)?.respondedAt) continue;
    for (let sub = 0; sub < subSlotCount; sub++) {
      const scheduledFor = addMinutesToISO(slot.startIso, sub * settings.frequencyMinutes);
      results.push({
        kind: 'hourly_checkin',
        refId: `${date}:${slot.hour}:${sub}`,
        scheduledFor,
        title: 'Hourly check-in',
        body: 'What did you do in the last hour? What do you want to do next?',
      });
    }
  }
  return results.filter((r) => isSufficientlyFuture(r.scheduledFor, nowIso));
}

export interface ReminderDiff {
  toCreate: DesiredReminder[];
  toCancel: ScheduledReminder[];
  unchanged: ScheduledReminder[];
}

/**
 * Reconciles what reminders SHOULD exist against what's already scheduled,
 * restricted to `kinds` so resyncing one category (e.g. focus blocks after
 * a replan) never touches reminders of another category (e.g. follow-ups).
 * A reminder whose target time hasn't changed is left alone — this is what
 * keeps a routine replan from cancelling and re-firing every notification,
 * and what avoids ever having two live notifications for the same thing.
 */
export function diffReminders(
  desired: DesiredReminder[],
  existing: ScheduledReminder[],
  kinds: ReminderKind[]
): ReminderDiff {
  const existingInScope = existing.filter((r) => kinds.includes(r.kind));
  const existingByKey = new Map(existingInScope.map((r) => [reminderKey(r.kind, r.refId), r]));
  const desiredByKey = new Map(desired.map((d) => [reminderKey(d.kind, d.refId), d]));

  const toCreate: DesiredReminder[] = [];
  const unchanged: ScheduledReminder[] = [];
  for (const d of desired) {
    const match = existingByKey.get(reminderKey(d.kind, d.refId));
    if (match && match.scheduledFor === d.scheduledFor) {
      unchanged.push(match);
    } else {
      toCreate.push(d);
    }
  }

  const toCancel = existingInScope.filter((r) => {
    const match = desiredByKey.get(reminderKey(r.kind, r.refId));
    return !match || match.scheduledFor !== r.scheduledFor;
  });

  return { toCreate, toCancel, unchanged };
}
