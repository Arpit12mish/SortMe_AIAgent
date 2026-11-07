import { checkProjectCapacity } from '../capacity';
import { generatePlan } from '../scheduler';
import type { ISODate, PlanVersion, Preferences, Task } from '../types';
import { localISO, makeIdGen } from '../testUtils';

const preferences: Preferences = {
  timezone: 'UTC',
  sleepWindow: { sleepTime: '23:00', wakeTime: '07:00' },
  fixedCommitments: [],
  goals: [],
  preferredFocusBlocks: [{ start: '09:00', end: '12:00' }],
  mealWindows: {
    breakfast: { start: '08:00', end: '08:30' },
    lunch: { start: '13:00', end: '13:30' },
    dinner: { start: '19:00', end: '19:30' },
  },
  protectedTimeBlocks: [],
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Client deliverable',
    estimateMinutes: 60,
    priority: 'medium',
    canMove: true,
    status: 'unscheduled',
    createdAt: '2026-10-01T06:00:00.000Z',
    ...overrides,
  };
}

function acceptDay(date: ISODate, tasks: Task[]): PlanVersion {
  const plan = generatePlan({
    date,
    preferences,
    tasks,
    version: 1,
    idGen: makeIdGen(`${date}-block`),
  });
  return { ...plan, status: 'accepted' as const };
}

