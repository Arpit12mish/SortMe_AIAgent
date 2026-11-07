import { allocateTasksToGaps } from './allocate';
import { BREAK_EVERY_MINUTES, BREAK_MINUTES, PROTECTED_SHIFT_TOLERANCE_MINUTES } from './constants';
import { isEligibleForPool, isUrgentToday, sortTaskPool } from './priority';
import {
  dayWindowFor,
  fixedBlocksFor,
  mealBlocksFor,
  preferredFocusIntervalsFor,
  protectedTimeBlocksFor,
  travelBlocksFor,
} from './scheduler';
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
  /** Tasks already claimed by another date's accepted plan — see GeneratePlanInput.excludeTaskIds. */
  excludeTaskIds?: Set<string>;
  /**
   * The task currently being worked on in an active (running or paused) focus session, if
   * any. Its scheduled block is frozen exactly where it is for this replan regardless of
   * task.canMove — the user is literally in the middle of it right now. A focus session can
   * only ever be active against today's plan, so callers must leave this unset when
   * replanning any other date.
   */
  activeSessionTaskId?: string;
}

/**
 * A block counts as history (frozen, copied verbatim) only once it has
 * fully finished by the real report time. A block still running — or still
 * ahead — when the event fires is treated as reconsiderable, not sacred,
 * unless its flexibility already pins it: a fixed commitment, a non-movable
 * task, or a task with an active focus session (see
 * ReplanInput.activeSessionTaskId) all stay busy for the reallocation
 * window regardless.
 */
function isFrozen(block: PlanBlock, reportTime: ISODateTime): boolean {
  return new Date(block.end).getTime() <= new Date(reportTime).getTime();
}

/**
 * A preference-driven block (commitment, meal, protected time) that hasn't started yet
 * is safe to replace with a freshly-regenerated one when preferences change. One that has
 * already started — even though isFrozen doesn't consider it "history" yet, since it hasn't
 * ended — must not be retroactively moved or deleted just because the user is editing it
 * right now; it's carried forward verbatim instead.
 */
function hasNotStarted(block: PlanBlock, reportTime: ISODateTime): boolean {
  return new Date(block.start).getTime() > new Date(reportTime).getTime();
}

function shiftInterval(interval: Interval, minutesEarlier: number, notBefore: ISODateTime): Interval {
  const shiftedStart = addMinutesToISO(interval.start, -minutesEarlier);
  const start = new Date(shiftedStart).getTime() < new Date(notBefore).getTime() ? notBefore : shiftedStart;
  const duration = durationMinutes(interval);
  return { start, end: addMinutesToISO(start, duration) };
}

interface AttemptResult {
  protectedBlocks: PlanBlock[];
  taskBlocks: PlanBlock[];
  unplaced: Task[];
  unplacedMustPlace: Task[];
}

