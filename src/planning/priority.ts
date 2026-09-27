import type { ISODateTime, Task } from './types';
import { URGENT_HORIZON_HOURS } from './constants';

const PRIORITY_WEIGHT: Record<Task['priority'], number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Orders tasks the way the planner should consider placing them: soonest
 * deadline first, then highest priority, then insertion order (stable FIFO)
 * so equally-ranked tasks keep a predictable, explainable placement.
 */
export function compareTasks(a: Task, b: Task): number {
  const aHasDeadline = a.deadline != null;
  const bHasDeadline = b.deadline != null;
  if (aHasDeadline !== bHasDeadline) return aHasDeadline ? -1 : 1;

  if (aHasDeadline && bHasDeadline) {
    const diff = new Date(a.deadline as string).getTime() - new Date(b.deadline as string).getTime();
    if (diff !== 0) return diff;
  }

  const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  if (weightDiff !== 0) return weightDiff;

  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function sortTaskPool(tasks: Task[]): Task[] {
  return [...tasks].sort(compareTasks);
}

/** A task "must" be placed today if it's urgent or its deadline falls within the horizon. */
export function isUrgentToday(task: Task, dayWindowEndIso: ISODateTime): boolean {
  if (task.priority === 'urgent') return true;
  if (!task.deadline) return false;
  const horizonMs = URGENT_HORIZON_HOURS * 60 * 60 * 1000;
  return new Date(task.deadline).getTime() <= new Date(dayWindowEndIso).getTime() + horizonMs;
}

export function isEligibleForPool(task: Task): boolean {
  return task.status !== 'completed' && task.status !== 'delegated';
}
