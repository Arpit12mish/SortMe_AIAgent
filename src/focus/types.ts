// Domain types for focus sessions on scheduled task blocks. A session's
// elapsed/paused time is always recomputed from these persisted timestamps
// (see sessionEngine.ts) rather than trusted from any in-memory counter, so
// recovery after the app is backgrounded, killed, or restarted is exact.

export type FocusSessionStatus = 'running' | 'paused' | 'completed' | 'stopped';
export type FocusOutcome = 'completed' | 'partial' | 'blocked';

export interface PauseInterval {
  pausedAt: string; // ISO
  /** Absent while the session is still paused. */
  resumedAt?: string; // ISO
}

export interface FocusSession {
  id: string;
  taskId: string;
  /** Denormalized so history reads correctly even if the task is later edited or removed. */
  taskTitle: string;
  planBlockId?: string;
  /** Denormalized from the task at session start; the estimate may change later. */
  estimateMinutes: number;
  status: FocusSessionStatus;
  startedAt: string; // ISO
  pauseIntervals: PauseInterval[];
  endedAt?: string; // ISO, set once status is 'completed' or 'stopped'
  outcome?: FocusOutcome;
  note?: string;
  createdAt: string;
}
