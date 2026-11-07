import { allocateTasksToGaps } from './allocate';
import { BREAK_EVERY_MINUTES, BREAK_MINUTES } from './constants';
import { isEligibleForPool, sortTaskPool } from './priority';
import { dayWindowFor, generatePlan, preferredFocusIntervalsFor } from './scheduler';
import { addDaysToISODate, computeFreeGaps, toISODate } from './time';
import type { ISODate, ISODateTime, PlanVersion, Preferences, Task } from './types';
import { claimedTaskIdsExcluding } from './weekPlanning';

export interface CapacityCheckInput {
  preferences: Preferences;
  /** The full task pool, including the project's own tasks — every other task genuinely
   *  competing for the same days must be accounted for, not just the project's. */
  tasks: Task[];
  planVersions: PlanVersion[];
  currentPlanIdByDate: Record<ISODate, string>;
  /** The specific task ids being checked for fit (a project's remaining linked tasks). */
  projectTaskIds: string[];
  /** Inclusive start of the window to check — normally today. */
  fromDate: ISODate;
  /** Inclusive end of the window — normally the project's target date. */
  toDate: ISODate;
  /** Overrides a task's estimateMinutes for this check only, keyed by task id — lets the
   *  caller account for real logged focus time (focus/sessionEngine.remainingEstimateMinutes)
   *  without this module depending on the focus module, mirroring GeneratePlanInput.rolloverFrom.
   *  A task with no entry uses its own estimateMinutes unchanged. */
  remainingMinutesByTaskId?: Map<string, number>;
  /** Current moment — defaults to the real current time. Whichever date in the window is
   *  "today" by this clock has its already-elapsed hours excluded from free-gap time, the
   *  same way replan() clamps to "now" for the live day; a date already past its bedtime
   *  contributes no free time at all. Every other date in the window is unaffected — a
   *  future date's full wake-to-sleep window is always available, exactly as generatePlan
   *  already treats it. */
  now?: ISODateTime;
}

export interface CapacityDayPlacement {
  date: ISODate;
  taskIds: string[];
  minutesPlaced: number;
}

export interface CapacityCheckResult {
  fits: boolean;
  placements: CapacityDayPlacement[];
  /** Project tasks that never found room anywhere in the window. */
  unplacedTaskIds: string[];
  totalMinutesNeeded: number;
  totalMinutesPlaced: number;
}

function simIdGen(): () => string {
  let n = 0;
  return () => `capacity-sim-${n++}`;
}

/**
 * The effective start of free-gap computation for `date`'s accepted plan: the day's own wake
 * time, UNLESS `date` is "now"'s calendar date and some of it has already elapsed — then
 * either `now` itself (hours already passed this morning are gone) or `null` if `now` is at
 * or past bedtime (nothing remains today at all, mirroring replan()'s own "no time remains
 * before bedtime" branch). A date that isn't today is never clamped.
 */
function clampedWindowStart(
  dayWindowStart: ISODateTime,
  dayWindowEnd: ISODateTime,
  date: ISODate,
  nowIso: ISODateTime
): ISODateTime | null {
  if (date !== toISODate(new Date(nowIso))) return dayWindowStart;
  if (nowIso <= dayWindowStart) return dayWindowStart;
  if (nowIso >= dayWindowEnd) return null;
  return nowIso;
}

/**
 * Answers "do these project tasks actually fit before the deadline" by walking each day in
 * the window and handing it to the SAME allocation machinery the real planner uses — never
 * a separate estimate or a simplified minutes-per-day heuristic.
 *
 * A date that already has an accepted plan is simulated into its REAL leftover free time
 * (computeFreeGaps over its actual committed blocks — fixed commitments, meals, protected
 * time, other tasks, buffer), since that plan is ground truth and nothing here may silently
 * displace what's already fixed: sleep, commitments, or anything already on the accepted
 * schedule. Whichever date is "now" by the clock also has its already-elapsed hours excluded
 * (see clampedWindowStart) — the same "now" clamp replan() itself applies — so a check run
 * late in the day never offers up a morning slot that's already gone.
 *
 * A date with no accepted plan yet is a dry run of generatePlan with the full task
 * pool (so competing non-project tasks and commitments are respected exactly as a real
 * generation would) minus the tasks under test, which are added back in at their own
 * priority. Every dry-run result here is discarded — never persisted, never shown as a real
 * plan — this function only observes which of projectTaskIds would land in blocks.
 */
