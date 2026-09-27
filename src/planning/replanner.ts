import { allocateTasksToGaps } from './allocate';
import { BREAK_EVERY_MINUTES, BREAK_MINUTES, MEAL_SHIFT_TOLERANCE_MINUTES } from './constants';
import { isEligibleForPool, isUrgentToday, sortTaskPool } from './priority';
import { dayWindowFor, preferredFocusIntervalsFor } from './scheduler';
import { addMinutesToISO, computeFreeGaps, durationMinutes, type Interval } from './time';
import type {
  ISODateTime,
  PlanBlock,
  PlanChange,
  PlanVersion,
  Preferences,
  ReplanEvent,
  Task,
  TaskRef,
} from './types';

export interface ReplanInput {
  currentPlan: PlanVersion;
  event: ReplanEvent;
  preferences: Preferences;
  /** Full, up-to-date task pool (should already include a newly-added task for `new_task`). */
  tasks: Task[];
  now: ISODateTime;
  idGen: () => string;
}

/**
 * A block counts as history (frozen, copied verbatim) only once it has
 * fully finished by the real report time. This slice doesn't track partial
 * completion of an in-progress focus session (that's the adaptive-loop
 * phase in the blueprint), so a block still running — or still ahead —
 * when the event fires is treated as reconsiderable, not sacred, unless
 * its flexibility already pins it (a fixed commitment or a non-movable
 * task, which stay busy for the reallocation window regardless).
 */
function isFrozen(block: PlanBlock, reportTime: ISODateTime): boolean {
  return new Date(block.end).getTime() <= new Date(reportTime).getTime();
}

function shiftInterval(interval: Interval, minutesEarlier: number, notBefore: ISODateTime): Interval {
  const shiftedStart = addMinutesToISO(interval.start, -minutesEarlier);
  const start = new Date(shiftedStart).getTime() < new Date(notBefore).getTime() ? notBefore : shiftedStart;
  const duration = durationMinutes(interval);
  return { start, end: addMinutesToISO(start, duration) };
}

interface AttemptResult {
  mealBlocks: PlanBlock[];
  taskBlocks: PlanBlock[];
  unplaced: Task[];
  unplacedMustPlace: Task[];
}

function attemptAllocation(params: {
  effectiveNow: ISODateTime;
  dayWindowEnd: ISODateTime;
  fixedFuture: PlanBlock[];
  mealFuture: PlanBlock[];
  pool: Task[];
  preferredFocusBlocks: Interval[];
  mealShiftMinutes: number;
  idGen: () => string;
}): AttemptResult {
  const mealBlocks: PlanBlock[] = params.mealFuture.map((meal) => {
    if (params.mealShiftMinutes === 0) return meal;
    const shifted = shiftInterval(meal, params.mealShiftMinutes, params.effectiveNow);
    return { ...meal, start: shifted.start, end: shifted.end };
  });

  const busy: Interval[] = [...params.fixedFuture, ...mealBlocks];
  const gaps = computeFreeGaps({ start: params.effectiveNow, end: params.dayWindowEnd }, busy);

  const { blocks: taskBlocks, unplaced } = allocateTasksToGaps({
    gaps,
    tasks: params.pool,
    preferredFocusBlocks: params.preferredFocusBlocks,
    breakEveryMinutes: BREAK_EVERY_MINUTES,
    breakMinutes: BREAK_MINUTES,
    idGen: params.idGen,
  });

  const mustPlaceToday = params.pool.filter((t) => isUrgentToday(t, params.dayWindowEnd));
  const unplacedMustPlace = unplaced.filter((t) => mustPlaceToday.includes(t));

  return { mealBlocks, taskBlocks, unplaced, unplacedMustPlace };
}

/**
 * Produces a revised, proposed plan in response to an interruption. Never
 * mutates or deletes the current plan; fixed commitments, sleep, and any
 * already-elapsed portion of the day are preserved exactly.
 */
