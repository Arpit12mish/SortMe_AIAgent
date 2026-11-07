import { dayOfWeek, toISODate } from '../planning/time';
import type { ISODate } from '../planning/types';
import type { HabitCheckIn, HabitDayStatus, HabitDefinition } from './types';

/** Tap-to-cycle order for a day cell: untracked -> completed -> partial -> missed -> untracked. */
export const HABIT_CYCLE: Record<HabitDayStatus, HabitDayStatus> = {
  untracked: 'completed',
  completed: 'partial',
  partial: 'missed',
  missed: 'untracked',
};

function parseISODate(date: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month: month ?? 1, day };
}

function addDaysLocal(date: ISODate, offset: number): ISODate {
  const { year, month, day } = parseISODate(date);
  return toISODate(new Date(year, month - 1, day + offset));
}

/** Ascending local dates from start to end inclusive. Safe on plain ISODate strings
 *  since YYYY-MM-DD lexicographic order matches chronological order. */
function localDatesBetween(start: ISODate, end: ISODate): ISODate[] {
  const dates: ISODate[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDaysLocal(cursor, 1);
  }
  return dates;
}

export function isScheduledOn(habit: HabitDefinition, date: ISODate): boolean {
  if (date < habit.startDate) return false;
  if (habit.archived && habit.archivedAt && date > toISODate(new Date(habit.archivedAt))) return false;
  return habit.scheduledDays.includes(dayOfWeek(date));
}

export function findCheckIn(checkIns: HabitCheckIn[], habitId: string, date: ISODate): HabitCheckIn | undefined {
  return checkIns.find((c) => c.habitId === habitId && c.date === date);
}

/**
 * An explicit check-in always wins, even on an unscheduled day (bonus effort on a
 * rest day is shown, not hidden). Otherwise: 'missed' applies only to a strictly
 * PAST scheduled day with no check-in — today (even scheduled, even unchecked) and
 * every future day resolve to 'untracked', since the day is still open.
 */
export function deriveHabitDayStatus(
  habit: HabitDefinition,
  checkIns: HabitCheckIn[],
  date: ISODate,
  todayLocalDate: ISODate
): HabitDayStatus {
  const checkIn = findCheckIn(checkIns, habit.id, date);
  if (checkIn) return checkIn.status;
  if (date < todayLocalDate && isScheduledOn(habit, date)) return 'missed';
  return 'untracked';
}

export interface HabitStreaks {
  current: number;
  longest: number;
}

/**
 * 'completed' and 'partial' both extend a streak; 'missed' breaks it; 'untracked'
 * (a rest day, or today pending) is skipped without breaking it. current walks
 * backward from todayLocalDate stopping at the first 'missed'; longest walks
 * forward tracking a running counter reset only on 'missed'.
 */
export function computeStreaks(habit: HabitDefinition, checkIns: HabitCheckIn[], todayLocalDate: ISODate): HabitStreaks {
  if (todayLocalDate < habit.startDate) return { current: 0, longest: 0 };

  const habitCheckIns = checkIns.filter((c) => c.habitId === habit.id);
  const allDates = localDatesBetween(habit.startDate, todayLocalDate);

  let current = 0;
  for (let i = allDates.length - 1; i >= 0; i--) {
    const status = deriveHabitDayStatus(habit, habitCheckIns, allDates[i], todayLocalDate);
    if (status === 'completed' || status === 'partial') current++;
    else if (status === 'missed') break;
  }

  let longest = 0;
  let running = 0;
  for (const date of allDates) {
    const status = deriveHabitDayStatus(habit, habitCheckIns, date, todayLocalDate);
    if (status === 'completed' || status === 'partial') {
      running++;
      longest = Math.max(longest, running);
    } else if (status === 'missed') {
      running = 0;
    }
  }

  return { current, longest };
}

export interface HabitPeriodStats {
  scheduledDays: number;
  completedDays: number;
  partialDays: number;
  missedDays: number;
  completionRate: number;
}

/** periodEnd is clamped to min(periodEnd, todayLocalDate) — a period reaching into
 *  the future never counts those days toward the scheduled-days denominator. */
export function completionRateForPeriod(
  habit: HabitDefinition,
  checkIns: HabitCheckIn[],
  periodStart: ISODate,
  periodEnd: ISODate,
  todayLocalDate: ISODate
): HabitPeriodStats {
  const clampedEnd = periodEnd < todayLocalDate ? periodEnd : todayLocalDate;
  const habitCheckIns = checkIns.filter((c) => c.habitId === habit.id);

  let scheduledDays = 0;
  let completedDays = 0;
  let partialDays = 0;
  let missedDays = 0;

  if (periodStart <= clampedEnd) {
    for (const date of localDatesBetween(periodStart, clampedEnd)) {
      if (!isScheduledOn(habit, date)) continue;
      scheduledDays++;
      const status = deriveHabitDayStatus(habit, habitCheckIns, date, todayLocalDate);
      if (status === 'completed') completedDays++;
      else if (status === 'partial') partialDays++;
      else if (status === 'missed') missedDays++;
    }
  }

  return {
    scheduledDays,
    completedDays,
    partialDays,
    missedDays,
    completionRate: scheduledDays === 0 ? 0 : (completedDays + partialDays) / scheduledDays,
  };
}

export interface MonthGridCell {
  date: ISODate;
  inMonth: boolean;
}

/** Always 42 cells (6 weeks) starting from the Sunday on/before the 1st, so the
 *  UI grid never reflows between months. month is 1-12. */
export function monthGridDates(year: number, month: number): MonthGridCell[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const gridStart = new Date(year, month - 1, 1 - firstOfMonth.getDay());

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({ date: toISODate(d), inMonth: d.getMonth() === month - 1 });
  }
  return cells;
}

/** Ascending local dates ending at todayLocalDate, same pattern as weeklyReview.ts's lastNLocalDates. */
export function recentActivityDates(todayLocalDate: ISODate, days: number): ISODate[] {
  const { year, month, day } = parseISODate(todayLocalDate);
  const dates: ISODate[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(toISODate(new Date(year, month - 1, day - i)));
  }
  return dates;
}

/** Non-archived habits scheduled on `date` — the single source of truth for both
 *  the Today-tab habit section and desiredHabitReminders. */
export function habitsScheduledForDate(habits: HabitDefinition[], date: ISODate): HabitDefinition[] {
  return habits.filter((h) => !h.archived && isScheduledOn(h, date));
}
