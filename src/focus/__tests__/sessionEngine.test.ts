import type { Task } from '../../planning/types';
import {
  accumulatedPausedMs,
  canStartNewSession,
  elapsedMs,
  endSession,
  findActiveSession,
  loggedMinutesForTask,
  pauseSession,
  remainingEstimateMinutes,
  remainingMs,
  resumeSession,
  startSession,
} from '../sessionEngine';
import type { FocusSession } from '../types';

const T0 = new Date('2026-10-07T09:00:00').getTime();
const iso = (offsetMinutes: number) => new Date(T0 + offsetMinutes * 60_000).toISOString();

describe('sessionEngine — elapsed time recovery', () => {
  it('computes elapsed purely from persisted timestamps, with no ticking counter involved', () => {
    const session = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Write report',
      estimateMinutes: 60,
      nowIso: iso(0),
    });

    // Simulate the app being killed and reopened 25 minutes later: elapsed
    // must be derivable from startedAt alone, not from any running interval.
    const elapsed = elapsedMs(session, T0 + 25 * 60_000);
    expect(elapsed).toBe(25 * 60_000);
  });

  it('recovers the correct elapsed time even when "now" is passed long after the session started', () => {
    const session = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Deep work',
      estimateMinutes: 30,
      nowIso: iso(0),
    });
    // Equivalent to reopening the app 3 hours later.
    const elapsed = elapsedMs(session, T0 + 3 * 60 * 60_000);
    expect(elapsed).toBe(3 * 60 * 60_000);
    expect(remainingMs(session, T0 + 3 * 60 * 60_000)).toBeLessThan(0); // overrun
  });

  it('freezes elapsed time while paused, regardless of how much later it is queried', () => {
    let session = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Reading',
      estimateMinutes: 45,
      nowIso: iso(0),
    });
    session = pauseSession(session, iso(10)); // paused after 10 minutes of work

    // Query elapsed at various points while still paused — must not advance.
    expect(elapsedMs(session, T0 + 10 * 60_000)).toBe(10 * 60_000);
    expect(elapsedMs(session, T0 + 120 * 60_000)).toBe(10 * 60_000); // 2 hours later, still frozen
  });
});

describe('sessionEngine — paused duration accounting', () => {
  it('subtracts a single pause/resume cycle from elapsed time', () => {
    let session = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Coding',
      estimateMinutes: 60,
      nowIso: iso(0),
    });
    session = pauseSession(session, iso(20)); // worked 20 min
    session = resumeSession(session, iso(35)); // paused 15 min

    const elapsed = elapsedMs(session, T0 + 45 * 60_000); // 10 more minutes of work
    expect(elapsed).toBe(30 * 60_000); // 20 + 10, the 15-minute pause excluded
  });

  it('subtracts multiple pause/resume cycles correctly', () => {
    let session = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Studying',
      estimateMinutes: 90,
      nowIso: iso(0),
    });
    session = pauseSession(session, iso(15));
    session = resumeSession(session, iso(20)); // +5 min paused
    session = pauseSession(session, iso(40));
    session = resumeSession(session, iso(50)); // +10 min paused

    const totalPaused = accumulatedPausedMs(session, T0 + 60 * 60_000);
    expect(totalPaused).toBe(15 * 60_000);

    const elapsed = elapsedMs(session, T0 + 60 * 60_000);
    // Worked: 0-15, 20-40, 50-60 = 15 + 20 + 10 = 45 minutes.
    expect(elapsed).toBe(45 * 60_000);
  });

  it('ending a session while paused stops the open pause interval from continuing to count', () => {
    let session = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Planning',
      estimateMinutes: 30,
      nowIso: iso(0),
    });
    session = pauseSession(session, iso(10));
    const ended = endSession(session, { mode: 'stopped_early', outcome: 'partial', nowIso: iso(10) });

    expect(ended.pauseIntervals[0].resumedAt).toBe(iso(10));
    // Elapsed queried long after ending must not keep growing.
    expect(elapsedMs(ended, T0 + 5 * 60 * 60_000)).toBe(10 * 60_000);
  });
});

