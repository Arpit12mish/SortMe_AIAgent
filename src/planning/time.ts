import type { ISODate, ISODateTime, TimeString } from './types';

const MINUTES_PER_DAY = 24 * 60;

export function parseTimeToMinutes(time: TimeString): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTimeString(minutes: number): TimeString {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Combines a YYYY-MM-DD date with an HH:mm time into an ISO datetime, in local time. */
export function dateAndTimeToISO(date: ISODate, time: TimeString, dayOffset = 0): ISODateTime {
  const [year, month, day] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const d = new Date(year, (month ?? 1) - 1, day + dayOffset, h, m, 0, 0);
  return d.toISOString();
}

export function addMinutesToISO(iso: ISODateTime, minutes: number): ISODateTime {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function isoDiffMinutes(a: ISODateTime, b: ISODateTime): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / 60_000;
}

export function isoToDate(iso: ISODateTime): Date {
  return new Date(iso);
}

export function toISODate(d: Date): ISODate {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local-date arithmetic: `days` may be negative. */
export function addDaysToISODate(date: ISODate, days: number): ISODate {
  const [year, month, day] = date.split('-').map(Number);
  return toISODate(new Date(year, (month ?? 1) - 1, day + days));
}

export function dayOfWeek(date: ISODate): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day).getDay();
}

export function formatTimeOfDay(iso: ISODateTime): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** A friendly "Sun, Oct 5" label for an ISODate, in local time. */
export function formatDateLabel(date: ISODate): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, (month ?? 1) - 1, day);
  return `${WEEKDAY_LABELS[d.getDay()]}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

export interface Interval {
  start: ISODateTime;
  end: ISODateTime;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return new Date(a.start).getTime() < new Date(b.end).getTime() &&
    new Date(b.start).getTime() < new Date(a.end).getTime();
}

export function durationMinutes(interval: Interval): number {
  return isoDiffMinutes(interval.end, interval.start);
}

/**
 * Given a day window and a list of busy intervals (sorted or not), returns the
 * free gaps within the window, sorted chronologically.
 */
export function computeFreeGaps(window: Interval, busy: Interval[]): Interval[] {
  const sorted = [...busy].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
  const gaps: Interval[] = [];
  let cursor = window.start;
  for (const block of sorted) {
    if (new Date(block.start).getTime() > new Date(cursor).getTime()) {
      gaps.push({ start: cursor, end: block.start });
    }
    if (new Date(block.end).getTime() > new Date(cursor).getTime()) {
      cursor = block.end;
    }
  }
  if (new Date(cursor).getTime() < new Date(window.end).getTime()) {
    gaps.push({ start: cursor, end: window.end });
  }
  return gaps.filter((g) => durationMinutes(g) > 0);
}
