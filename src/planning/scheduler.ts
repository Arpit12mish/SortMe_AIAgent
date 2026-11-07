import { allocateTasksToGaps } from './allocate';
import { BREAK_EVERY_MINUTES, BREAK_MINUTES, BUFFER_MINUTES } from './constants';
import { isEligibleForPool, isUrgentToday, sortTaskPool } from './priority';
import {
  computeFreeGaps,
  dateAndTimeToISO,
  dayOfWeek,
  durationMinutes,
  parseTimeToMinutes,
  type Interval,
} from './time';
import type { ISODate, ISODateTime, PlanBlock, PlanVersion, Preferences, Task, TaskRef } from './types';

export interface GeneratePlanInput {
  date: ISODate;
  preferences: Preferences;
  /** Full task pool; completed/delegated tasks are ignored automatically. */
  tasks: Task[];
  version: number;
  parentVersionId?: string;
  idGen: () => string;
  nowIso?: ISODateTime;
  /** Tasks already claimed by another date's accepted plan — excluded from this
   *  date's pool entirely (not reported as unscheduled/at-risk; they simply aren't
   *  this date's concern), so a one-time task is never double-booked across days. */
  excludeTaskIds?: Set<string>;
  /** Unfinished work rolling forward from an earlier accepted date (see
   *  weekPlanning.rolloverCandidatesFor) — keyed by taskId. `remainingMinutes`
   *  overrides the task's own estimateMinutes for this date's allocation only
   *  (the task itself is never mutated), and `fromDate` lets the resulting
   *  block/unscheduled-reason say where the work carried over from. */
  rolloverFrom?: Map<string, { remainingMinutes: number; fromDate: ISODate }>;
}

function dayWindowFor(date: ISODate, preferences: Preferences): Interval {
  const { wakeTime, sleepTime } = preferences.sleepWindow;
  const sleepIsNextDay = parseTimeToMinutes(sleepTime) <= parseTimeToMinutes(wakeTime);
  return {
    start: dateAndTimeToISO(date, wakeTime),
    end: dateAndTimeToISO(date, sleepTime, sleepIsNextDay ? 1 : 0),
  };
}

function commitmentAppliesOn(c: { daysOfWeek: number[]; startDate?: ISODate; endDate?: ISODate }, date: ISODate, dow: number): boolean {
  return c.daysOfWeek.includes(dow) && (!c.startDate || date >= c.startDate) && (!c.endDate || date <= c.endDate);
}

function fixedBlocksFor(date: ISODate, preferences: Preferences, idGen: () => string): PlanBlock[] {
  const dow = dayOfWeek(date);
  return preferences.fixedCommitments
    .filter((c) => commitmentAppliesOn(c, date, dow))
    .map((c) => ({
      id: idGen(),
      kind: 'fixed' as const,
      sourceId: c.id,
      title: c.title,
      start: dateAndTimeToISO(date, c.start),
      end: dateAndTimeToISO(date, c.end),
      flexibility: 'fixed' as const,
      reason: 'Fixed commitment.',
    }));
}

/** One or two immovable "Travel to/from" blocks around every located commitment that
 *  applies on `date`, sized by the global `travelTimeMinutes` buffer, clipped to the
 *  day window. Nothing is emitted when the buffer is unset/zero or a commitment has no location. */
function travelBlocksFor(date: ISODate, preferences: Preferences, idGen: () => string): PlanBlock[] {
  const minutes = preferences.travelTimeMinutes ?? 0;
  if (minutes <= 0) return [];
  const dow = dayOfWeek(date);
  const window = dayWindowFor(date, preferences);
  const windowStartMs = new Date(window.start).getTime();
  const windowEndMs = new Date(window.end).getTime();

  const blocks: PlanBlock[] = [];
  for (const c of preferences.fixedCommitments) {
    if (!c.location || !commitmentAppliesOn(c, date, dow)) continue;
    const commitStart = dateAndTimeToISO(date, c.start);
    const commitEnd = dateAndTimeToISO(date, c.end);
    const commitStartMs = new Date(commitStart).getTime();
    const commitEndMs = new Date(commitEnd).getTime();

    const toStartMs = Math.max(windowStartMs, commitStartMs - minutes * 60_000);
    if (toStartMs < commitStartMs) {
      blocks.push({
        id: idGen(),
        kind: 'fixed' as const,
        sourceId: `${c.id}:travel-to`,
        title: `Travel to ${c.title}`,
        start: new Date(toStartMs).toISOString(),
        end: commitStart,
        flexibility: 'fixed' as const,
        reason: 'Travel time.',
      });
    }

    const fromEndMs = Math.min(windowEndMs, commitEndMs + minutes * 60_000);
    if (fromEndMs > commitEndMs) {
      blocks.push({
        id: idGen(),
        kind: 'fixed' as const,
        sourceId: `${c.id}:travel-from`,
        title: `Travel from ${c.title}`,
        start: commitEnd,
        end: new Date(fromEndMs).toISOString(),
        flexibility: 'fixed' as const,
        reason: 'Travel time.',
      });
    }
  }
  return blocks;
}