function attemptAllocation(params: {
  effectiveNow: ISODateTime;
  dayWindowEnd: ISODateTime;
  fixedFuture: PlanBlock[];
  protectedFuture: PlanBlock[];
  pool: Task[];
  preferredFocusBlocks: Interval[];
  protectedShiftMinutes: number;
  breakEveryMinutes: number;
  idGen: () => string;
}): AttemptResult {
  const protectedBlocks: PlanBlock[] = params.protectedFuture.map((block) => {
    if (params.protectedShiftMinutes === 0) return block;
    const shifted = shiftInterval(block, params.protectedShiftMinutes, params.effectiveNow);
    return { ...block, start: shifted.start, end: shifted.end };
  });

  const busy: Interval[] = [...params.fixedFuture, ...protectedBlocks];
  const gaps = computeFreeGaps({ start: params.effectiveNow, end: params.dayWindowEnd }, busy);

  const { blocks: taskBlocks, unplaced } = allocateTasksToGaps({
    gaps,
    tasks: params.pool,
    preferredFocusBlocks: params.preferredFocusBlocks,
    breakEveryMinutes: params.breakEveryMinutes,
    breakMinutes: BREAK_MINUTES,
    idGen: params.idGen,
  });

  const mustPlaceToday = params.pool.filter((t) => isUrgentToday(t, params.dayWindowEnd));
  const unplacedMustPlace = unplaced.filter((t) => mustPlaceToday.includes(t));

  return { protectedBlocks, taskBlocks, unplaced, unplacedMustPlace };
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
    const pool = sortTaskPool(
      input.tasks.filter(isEligibleForPool).filter((t) => !input.excludeTaskIds?.has(t.id))
    );
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

  // Pinned (non-movable) task blocks are derived from the LIVE task, not the block's stale
  // flexibility snapshot — allocate.ts sets flexibility from task.canMove once, at allocation
  // time, so editing a task's movability afterward must be re-read from the task itself or the
  // task silently disappears from the plan (not scheduled, not unscheduled, not at-risk).
  // A task with an active focus session is pinned the same way regardless of its own canMove —
  // the user is literally in the middle of it right now, so it must not move, shrink, or be
  // deferred by this replan no matter what else is happening. It becomes ordinarily movable
  // again only once the caller stops passing activeSessionTaskId for it (i.e. once that
  // session ends).
  const taskById = new Map(input.tasks.map((t) => [t.id, t]));
  const pinnedTaskFuture: PlanBlock[] = future
    .filter(
      (b) =>
        b.taskId &&
        (taskById.get(b.taskId)?.canMove === false || b.taskId === input.activeSessionTaskId)
    )
    .map((b) => {
      const isActiveSessionBlock = b.taskId === input.activeSessionTaskId;
      // flexibility is forced to 'fixed' regardless of the block's original (possibly stale)
      // value — a task just edited to non-movable, or now mid-session, is pinned now, even if
      // its block was allocated back when it was still ordinarily movable.
      if (isActiveSessionBlock || !hasNotStarted(b, input.now)) {
        return { ...b, flexibility: 'fixed' as const }; // in progress (or mid-session) — don't retroactively resize
      }
      const task = taskById.get(b.taskId as string)!;
      return {
        ...b,
        title: task.title,
        end: addMinutesToISO(b.start, task.estimateMinutes),
        flexibility: 'fixed' as const,
      };
    });

  // Commitment/meal/protected blocks are regenerated fresh from the CURRENT preferences on
  // every replan rather than carried forward from the plan being revised, so a Settings edit
  // actually changes the schedule instead of the stale block silently persisting. A block
  // that's already started (even though isFrozen doesn't call it "history" yet) is carried
  // forward verbatim instead of regenerated, so editing the very commitment you're currently
  // in can never retroactively move or delete it.
  const settledSourceIds = new Set(
    [...frozen, ...future.filter((b) => !hasNotStarted(b, input.now))]
      .filter((b) => b.sourceId)
      .map((b) => b.sourceId as string)
  );
  const inProgressPrefBlocks = future.filter(
    (b) =>
      !b.taskId &&
      (b.kind === 'fixed' || b.kind === 'meal' || b.kind === 'protected') &&
      !hasNotStarted(b, input.now)
  );
  const freshPrefBlocks = [
    ...fixedBlocksFor(currentPlan.date, preferences, idGen),
    ...travelBlocksFor(currentPlan.date, preferences, idGen),
    ...mealBlocksFor(currentPlan.date, preferences, idGen),
    ...protectedTimeBlocksFor(currentPlan.date, preferences, idGen),
  ].filter((b) => hasNotStarted(b, input.now));

  const fixedFuture = [
    ...inProgressPrefBlocks.filter((b) => b.flexibility === 'fixed'),
    ...freshPrefBlocks.filter((b) => b.flexibility === 'fixed'),
    ...pinnedTaskFuture,
  ];
  const protectedFuture = [
    ...inProgressPrefBlocks.filter((b) => b.flexibility === 'protected'),
    ...freshPrefBlocks.filter((b) => b.flexibility === 'protected'),
  ];

  const pool = sortTaskPool(
    input.tasks.filter(
      (t) =>
        isEligibleForPool(t) &&
        t.canMove &&
        !frozenTaskIds.has(t.id) &&
        t.id !== input.activeSessionTaskId &&
        !input.excludeTaskIds?.has(t.id)
    )
  );

  // A low-energy check-in doesn't change what gets scheduled, but it does
  // change the pacing: shorter stretches of focus work between breaks.
  const breakEveryMinutes =
    event.type === 'energy_changed' && event.level === 'low'
      ? Math.round(BREAK_EVERY_MINUTES / 2)
      : BREAK_EVERY_MINUTES;
  if (event.type === 'energy_changed' && event.level === 'low') {
    explanations.push(`Shorter focus stretches with more frequent breaks, since energy is reported as low.`);
  }

  const attemptParams = {
    effectiveNow: clampedNow,
    dayWindowEnd: dayWindow.end,
    fixedFuture,
    protectedFuture,
    pool,
    preferredFocusBlocks,
    breakEveryMinutes,
    idGen,
  };

  const first = attemptAllocation({ ...attemptParams, protectedShiftMinutes: 0 });
  let chosen = first;
  let protectedShiftApplied = 0;

  if (first.unplacedMustPlace.length > 0 && protectedFuture.length > 0) {
    const second = attemptAllocation({ ...attemptParams, protectedShiftMinutes: PROTECTED_SHIFT_TOLERANCE_MINUTES });
    if (second.unplacedMustPlace.length < first.unplacedMustPlace.length) {
      chosen = second;
      protectedShiftApplied = PROTECTED_SHIFT_TOLERANCE_MINUTES;
      explanations.push(
        `Shifted timing by up to ${PROTECTED_SHIFT_TOLERANCE_MINUTES} minutes to make room for urgent work.`
      );
    }
  }

  const newBlocks = [...frozen, ...fixedFuture, ...chosen.protectedBlocks, ...chosen.taskBlocks].sort(
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

  // Commitment/meal/protected blocks are diffed by sourceId the same principled way task
  // blocks are diffed by taskId above, instead of relying only on their downstream effect on
  // task placement — this is what lets "what moved and why" actually name a changed commitment.
  const oldPrefBySourceId = new Map(
    currentPlan.blocks.filter((b) => b.sourceId && !settledSourceIds.has(b.sourceId)).map((b) => [b.sourceId as string, b])
  );
  const newPrefBySourceId = new Map(newBlocks.filter((b) => b.sourceId).map((b) => [b.sourceId as string, b]));

  for (const [sourceId, oldBlock] of oldPrefBySourceId) {
    const newBlock = newPrefBySourceId.get(sourceId);
    if (!newBlock) {
      changes.push({
        title: oldBlock.title,
        type: 'deferred',
        previousStart: oldBlock.start,
        previousEnd: oldBlock.end,
        reason: 'No longer scheduled (removed or out of date range).',
      });
      continue;
    }
    if (newBlock.start === oldBlock.start && newBlock.end === oldBlock.end) continue; // unchanged
    changes.push({
      title: newBlock.title,
      type: 'moved',
      previousStart: oldBlock.start,
      previousEnd: oldBlock.end,
      newStart: newBlock.start,
      newEnd: newBlock.end,
      reason:
        protectedShiftApplied > 0 && newBlock.flexibility === 'protected'
          ? 'Shifted slightly to make room for an urgent task while keeping full duration.'
          : 'Commitment time changed.',
    });
  }

  for (const [sourceId, newBlock] of newPrefBySourceId) {
    if (!oldPrefBySourceId.has(sourceId) && !settledSourceIds.has(sourceId)) {
      changes.push({
        title: newBlock.title,
        type: 'added',
        newStart: newBlock.start,
        newEnd: newBlock.end,
        reason: 'New commitment added.',
      });
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
    case 'preferences_changed':
      return `Replanned after: ${event.summary}`;
    case 'task_edited':
      return `Replanned after: ${event.summary}`;
    default:
      return 'Replanned.';
  }
}
