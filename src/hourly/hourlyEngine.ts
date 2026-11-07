// Pure logic for the Hourly Plan / Hourly Check-in feature. Nothing here
// touches storage or React state — every function is a plain transform so it
// can be unit tested directly, matching the rest of src/planning.

import { dayWindowFor } from '../planning/scheduler';
import {
  addMinutesToISO,
  dateAndTimeToISO,
  durationMinutes,
  minutesToTimeString,
  overlaps,
  parseTimeToMinutes,
  type Interval,
} from '../planning/time';
import type { ISODate, ISODateTime, PlanBlock, PlanVersion, Preferences, TimeString } from '../planning/types';
import type { FocusSession } from '../focus/types';
import type { HourlyCheckInChoice, HourlyCheckInSettings, HourlyEntry } from './types';

export function hourlyEntryId(date: ISODate, hour: number): string {
  return `hourly:${date}:${hour}`;
}

export type HourSlotKind = 'sleep' | 'free' | 'blocks';

export interface HourSlot {
  hour: number; // 0-23
  startIso: ISODateTime;
  endIso: ISODateTime;
  kind: HourSlotKind;
  /** Blocks (from the accepted/proposed PlanVersion) that overlap this hour. Never a stored copy. */
  blocks: PlanBlock[];
}

/**
 * Every local hour (0-23) of `date`, mapped to whatever the accepted
 * PlanVersion says is happening then. Nothing here is persisted — planned
 * activity is always re-derived from `plan` so the Hourly Plan view can
 * never disagree with the accepted schedule. Hours outside the day's
 * wake/sleep window (computed the same way the scheduler computes it,
 * including the sleep-crosses-midnight case) are labeled 'sleep'; hours
 * inside the window with no overlapping block are 'free'. A block spanning
 * several hours appears, unduplicated, in every hour slot it overlaps —
 * callers that want one merged row per block use groupHourlyGrid.
 */
export function buildHourlyGrid(date: ISODate, plan: PlanVersion | null, preferences: Preferences): HourSlot[] {
  const window = dayWindowFor(date, preferences);
  const slots: HourSlot[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const startIso = dateAndTimeToISO(date, minutesToTimeString(hour * 60));
    const endIso = addMinutesToISO(startIso, 60);
    const hourInterval: Interval = { start: startIso, end: endIso };
    const blocks = plan ? plan.blocks.filter((b) => overlaps(hourInterval, { start: b.start, end: b.end })) : [];
    const kind: HourSlotKind = blocks.length > 0 ? 'blocks' : overlaps(hourInterval, window) ? 'free' : 'sleep';
    slots.push({ hour, startIso, endIso, kind, blocks });
  }
  return slots;
}

export interface HourlyPlanRow {
  startHour: number;
  endHour: number; // exclusive
  startIso: ISODateTime;
  endIso: ISODateTime;
  kind: HourSlotKind;
  blocks: PlanBlock[];
}

function slotGroupKey(slot: Pick<HourSlot, 'kind' | 'blocks'>): string {
  return `${slot.kind}:${slot.blocks.map((b) => b.id).join(',')}`;
}

/** Merges contiguous hours that show the exact same thing into one display row, so a multi-hour task reads as one row, not several identical ones. */
export function groupHourlyGrid(slots: HourSlot[]): HourlyPlanRow[] {
  const rows: HourlyPlanRow[] = [];
  for (const slot of slots) {
    const prev = rows[rows.length - 1];
    if (prev && prev.endHour === slot.hour && slotGroupKey(prev) === slotGroupKey(slot)) {
      prev.endHour = slot.hour + 1;
      prev.endIso = slot.endIso;
    } else {
      rows.push({ startHour: slot.hour, endHour: slot.hour + 1, startIso: slot.startIso, endIso: slot.endIso, kind: slot.kind, blocks: slot.blocks });
    }
  }
  return rows;
}

/** Resolves the configured check-in window, defaulting to the day's wake/sleep time. */
export function resolveCheckInWindow(
  settings: HourlyCheckInSettings,
  preferences: Preferences
): { start: TimeString; end: TimeString } {
  return {
    start: settings.windowStart ?? preferences.sleepWindow.wakeTime,
    end: settings.windowEnd ?? preferences.sleepWindow.sleepTime,
  };
}

/** Whether a given local time-of-day falls inside [start, end), handling a window that wraps past midnight. */
export function isTimeOfDayWithinWindow(time: TimeString, windowStart: TimeString, windowEnd: TimeString): boolean {
  const t = parseTimeToMinutes(time);
  const start = parseTimeToMinutes(windowStart);
  const end = parseTimeToMinutes(windowEnd);
  if (start === end) return true; // a zero-width window means "all day" rather than "never"
  if (start < end) return t >= start && t < end;
  return t >= start || t < end; // wraps past midnight
}

/**
 * Whether `slot` should ever prompt a check-in, per the user's settings.
 * Sleep hours are never eligible regardless of settings (spec requirement:
 * "Never prompt during the configured sleep window").
 */
