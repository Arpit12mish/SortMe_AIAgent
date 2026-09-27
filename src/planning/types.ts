// Domain types shared by the planning engine, storage layer, and UI.
// Times of day are "HH:mm" 24-hour strings; plan blocks use full ISO datetimes
// once anchored to a specific date.

export type TimeString = string; // "HH:mm"
export type ISODate = string; // "YYYY-MM-DD"
export type ISODateTime = string; // full ISO 8601

export interface TimeRange {
  start: TimeString;
  end: TimeString;
}

export interface FixedCommitment {
  id: string;
  title: string;
  start: TimeString;
  end: TimeString;
  /** 0 = Sunday .. 6 = Saturday */
  daysOfWeek: number[];
  location?: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
}

export interface MealWindows {
  breakfast: TimeRange;
  lunch: TimeRange;
  dinner: TimeRange;
}

export interface Preferences {
  timezone: string;
  sleepWindow: { sleepTime: TimeString; wakeTime: TimeString };
  fixedCommitments: FixedCommitment[];
  goals: Goal[];
  preferredFocusBlocks: TimeRange[];
  mealWindows: MealWindows;
  onboardingCompletedAt?: ISODateTime;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus =
  | 'unscheduled'
  | 'scheduled'
  | 'deferred'
  | 'completed'
  | 'at_risk'
  | 'delegated';

export interface Task {
  id: string;
  title: string;
  estimateMinutes: number;
  /** Optional hard deadline. Tasks without one are scheduled opportunistically. */
  deadline?: ISODateTime;
  priority: TaskPriority;
  /**
   * Whether the planner may move this task once it has placed it.
   * false pins the task to its scheduled time the way a fixed commitment is pinned.
   */
  canMove: boolean;
  status: TaskStatus;
  createdAt: ISODateTime;
}

export type PlanBlockKind = 'fixed' | 'task' | 'break' | 'meal' | 'buffer';

/**
 * How willing the planner is to disturb a block during replanning.
 * fixed: never moved, shrunk, or removed (commitments, non-movable tasks once placed).
 * protected: full duration must exist somewhere; may shift within a small tolerance (meals).
 * flexible: may be moved, shortened, or deferred entirely (movable tasks, breaks, buffer).
 */
export type BlockFlexibility = 'fixed' | 'protected' | 'flexible';

export interface PlanBlock {
  id: string;
  kind: PlanBlockKind;
  taskId?: string;
  title: string;
  start: ISODateTime;
  end: ISODateTime;
  flexibility: BlockFlexibility;
  reason: string;
}

export type PlanChangeType = 'added' | 'moved' | 'shortened' | 'deferred';

export interface PlanChange {
  taskId?: string;
  title: string;
  type: PlanChangeType;
  previousStart?: ISODateTime;
  previousEnd?: ISODateTime;
  newStart?: ISODateTime;
  newEnd?: ISODateTime;
  reason: string;
}

export interface TaskRef {
  taskId: string;
  title: string;
  reason: string;
}

export type ReplanEvent =
  | { type: 'new_task'; taskId: string; reportedAt: ISODateTime }
  | { type: 'late_start'; taskId?: string; delayMinutes: number; reportedAt: ISODateTime }
  | { type: 'event_changed'; description: string; reportedAt: ISODateTime }
  | { type: 'energy_changed'; level: 'low' | 'normal' | 'high'; reportedAt: ISODateTime };

export type PlanStatus = 'proposed' | 'accepted' | 'discarded';

export interface PlanVersion {
  id: string;
  version: number;
  parentVersionId?: string;
  date: ISODate;
  status: PlanStatus;
  blocks: PlanBlock[];
  unscheduledTasks: TaskRef[];
  atRiskTasks: TaskRef[];
  changes: PlanChange[];
  explanations: string[];
  triggeredBy?: ReplanEvent;
  createdAt: ISODateTime;
}