export function replan(input: ReplanInput): PlanVersion {
  const { currentPlan, event, preferences, idGen } = input;
  const dayWindow = dayWindowFor(currentPlan.date, preferences);
  const preferredFocusBlocks = preferredFocusIntervalsFor(currentPlan.date, preferences);

  const effectiveNow =
    event.type === 'late_start' ? addMinutesToISO(input.now, event.delayMinutes) : input.now;
  const clampedNow =
    new Date(effectiveNow).getTime() < new Date(dayWindow.start).getTime() ? dayWindow.start : effectiveNow;

  const explanations: string[] = [];

  if (new Date(clampedNow).getTime() >= new Date(dayWindow.end).getTime()) {
    explanations.push('No time remains before bedtime; nothing further can be scheduled today.');
    const pool = sortTaskPool(input.tasks.filter(isEligibleForPool));
    const unscheduledTasks: TaskRef[] = [];
    const atRiskTasks: TaskRef[] = [];
    for (const task of pool) {
      const ref: TaskRef = { taskId: task.id, title: task.title, reason: 'No time left today.' };
      if (isUrgentToday(task, dayWindow.end)) atRiskTasks.push(ref);
      else unscheduledTasks.push(ref);
    }
    return {
      id: idGen(),
      version: currentPlan.version + 1,
      parentVersionId: currentPlan.id,
      date: currentPlan.date,
      status: 'proposed',
      blocks: currentPlan.blocks,
      unscheduledTasks,
      atRiskTasks,
      changes: [],
      explanations,
      triggeredBy: event,
      createdAt: input.now,
    };
  }

  const frozen = currentPlan.blocks.filter((b) => isFrozen(b, input.now));
  const future = currentPlan.blocks.filter((b) => !isFrozen(b, input.now));
  const frozenTaskIds = new Set(frozen.filter((b) => b.taskId).map((b) => b.taskId as string));

  const fixedFuture = future.filter((b) => b.flexibility === 'fixed');
  const mealFuture = future.filter((b) => b.kind === 'meal');

  const pool = sortTaskPool(
    input.tasks.filter((t) => isEligibleForPool(t) && t.canMove && !frozenTaskIds.has(t.id))
  );

  const attemptParams = {
    effectiveNow: clampedNow,
    dayWindowEnd: dayWindow.end,
    fixedFuture,
    mealFuture,
    pool,
    preferredFocusBlocks,
    idGen,
  };

  const first = attemptAllocation({ ...attemptParams, mealShiftMinutes: 0 });
  let chosen = first;
  let mealShiftApplied = 0;

  if (first.unplacedMustPlace.length > 0 && mealFuture.length > 0) {
    const second = attemptAllocation({ ...attemptParams, mealShiftMinutes: MEAL_SHIFT_TOLERANCE_MINUTES });
    if (second.unplacedMustPlace.length < first.unplacedMustPlace.length) {
      chosen = second;
      mealShiftApplied = MEAL_SHIFT_TOLERANCE_MINUTES;
      explanations.push(
        `Shifted meal timing by up to ${MEAL_SHIFT_TOLERANCE_MINUTES} minutes to make room for urgent work.`
      );
    }
  }

  const newBlocks = [...frozen, ...fixedFuture, ...chosen.mealBlocks, ...chosen.taskBlocks].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const unscheduledTasks: TaskRef[] = [];
  const atRiskTasks: TaskRef[] = [];
  for (const task of chosen.unplaced) {
    const ref: TaskRef = {
      taskId: task.id,
      title: task.title,
      reason: `Needs ${task.estimateMinutes} min but no free slot of that length remains today.`,
    };
    if (isUrgentToday(task, dayWindow.end)) atRiskTasks.push(ref);
    else unscheduledTasks.push(ref);
  }

  const changes: PlanChange[] = [];
  const oldBlockByTaskId = new Map(currentPlan.blocks.filter((b) => b.taskId).map((b) => [b.taskId as string, b]));
  const newBlockByTaskId = new Map(newBlocks.filter((b) => b.taskId).map((b) => [b.taskId as string, b]));

  for (const [taskId, oldBlock] of oldBlockByTaskId) {
    if (frozenTaskIds.has(taskId)) continue; // already happened; not part of the diff
    const newBlock = newBlockByTaskId.get(taskId);
    if (!newBlock) {
      changes.push({
        taskId,
        title: oldBlock.title,
        type: 'deferred',
        previousStart: oldBlock.start,
        previousEnd: oldBlock.end,
        reason: 'Deferred to make room for higher-priority or more urgent work.',
      });
      continue;
    }
    if (newBlock.start === oldBlock.start && newBlock.end === oldBlock.end) continue; // unchanged
    const oldDuration = durationMinutes(oldBlock);
    const newDuration = durationMinutes(newBlock);
    changes.push({
      taskId,
      title: newBlock.title,
      type: newDuration < oldDuration ? 'shortened' : 'moved',
      previousStart: oldBlock.start,
      previousEnd: oldBlock.end,
      newStart: newBlock.start,
      newEnd: newBlock.end,
      reason:
        newDuration < oldDuration
          ? 'Session shortened to fit around the new plan.'
          : 'Moved to make room for higher-priority or more urgent work.',
    });
  }

  for (const [taskId, newBlock] of newBlockByTaskId) {
    if (!oldBlockByTaskId.has(taskId)) {
      changes.push({
        taskId,
        title: newBlock.title,
        type: 'added',
        newStart: newBlock.start,
        newEnd: newBlock.end,
        reason: eventReason(event),
      });
    }
  }

  if (mealShiftApplied > 0) {
    for (const mealBlock of chosen.mealBlocks) {
      const original = mealFuture.find((m) => m.id === mealBlock.id);
      if (original && original.start !== mealBlock.start) {
        changes.push({
          title: mealBlock.title,
          type: 'moved',
          previousStart: original.start,
          previousEnd: original.end,
          newStart: mealBlock.start,
          newEnd: mealBlock.end,
          reason: 'Shifted slightly to make room for an urgent task while keeping full duration.',
        });
      }
    }
  }

  if (atRiskTasks.length > 0) {
    explanations.push(
      `Even after adjusting the schedule, ${atRiskTasks.length} urgent task(s) do not fit: ${atRiskTasks
        .map((t) => t.title)
        .join(', ')}. Choose what to drop, delegate, or move the deadline.`
    );
  }
  explanations.push(eventReason(event));

  return {
    id: idGen(),
    version: currentPlan.version + 1,
    parentVersionId: currentPlan.id,
    date: currentPlan.date,
    status: 'proposed',
    blocks: newBlocks,
    unscheduledTasks,
    atRiskTasks,
    changes,
    explanations,
    triggeredBy: event,
    createdAt: input.now,
  };
}

function eventReason(event: ReplanEvent): string {
  switch (event.type) {
    case 'new_task':
      return 'Replanned after an urgent task was added.';
    case 'late_start':
      return `Replanned after a ${event.delayMinutes}-minute delay was reported.`;
    case 'event_changed':
      return `Replanned after: ${event.description}`;
    case 'energy_changed':
      return `Replanned for ${event.level} energy.`;
    default:
      return 'Replanned.';
  }
}