export function checkProjectCapacity(input: CapacityCheckInput): CapacityCheckResult {
  const taskById = new Map(input.tasks.map((t) => [t.id, t]));
  const projectIdSet = new Set(input.projectTaskIds);
  let remaining: Task[] = input.projectTaskIds
    .map((id) => taskById.get(id))
    .filter((t): t is Task => !!t && isEligibleForPool(t))
    .map((t) => {
      const override = input.remainingMinutesByTaskId?.get(t.id);
      return override != null ? { ...t, estimateMinutes: override } : t;
    });

  const totalMinutesNeeded = remaining.reduce((sum, t) => sum + t.estimateMinutes, 0);
  const placements: CapacityDayPlacement[] = [];
  let totalMinutesPlaced = 0;
  const idGen = simIdGen();
  const nowIso = input.now ?? new Date().toISOString();

  let date = input.fromDate;
  while (date <= input.toDate && remaining.length > 0) {
    const currentPlanId = input.currentPlanIdByDate[date];
    const acceptedPlan = currentPlanId ? input.planVersions.find((v) => v.id === currentPlanId) ?? null : null;

    let placedIds: string[];
    if (acceptedPlan) {
      const dayWindow = dayWindowFor(date, input.preferences);
      const windowStart = clampedWindowStart(dayWindow.start, dayWindow.end, date, nowIso);
      if (windowStart === null) {
        placedIds = []; // already past bedtime on this (today's) date — nothing left to offer
      } else {
        const gaps = computeFreeGaps({ start: windowStart, end: dayWindow.end }, acceptedPlan.blocks);
        const preferredFocusBlocks = preferredFocusIntervalsFor(date, input.preferences);
        const { blocks } = allocateTasksToGaps({
          gaps,
          tasks: sortTaskPool(remaining),
          preferredFocusBlocks,
          breakEveryMinutes: BREAK_EVERY_MINUTES,
          breakMinutes: BREAK_MINUTES,
          idGen,
        });
        placedIds = blocks.filter((b) => b.taskId && projectIdSet.has(b.taskId)).map((b) => b.taskId as string);
      }
    } else {
      const excludeTaskIds = claimedTaskIdsExcluding(input.planVersions, input.currentPlanIdByDate, date);
      const otherTasks = input.tasks.filter((t) => !projectIdSet.has(t.id));
      const dryRun = generatePlan({
        date,
        preferences: input.preferences,
        tasks: [...otherTasks, ...remaining],
        version: 1,
        idGen,
        excludeTaskIds,
      });
      placedIds = dryRun.blocks.filter((b) => b.taskId && projectIdSet.has(b.taskId)).map((b) => b.taskId as string);
    }

    if (placedIds.length > 0) {
      const placedSet = new Set(placedIds);
      const placedTasks = remaining.filter((t) => placedSet.has(t.id));
      const minutesPlaced = placedTasks.reduce((s, t) => s + t.estimateMinutes, 0);
      placements.push({ date, taskIds: placedIds, minutesPlaced });
      totalMinutesPlaced += minutesPlaced;
      remaining = remaining.filter((t) => !placedSet.has(t.id));
    }

    date = addDaysToISODate(date, 1);
  }

  return {
    fits: remaining.length === 0,
    placements,
    unplacedTaskIds: remaining.map((t) => t.id),
    totalMinutesNeeded,
    totalMinutesPlaced,
  };
}