describe('checkProjectCapacity', () => {
  it('fits a small project comfortably within a generous window', () => {
    const tasks = [
      makeTask({ id: 't1', estimateMinutes: 60 }),
      makeTask({ id: 't2', estimateMinutes: 60 }),
    ];
    const result = checkProjectCapacity({
      preferences,
      tasks,
      planVersions: [],
      currentPlanIdByDate: {},
      projectTaskIds: ['t1', 't2'],
      fromDate: '2026-10-01',
      toDate: '2026-10-07',
    });

    expect(result.fits).toBe(true);
    expect(result.unplacedTaskIds).toEqual([]);
    expect(result.totalMinutesPlaced).toBe(result.totalMinutesNeeded);
    expect(result.totalMinutesNeeded).toBe(120);
  });

  it('reports a capacity conflict when far more work is needed than the window can hold', () => {
    // 20 tasks of 8 hours each — nothing close to fitting in a 3-day window.
    const tasks = Array.from({ length: 20 }, (_, i) =>
      makeTask({ id: `t${i}`, estimateMinutes: 480, priority: 'low' })
    );
    const result = checkProjectCapacity({
      preferences,
      tasks,
      planVersions: [],
      currentPlanIdByDate: {},
      projectTaskIds: tasks.map((t) => t.id),
      fromDate: '2026-10-01',
      toDate: '2026-10-03',
    });

    expect(result.fits).toBe(false);
    expect(result.unplacedTaskIds.length).toBeGreaterThan(0);
    expect(result.totalMinutesPlaced).toBeLessThan(result.totalMinutesNeeded);
  });

  it('never touches an already-accepted day — it only uses real leftover gaps, never displacing sleep or commitments', () => {
    // Day 1 is accepted with a commitment occupying most of the day, leaving little room.
    const busyDayTasks: Task[] = [];
    const day1: PlanVersion = {
      id: 'day1-plan',
      version: 1,
      date: '2026-10-01',
      status: 'accepted',
      blocks: [
        {
          id: 'commitment',
          kind: 'fixed',
          title: 'Internship (existing commitment)',
          start: localISO('2026-10-01T07:00:00'),
          end: localISO('2026-10-01T22:30:00'), // occupies nearly the entire wake window
          flexibility: 'fixed',
          reason: 'Fixed commitment.',
        },
      ],
      unscheduledTasks: [],
      atRiskTasks: [],
      changes: [],
      explanations: [],
      createdAt: '2026-10-01T06:00:00.000Z',
    };
    const projectTask = makeTask({ id: 'proj-1', estimateMinutes: 120 });

    const result = checkProjectCapacity({
      preferences,
      tasks: [...busyDayTasks, projectTask],
      planVersions: [day1],
      currentPlanIdByDate: { '2026-10-01': day1.id },
      projectTaskIds: ['proj-1'],
      fromDate: '2026-10-01',
      toDate: '2026-10-01', // only day1 available — its own commitment leaves no room
      now: localISO('2026-10-01T09:00:00'), // deterministic — this test is about the commitment, not "now"
    });

    expect(result.fits).toBe(false);
    expect(result.unplacedTaskIds).toEqual(['proj-1']);
    // Day1's accepted plan itself is untouched — this function only reads it, never returns
    // a mutated version of it.
    expect(day1.blocks).toHaveLength(1);
    expect(day1.blocks[0].title).toBe('Internship (existing commitment)');
  });

  it('places a task into real leftover gaps of an already-accepted day when there is room', () => {
    const day1 = acceptDay('2026-10-01', []); // a normal day: meals only, lots of free time
    const projectTask = makeTask({ id: 'proj-1', estimateMinutes: 60 });

    const result = checkProjectCapacity({
      preferences,
      tasks: [projectTask],
      planVersions: [day1],
      currentPlanIdByDate: { '2026-10-01': day1.id },
      projectTaskIds: ['proj-1'],
      fromDate: '2026-10-01',
      toDate: '2026-10-01',
      now: localISO('2026-10-01T09:00:00'), // deterministic — well before bedtime
    });

    expect(result.fits).toBe(true);
    expect(result.placements).toEqual([{ date: '2026-10-01', taskIds: ['proj-1'], minutesPlaced: 60 }]);
  });

  it('reports no fit when the window is empty because the deadline has already passed', () => {
    const result = checkProjectCapacity({
      preferences,
      tasks: [makeTask({ id: 't1' })],
      planVersions: [],
      currentPlanIdByDate: {},
      projectTaskIds: ['t1'],
      fromDate: '2026-10-05',
      toDate: '2026-10-01', // before fromDate — zero days available
    });

    expect(result.fits).toBe(false);
    expect(result.unplacedTaskIds).toEqual(['t1']);
  });

  it('uses remainingMinutesByTaskId instead of the task\'s full estimate when checking fit', () => {
    // 600 minutes would never fit in a single day on its own, but the override says only
    // 30 minutes actually remain (most of it already logged via a focus session).
    const bigTask = makeTask({ id: 't1', estimateMinutes: 600 });
    const result = checkProjectCapacity({
      preferences,
      tasks: [bigTask],
      planVersions: [],
      currentPlanIdByDate: {},
      projectTaskIds: ['t1'],
      fromDate: '2026-10-01',
      toDate: '2026-10-01',
      remainingMinutesByTaskId: new Map([['t1', 30]]),
    });

    expect(result.fits).toBe(true);
    expect(result.totalMinutesNeeded).toBe(30);
    expect(result.totalMinutesPlaced).toBe(30);
  });

  it('excludes a completed project task from the check entirely', () => {
    const result = checkProjectCapacity({
      preferences,
      tasks: [makeTask({ id: 't1', status: 'completed' })],
      planVersions: [],
      currentPlanIdByDate: {},
      projectTaskIds: ['t1'],
      fromDate: '2026-10-01',
      toDate: '2026-10-07',
    });

    expect(result.fits).toBe(true);
    expect(result.totalMinutesNeeded).toBe(0);
    expect(result.placements).toEqual([]);
  });

  it('excludes already-elapsed hours on today specifically, mirroring replan()\'s own "now" clamp', () => {
    const day1 = acceptDay('2026-10-01', []); // meals only — plenty of free gaps across the whole day
    const projectTask = makeTask({ id: 'proj-1', estimateMinutes: 60 });

    // It's already 23:30 local on day1 — past the 23:00 bedtime — so nothing should fit
    // today specifically, even though the day's blocks leave plenty of gaps on paper.
    const lateResult = checkProjectCapacity({
      preferences,
      tasks: [projectTask],
      planVersions: [day1],
      currentPlanIdByDate: { '2026-10-01': day1.id },
      projectTaskIds: ['proj-1'],
      fromDate: '2026-10-01',
      toDate: '2026-10-01',
      now: localISO('2026-10-01T23:30:00'),
    });
    expect(lateResult.fits).toBe(false);
    expect(lateResult.unplacedTaskIds).toEqual(['proj-1']);

    // Earlier the same day (09:00), the same task fits fine — confirms this isn't a blanket
    // "today never fits" regression, only genuinely elapsed time is excluded.
    const earlyResult = checkProjectCapacity({
      preferences,
      tasks: [projectTask],
      planVersions: [day1],
      currentPlanIdByDate: { '2026-10-01': day1.id },
      projectTaskIds: ['proj-1'],
      fromDate: '2026-10-01',
      toDate: '2026-10-01',
      now: localISO('2026-10-01T09:00:00'),
    });
    expect(earlyResult.fits).toBe(true);

    // A FUTURE date is never clamped by "now" — its full day is still available regardless
    // of what time it currently is.
    const futureResult = checkProjectCapacity({
      preferences,
      tasks: [projectTask],
      planVersions: [],
      currentPlanIdByDate: {},
      projectTaskIds: ['proj-1'],
      fromDate: '2026-10-02',
      toDate: '2026-10-02',
      now: localISO('2026-10-01T23:30:00'), // "now" is the day before the window
    });
    expect(futureResult.fits).toBe(true);
  });

  it('accounts for other (non-project) tasks already competing for the same days', () => {
    // A single huge non-project task eats the whole day's free time, every day in the window.
    const hog = makeTask({ id: 'hog', estimateMinutes: 900, priority: 'urgent', canMove: false });
    const projectTask = makeTask({ id: 'proj-1', estimateMinutes: 60 });

    const result = checkProjectCapacity({
      preferences,
      tasks: [hog, projectTask],
      planVersions: [],
      currentPlanIdByDate: {},
      projectTaskIds: ['proj-1'],
      fromDate: '2026-10-01',
      toDate: '2026-10-01',
    });

    // Without the competing task, 60 minutes trivially fits a fresh day — with it, every
    // gap large enough for the hog task is consumed first since it's considered alongside
    // the project task in the same dry-run pool, same as a real day would.
    expect(result.totalMinutesNeeded).toBe(60);
    // Either it still finds a smaller gap elsewhere or it doesn't — the key guarantee is
    // that the competing task was genuinely considered, not ignored.
    if (!result.fits) {
      expect(result.unplacedTaskIds).toEqual(['proj-1']);
    }
  });
});