function mealBlocksFor(date: ISODate, preferences: Preferences, idGen: () => string): PlanBlock[] {
  const meals: [string, keyof Preferences['mealWindows']][] = [
    ['Breakfast', 'breakfast'],
    ['Lunch', 'lunch'],
    ['Dinner', 'dinner'],
  ];
  return meals.map(([title, key]) => {
    const window = preferences.mealWindows[key];
    return {
      id: idGen(),
      kind: 'meal' as const,
      sourceId: `meal:${key}`,
      title,
      start: dateAndTimeToISO(date, window.start),
      end: dateAndTimeToISO(date, window.end),
      flexibility: 'protected' as const,
      reason: 'Protected meal window.',
    };
  });
}

/** Recurring blocks of time reserved for something other than a named commitment
 *  (e.g. "Gym"). Same shape as fixedBlocksFor but over preferences.protectedTimeBlocks,
 *  no date-range filter (protected time is recurrence-only), and 'protected' flexibility
 *  so it can shift within tolerance like a meal rather than never moving at all. */
function protectedTimeBlocksFor(date: ISODate, preferences: Preferences, idGen: () => string): PlanBlock[] {
  const dow = dayOfWeek(date);
  return (preferences.protectedTimeBlocks ?? [])
    .filter((p) => p.daysOfWeek.includes(dow))
    .map((p) => ({
      id: idGen(),
      kind: 'protected' as const,
      sourceId: p.id,
      title: p.title,
      start: dateAndTimeToISO(date, p.start),
      end: dateAndTimeToISO(date, p.end),
      flexibility: 'protected' as const,
      reason: 'Protected time.',
    }));
}

function preferredFocusIntervalsFor(date: ISODate, preferences: Preferences): Interval[] {
  return preferences.preferredFocusBlocks.map((r) => ({
    start: dateAndTimeToISO(date, r.start),
    end: dateAndTimeToISO(date, r.end),
  }));
}

/** Trims a buffer off the tail of the day, if the last gap has room for it. */
function reserveBuffer(
  gaps: Interval[],
  dayWindowEnd: ISODateTime,
  bufferMinutes: number,
  idGen: () => string
): { gaps: Interval[]; bufferBlock: PlanBlock | null } {
  if (gaps.length === 0) return { gaps, bufferBlock: null };
  const sorted = [...gaps].sort((a, b) => new Date(a.end).getTime() - new Date(b.end).getTime());
  const last = sorted[sorted.length - 1];
  if (last.end !== dayWindowEnd || durationMinutes(last) < bufferMinutes) {
    return { gaps, bufferBlock: null };
  }
  const bufferStart = new Date(new Date(last.end).getTime() - bufferMinutes * 60_000).toISOString();
  const trimmedLast: Interval = { start: last.start, end: bufferStart };
  const newGaps = gaps
    .map((g) => (g === last ? trimmedLast : g))
    .filter((g) => durationMinutes(g) > 0);
  const bufferBlock: PlanBlock = {
    id: idGen(),
    kind: 'buffer',
    title: 'Buffer for surprises',
    start: bufferStart,
    end: last.end,
    flexibility: 'flexible',
    reason: 'Reserved at the end of the day to absorb interruptions.',
  };
  return { gaps: newGaps, bufferBlock };
}

