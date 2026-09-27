import type { Interval } from './time';

export function makeIdGen(prefix: string) {
  let counter = 0;
  return () => `${prefix}-${counter++}`;
}

/**
 * Builds an ISO datetime from a local-time literal (no trailing "Z"), the
 * same way the planning engine derives block times from wall-clock HH:mm
 * values. Tests must use this instead of a literal "...Z" string, since a
 * literal UTC time would silently disagree with the engine's local-time
 * day window whenever the test machine isn't in UTC.
 */
export function localISO(localLiteral: string): string {
  return new Date(localLiteral).toISOString();
}

/** Returns the local wall-clock "HH:mm" for an ISO datetime, for assertions. */
export function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Fails the assertion if any two intervals in the list overlap in time. */
export function assertNoOverlaps(intervals: Interval[]): void {
  const sorted = [...intervals].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = new Date(sorted[i - 1].end).getTime();
    const curStart = new Date(sorted[i].start).getTime();
    if (curStart < prevEnd) {
      throw new Error(
        `Overlap detected between ${JSON.stringify(sorted[i - 1])} and ${JSON.stringify(sorted[i])}`
      );
    }
  }
}