describe('sessionEngine — duplicate session prevention', () => {
  it('reports no active session in an empty list', () => {
    expect(canStartNewSession([])).toBe(true);
    expect(findActiveSession([])).toBeUndefined();
  });

  it('refuses to start a new session while one is running', () => {
    const running = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Task A',
      estimateMinutes: 30,
      nowIso: iso(0),
    });
    expect(canStartNewSession([running])).toBe(false);
    expect(() =>
      startSession([running], { id: 's2', taskId: 't2', taskTitle: 'Task B', estimateMinutes: 20, nowIso: iso(5) })
    ).toThrow(/already active/);
  });

  it('refuses to start a new session while one is paused', () => {
    let session = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Task A',
      estimateMinutes: 30,
      nowIso: iso(0),
    });
    session = pauseSession(session, iso(5));
    expect(canStartNewSession([session])).toBe(false);
  });

  it('allows starting a new session once the previous one has finished', () => {
    let session = startSession([], {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Task A',
      estimateMinutes: 30,
      nowIso: iso(0),
    });
    session = endSession(session, { mode: 'finished', outcome: 'completed', nowIso: iso(30) });
    expect(canStartNewSession([session])).toBe(true);

    const next = startSession([session], {
      id: 's2',
      taskId: 't2',
      taskTitle: 'Task B',
      estimateMinutes: 15,
      nowIso: iso(31),
    });
    expect(next.id).toBe('s2');
  });

  it('ignores completed/stopped sessions from other days when checking for an active one', () => {
    const completed: FocusSession = {
      id: 'old',
      taskId: 't0',
      taskTitle: 'Yesterday task',
      estimateMinutes: 20,
      status: 'completed',
      startedAt: iso(-24 * 60),
      pauseIntervals: [],
      endedAt: iso(-24 * 60 + 20),
      outcome: 'completed',
      createdAt: iso(-24 * 60),
    };
    expect(canStartNewSession([completed])).toBe(true);
  });
});

describe('sessionEngine — remaining estimate for rollover', () => {
  const task: Task = {
    id: 'task-x',
    title: 'Write report',
    estimateMinutes: 90,
    priority: 'medium',
    canMove: true,
    status: 'scheduled',
    createdAt: iso(-60),
  };

  it('logs zero minutes and returns the full estimate when no sessions exist for the task', () => {
    expect(loggedMinutesForTask([], 'task-x')).toBe(0);
    expect(remainingEstimateMinutes(task, [])).toBe(90);
  });

  it('subtracts real logged time from a single stopped (partial) session — never invents extra progress', () => {
    const stopped: FocusSession = {
      id: 's1',
      taskId: 'task-x',
      taskTitle: 'Write report',
      estimateMinutes: 90,
      status: 'stopped',
      startedAt: iso(0),
      pauseIntervals: [],
      endedAt: iso(30), // 30 real minutes logged
      outcome: 'partial',
      createdAt: iso(0),
    };
    expect(loggedMinutesForTask([stopped], 'task-x')).toBe(30);
    expect(remainingEstimateMinutes(task, [stopped])).toBe(60); // 90 - 30
  });

  it('sums logged time across multiple ended sessions for the same task', () => {
    const first: FocusSession = {
      id: 's1',
      taskId: 'task-x',
      taskTitle: 'Write report',
      estimateMinutes: 90,
      status: 'stopped',
      startedAt: iso(0),
      pauseIntervals: [],
      endedAt: iso(20),
      outcome: 'partial',
      createdAt: iso(0),
    };
    const second: FocusSession = {
      id: 's2',
      taskId: 'task-x',
      taskTitle: 'Write report',
      estimateMinutes: 90,
      status: 'stopped',
      startedAt: iso(60),
      pauseIntervals: [],
      endedAt: iso(85), // another 25 minutes
      outcome: 'partial',
      createdAt: iso(60),
    };
    expect(loggedMinutesForTask([first, second], 'task-x')).toBe(45);
    expect(remainingEstimateMinutes(task, [first, second])).toBe(45); // 90 - 45
  });

  it('never counts a still-active (running/paused) session as logged time', () => {
    const running: FocusSession = {
      id: 's1',
      taskId: 'task-x',
      taskTitle: 'Write report',
      estimateMinutes: 90,
      status: 'running',
      startedAt: iso(0),
      pauseIntervals: [],
      createdAt: iso(0),
    };
    expect(loggedMinutesForTask([running], 'task-x')).toBe(0);
    expect(remainingEstimateMinutes(task, [running])).toBe(90);
  });

  it('floors the remaining estimate at MIN_ROLLOVER_MINUTES once logged time has eaten into it, instead of collapsing to zero', () => {
    const ranLong: FocusSession = {
      id: 's1',
      taskId: 'task-x',
      taskTitle: 'Write report',
      estimateMinutes: 90,
      status: 'stopped',
      startedAt: iso(0),
      pauseIntervals: [],
      endedAt: iso(85), // 85 of 90 minutes already logged, never marked completed
      outcome: 'partial',
      createdAt: iso(0),
    };
    expect(remainingEstimateMinutes(task, [ranLong])).toBe(15); // floored, not 5
  });

  it('ignores sessions belonging to a different task', () => {
    const otherTask: FocusSession = {
      id: 's1',
      taskId: 'task-y',
      taskTitle: 'Different task',
      estimateMinutes: 30,
      status: 'stopped',
      startedAt: iso(0),
      pauseIntervals: [],
      endedAt: iso(30),
      outcome: 'partial',
      createdAt: iso(0),
    };
    expect(loggedMinutesForTask([otherTask], 'task-x')).toBe(0);
    expect(remainingEstimateMinutes(task, [otherTask])).toBe(90);
  });
});
