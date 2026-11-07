import { MIN_ROLLOVER_MINUTES } from '../planning/constants';
import type { Task } from '../planning/types';
import type { FocusOutcome, FocusSession, FocusSessionStatus } from './types';

const ACTIVE_STATUSES: FocusSessionStatus[] = ['running', 'paused'];

export function isActiveStatus(status: FocusSessionStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function findActiveSession(sessions: FocusSession[]): FocusSession | undefined {
  return sessions.find((s) => isActiveStatus(s.status));
}

export function canStartNewSession(sessions: FocusSession[]): boolean {
  return findActiveSession(sessions) === undefined;
}

/**
 * Total time spent paused, in ms, up to `nowMs`. An interval still open
 * (no resumedAt) counts as paused through `nowMs` itself, so elapsed time
 * stays frozen at the moment of pausing for as long as the app is closed.
 */
export function accumulatedPausedMs(session: FocusSession, nowMs: number): number {
  return session.pauseIntervals.reduce((sum, interval) => {
    const pausedAt = new Date(interval.pausedAt).getTime();
    const resumedAt = interval.resumedAt ? new Date(interval.resumedAt).getTime() : nowMs;
    return sum + Math.max(0, resumedAt - pausedAt);
  }, 0);
}

/**
 * Elapsed focus time, in ms, computed entirely from persisted timestamps —
 * never from an accumulated in-memory counter. Safe to call after any
 * amount of time backgrounded, killed, or restarted: pass the current wall
 * clock as `nowMs` and this recomputes the right answer from scratch.
 */
export function elapsedMs(session: FocusSession, nowMs: number): number {
  const clockMs = session.status === 'completed' || session.status === 'stopped'
    ? session.endedAt
      ? new Date(session.endedAt).getTime()
      : nowMs
    : session.status === 'paused'
      ? pausedClockMs(session, nowMs)
      : nowMs;
  const startedAtMs = new Date(session.startedAt).getTime();
  const paused = accumulatedPausedMs(session, clockMs);
  return Math.max(0, clockMs - startedAtMs - paused);
}

/** While paused, the clock is frozen at the moment the pause began. */
function pausedClockMs(session: FocusSession, nowMs: number): number {
  const openPause = session.pauseIntervals[session.pauseIntervals.length - 1];
  if (openPause && !openPause.resumedAt) {
    return new Date(openPause.pausedAt).getTime();
  }
  return nowMs;
}

export function remainingMs(session: FocusSession, nowMs: number): number {
  return session.estimateMinutes * 60_000 - elapsedMs(session, nowMs);
}

export function overrunMinutes(session: FocusSession, nowMs: number): number {
  return Math.max(0, Math.round((elapsedMs(session, nowMs) - session.estimateMinutes * 60_000) / 60_000));
}

/**
 * Real time logged against a task across every ENDED (completed or stopped) session —
 * always summed from actual persisted timestamps via elapsedMs, never estimated. A
 * still-active (running/paused) session doesn't count yet; it isn't "logged" until it
 * ends. A task can have several ended sessions (e.g. a partial session followed by
 * another attempt), so every one of them contributes.
 */
export function loggedMinutesForTask(sessions: FocusSession[], taskId: string): number {
  return sessions
    .filter((s) => s.taskId === taskId && !isActiveStatus(s.status))
    .reduce((sum, s) => {
      const clockMs = s.endedAt ? new Date(s.endedAt).getTime() : new Date(s.startedAt).getTime();
      return sum + elapsedMs(s, clockMs) / 60_000;
    }, 0);
}

/**
 * What's left of a task's estimate once real logged focus time is subtracted — never
 * invents completed time by assuming more was finished than sessions actually show.
 * A task with no logged sessions keeps its full original estimate unchanged. Once some
 * time IS logged, the remainder is floored at MIN_ROLLOVER_MINUTES so a task that ran
 * long but was never marked completed still gets a schedulable slot instead of
 * collapsing to zero.
 */
export function remainingEstimateMinutes(task: Task, sessions: FocusSession[]): number {
  const logged = Math.floor(loggedMinutesForTask(sessions, task.id));
  if (logged <= 0) return task.estimateMinutes;
  return Math.max(task.estimateMinutes - logged, MIN_ROLLOVER_MINUTES);
}

export interface StartSessionInput {
  id: string;
  taskId: string;
  taskTitle: string;
  planBlockId?: string;
  estimateMinutes: number;
  nowIso: string;
}

/** Throws if another session is already running or paused — enforces one active session at a time. */
export function startSession(sessions: FocusSession[], input: StartSessionInput): FocusSession {
  if (!canStartNewSession(sessions)) {
    throw new Error('A focus session is already active. Finish or stop it before starting another.');
  }
  return {
    id: input.id,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    planBlockId: input.planBlockId,
    estimateMinutes: input.estimateMinutes,
    status: 'running',
    startedAt: input.nowIso,
    pauseIntervals: [],
    createdAt: input.nowIso,
  };
}

export function pauseSession(session: FocusSession, nowIso: string): FocusSession {
  if (session.status !== 'running') {
    throw new Error(`Cannot pause a session in status "${session.status}".`);
  }
  return { ...session, status: 'paused', pauseIntervals: [...session.pauseIntervals, { pausedAt: nowIso }] };
}

export function resumeSession(session: FocusSession, nowIso: string): FocusSession {
  if (session.status !== 'paused') {
    throw new Error(`Cannot resume a session in status "${session.status}".`);
  }
  const intervals = [...session.pauseIntervals];
  const last = intervals[intervals.length - 1];
  if (last && !last.resumedAt) {
    intervals[intervals.length - 1] = { ...last, resumedAt: nowIso };
  }
  return { ...session, status: 'running', pauseIntervals: intervals };
}

export interface EndSessionInput {
  mode: 'finished' | 'stopped_early';
  outcome: FocusOutcome;
  note?: string;
  nowIso: string;
}

export function endSession(session: FocusSession, input: EndSessionInput): FocusSession {
  if (!isActiveStatus(session.status)) {
    throw new Error(`Cannot end a session in status "${session.status}".`);
  }
  // Ending while paused closes the open pause interval so it doesn't keep
  // "counting" toward paused time past the end of the session.
  const pauseIntervals =
    session.status === 'paused'
      ? session.pauseIntervals.map((interval, i) =>
          i === session.pauseIntervals.length - 1 && !interval.resumedAt
            ? { ...interval, resumedAt: input.nowIso }
            : interval
        )
      : session.pauseIntervals;
  return {
    ...session,
    status: input.mode === 'finished' ? 'completed' : 'stopped',
    pauseIntervals,
    endedAt: input.nowIso,
    outcome: input.outcome,
    note: input.note,
  };
}