/** Generates a fresh day plan from scratch: fixed commitments, meals, tasks, breaks, buffer. */
export function generatePlan(input: GeneratePlanInput): PlanVersion {
  const { date, preferences, idGen } = input;
  const now = input.nowIso ?? new Date().toISOString();
  const dayWindow = dayWindowFor(date, preferences);
  const fixedBlocks = fixedBlocksFor(date, preferences, idGen);
  const travelBlocks = travelBlocksFor(date, preferences, idGen);
  const mealBlocks = mealBlocksFor(date, preferences, idGen);
  const protectedBlocks = protectedTimeBlocksFor(date, preferences, idGen);
  const preferredFocusBlocks = preferredFocusIntervalsFor(date, preferences);

  const busy: Interval[] = [...fixedBlocks, ...travelBlocks, ...mealBlocks, ...protectedBlocks];
  const rawGaps = computeFreeGaps(dayWindow, busy);
  const { gaps, bufferBlock } = reserveBuffer(rawGaps, dayWindow.end, BUFFER_MINUTES, idGen);

  // A rolled-over task is allocated using what's actually LEFT of it (remainingMinutes),
  // never its full original estimate again — the task itself is never mutated, only this
  // one allocation run sees the reduced duration.
  const pool = sortTaskPool(
    input.tasks
      .filter(isEligibleForPool)
      .filter((t) => !input.excludeTaskIds?.has(t.id))
      .map((t) => {
        const rollover = input.rolloverFrom?.get(t.id);
        return rollover ? { ...t, estimateMinutes: rollover.remainingMinutes } : t;
      })
  );
  const { blocks: rawTaskBlocks, unplaced } = allocateTasksToGaps({
    gaps,
    tasks: pool,
    preferredFocusBlocks,
    breakEveryMinutes: BREAK_EVERY_MINUTES,
    breakMinutes: BREAK_MINUTES,
    idGen,
  });
  const taskBlocks = rawTaskBlocks.map((b) => {
    const rollover = b.taskId ? input.rolloverFrom?.get(b.taskId) : undefined;
    if (!rollover) return b;
    return { ...b, reason: rolloverReason(rollover, input.tasks.find((t) => t.id === b.taskId), now) };
  });

  const allBlocks = [
    ...fixedBlocks,
    ...travelBlocks,
    ...mealBlocks,
    ...protectedBlocks,
    ...taskBlocks,
    ...(bufferBlock ? [bufferBlock] : []),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const unscheduledTasks: TaskRef[] = [];
  const atRiskTasks: TaskRef[] = [];
  for (const task of unplaced) {
    const rollover = input.rolloverFrom?.get(task.id);
    const ref: TaskRef = {
      taskId: task.id,
      title: task.title,
      reason: rollover
        ? `${rolloverReason(rollover, input.tasks.find((t) => t.id === task.id), now)} Still needs ${task.estimateMinutes} min, but no free slot of that length remains today either.`
        : `Needs ${task.estimateMinutes} min but no free slot of that length remains today.`,
    };
    if (isUrgentToday(task, dayWindow.end)) {
      atRiskTasks.push(ref);
    } else {
      unscheduledTasks.push(ref);
    }
  }

  const explanations: string[] = [];
  if (bufferBlock) {
    explanations.push('Reserved a 30-minute buffer before bedtime for surprises.');
  } else {
    explanations.push('No buffer reserved: the schedule already runs through bedtime.');
  }
  if (input.rolloverFrom && input.rolloverFrom.size > 0) {
    const names = [...input.rolloverFrom.keys()].map((id) => input.tasks.find((t) => t.id === id)?.title ?? id);
    explanations.push(
      `${input.rolloverFrom.size} task(s) carried over unfinished from an earlier day: ${names.join(', ')}.`
    );
  }
  if (atRiskTasks.length > 0) {
    explanations.push(
      `${atRiskTasks.length} urgent task(s) could not be scheduled today: ${atRiskTasks
        .map((t) => t.title)
        .join(', ')}. Consider dropping a lower-priority task or extending the day.`
    );
  }

  return {
    id: idGen(),
    version: input.version,
    parentVersionId: input.parentVersionId,
    date,
    status: 'proposed',
    blocks: allBlocks,
    unscheduledTasks,
    atRiskTasks,
    changes: [],
    explanations,
    createdAt: now,
  };
}

function rolloverReason(
  rollover: { remainingMinutes: number; fromDate: ISODate },
  originalTask: Task | undefined,
  nowIso: ISODateTime
): string {
  const originalEstimate = originalTask?.estimateMinutes ?? rollover.remainingMinutes;
  const overdue = originalTask?.deadline && new Date(originalTask.deadline).getTime() < new Date(nowIso).getTime();
  return (
    `Carried over from ${rollover.fromDate}, unfinished there (${rollover.remainingMinutes} of ${originalEstimate} min remaining).` +
    (overdue ? ' This task is now overdue.' : '')
  );
}

export {
  dayWindowFor,
  fixedBlocksFor,
  travelBlocksFor,
  mealBlocksFor,
  protectedTimeBlocksFor,
  preferredFocusIntervalsFor,
  reserveBuffer,
};