export function isHourEligibleForCheckIn(slot: HourSlot, settings: HourlyCheckInSettings, preferences: Preferences): boolean {
  if (!settings.enabled) return false;
  if (slot.kind === 'sleep') return false;
  const window = resolveCheckInWindow(settings, preferences);
  const hourTime = minutesToTimeString(slot.hour * 60);
  if (!isTimeOfDayWithinWindow(hourTime, window.start, window.end)) return false;
  if (!settings.promptDuringFixed && slot.blocks.some((b) => b.kind === 'fixed')) return false;
  if (!settings.promptDuringProtected && slot.blocks.some((b) => b.kind === 'protected')) return false;
  return true;
}

export function findHourlyEntry(entries: HourlyEntry[], date: ISODate, hour: number): HourlyEntry | undefined {
  return entries.find((e) => e.date === date && e.hour === hour);
}

export type HourStatus = 'not_checked_in' | 'answered' | 'skipped' | 'sleep' | 'not_eligible';

/** Never returns anything implying failure — an unanswered hour is "Not checked in", not "Missed". */
export function statusForHour(
  slot: HourSlot,
  entry: HourlyEntry | undefined,
  settings: HourlyCheckInSettings,
  preferences: Preferences,
  nowIso: ISODateTime
): HourStatus {
  if (slot.kind === 'sleep') return 'sleep';
  if (entry?.respondedAt) return entry.pastChoice === 'skip' ? 'skipped' : 'answered';
  if (!isHourEligibleForCheckIn(slot, settings, preferences) || slot.endIso > nowIso) return 'not_eligible';
  return 'not_checked_in';
}

const STATUS_LABEL: Record<HourStatus, string> = {
  not_checked_in: 'Not checked in',
  answered: 'Answered',
  skipped: 'Skipped',
  sleep: 'Sleep',
  not_eligible: 'Not yet due',
};

/** A words-only label for accessibility — status must never be conveyed by color alone. */
export function statusLabel(status: HourStatus): string {
  return STATUS_LABEL[status];
}

/** Hours of `date` that are eligible, in the past relative to `nowIso`, and still unanswered — for the "catch up" prompt on reopen. */
export function unansweredPastHours(
  date: ISODate,
  slots: HourSlot[],
  entries: HourlyEntry[],
  settings: HourlyCheckInSettings,
  preferences: Preferences,
  nowIso: ISODateTime
): number[] {
  return slots
    .filter((slot) => slot.endIso <= nowIso)
    .filter((slot) => isHourEligibleForCheckIn(slot, settings, preferences))
    .filter((slot) => !findHourlyEntry(entries, date, slot.hour)?.respondedAt)
    .map((slot) => slot.hour);
}

function activeIntervalsForSession(session: FocusSession, nowIso: ISODateTime): Interval[] {
  const overallEnd = session.endedAt ?? nowIso;
  const intervals: Interval[] = [];
  let cursor = session.startedAt;
  for (const pause of session.pauseIntervals) {
    if (cursor < pause.pausedAt) intervals.push({ start: cursor, end: pause.pausedAt });
    if (!pause.resumedAt) return intervals; // still paused: no more active time to count
    cursor = pause.resumedAt;
  }
  if (cursor < overallEnd) intervals.push({ start: cursor, end: overallEnd });
  return intervals;
}

function intersectMinutes(a: Interval, b: Interval): number {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  if (start >= end) return 0;
  return durationMinutes({ start, end });
}

/**
 * Real focused minutes within this hour, from actual FocusSession records —
 * never inferred from the plan. A session's paused time never counts, and a
 * session that is still running counts only up to `nowIso`.
 */
export function actualFocusMinutesForHour(sessions: FocusSession[], hourInterval: Interval, nowIso: ISODateTime): number {
  let total = 0;
  for (const session of sessions) {
    for (const active of activeIntervalsForSession(session, nowIso)) {
      total += intersectMinutes(active, hourInterval);
    }
  }
  return total;
}

export const CHOICE_LABEL: Record<HourlyCheckInChoice, string> = {
  followed_plan: 'Followed plan',
  partly_followed: 'Partly followed',
  did_something_else: 'Did something else',
  interrupted: 'Interrupted',
  skip: 'Skip',
};

/** Choices after which it's worth offering to replan the rest of the day. */
export function choiceSuggestsReplan(choice: HourlyCheckInChoice | undefined): boolean {
  return choice === 'did_something_else' || choice === 'interrupted' || choice === 'partly_followed';
}

/** A human-readable summary of what changed, for the existing reportEventChanged(description) replan path. */
export function describeHourlyReplanTrigger(hour: number, choice: HourlyCheckInChoice, note: string | undefined, intention: string | undefined): string {
  const time = minutesToTimeString(hour * 60);
  const choiceText = CHOICE_LABEL[choice].toLowerCase();
  let description = `At ${time}, you reported: ${choiceText}.`;
  if (note) description += ` Note: ${note}.`;
  if (intention) description += ` Next, you want to: ${intention}.`;
  return description;
}
