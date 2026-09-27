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
}

function dayWindowFor(date: ISODate, preferences: Preferences): Interval {
  const { wakeTime, sleepTime } = preferences.sleepWindow;
  const sleepIsNextDay = parseTimeToMinutes(sleepTime) <= parseTimeToMinutes(wakeTime);
  return {
    start: dateAndTimeToISO(date, wakeTime),
    end: dateAndTimeToISO(date, sleepTime, sleepIsNextDay ? 1 : 0),
  };
}

function fixedBlocksFor(date: ISODate, preferences: Preferences, idGen: () => string): PlanBlock[] {
  const dow = dayOfWeek(date);
  return preferences.fixedCommitments
    .filter((c) => c.daysOfWeek.includes(dow))
    .map((c) => ({
      id: idGen(),
      kind: 'fixed' as const,
      title: c.title,
      start: dateAndTimeToISO(date, c.start),
      end: dateAndTimeToISO(date, c.end),
      flexibility: 'fixed' as const,
      reason: 'Fixed commitment.',
    }));
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
      title,
      start: dateAndTimeToISO(date, window.start),
      end: dateAndTimeToISO(date, window.end),
      flexibility: 'protected' as const,
      reason: 'Protected meal window.',
    };
  });
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
  const dayWindow = dayWindowFor(date, preferences);
  const fixedBlocks = fixedBlocksFor(date, preferences, idGen);
  const mealBlocks = mealBlocksFor(date, preferences, idGen);
  const preferredFocusBlocks = preferredFocusIntervalsFor(date, preferences);

  const busy: Interval[] = [...fixedBlocks, ...mealBlocks];
  const rawGaps = computeFreeGaps(dayWindow, busy);
  const { gaps, bufferBlock } = reserveBuffer(rawGaps, dayWindow.end, BUFFER_MINUTES, idGen);

  const pool = sortTaskPool(input.tasks.filter(isEligibleForPool));
  const { blocks: taskBlocks, unplaced } = allocateTasksToGaps({
    gaps,
    tasks: pool,
    preferredFocusBlocks,
    breakEveryMinutes: BREAK_EVERY_MINUTES,
    breakMinutes: BREAK_MINUTES,
    idGen,
  });

  const allBlocks = [...fixedBlocks, ...mealBlocks, ...taskBlocks, ...(bufferBlock ? [bufferBlock] : [])].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const unscheduledTasks: TaskRef[] = [];
  const atRiskTasks: TaskRef[] = [];
  for (const task of unplaced) {
    const ref: TaskRef = {
      taskId: task.id,
      title: task.title,
      reason: `Needs ${task.estimateMinutes} min but no free slot of that length remains today.`,
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
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export { dayWindowFor, fixedBlocksFor, mealBlocksFor, preferredFocusIntervalsFor, reserveBuffer };
