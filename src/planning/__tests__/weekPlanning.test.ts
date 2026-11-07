import { createSamplePreferences, createSampleTasks } from '../../data/sampleData';
import { generatePlan } from '../scheduler';
import type { ISODate, PlanBlock, PlanVersion, Preferences, Task } from '../types';
import { claimedTaskIdsExcluding, dateSchedulingTask, proposeAcrossDates, rolloverCandidatesFor } from '../weekPlanning';
import { localISO, makeIdGen } from '../testUtils';

function makeBlock(taskId: string): PlanBlock {
  return {
    id: `block-${taskId}`,
    kind: 'task',
    taskId,
    title: taskId,
    start: '2026-10-07T18:00:00.000Z',
    end: '2026-10-07T19:00:00.000Z',
    flexibility: 'flexible',
    reason: 'Test fixture.',
  };
}

function makePlan(date: ISODate, overrides: Partial<PlanVersion> = {}): PlanVersion {
  return {
    id: `plan-${date}`,
    version: 1,
    date,
    status: 'accepted',
    blocks: [],
    unscheduledTasks: [],
    atRiskTasks: [],
    changes: [],
    explanations: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('claimedTaskIdsExcluding', () => {
  it('collects taskIds from every OTHER date\'s accepted plan, excluding the target date itself', () => {
    const planA = makePlan('2026-10-05', { id: 'plan-a', blocks: [makeBlock('task-a')] });
    const planB = makePlan('2026-10-06', { id: 'plan-b', blocks: [makeBlock('task-b')] });
    const planC = makePlan('2026-10-07', { id: 'plan-c', blocks: [makeBlock('task-c')] });
    const currentPlanIdByDate = { '2026-10-05': 'plan-a', '2026-10-06': 'plan-b', '2026-10-07': 'plan-c' };

    const claimed = claimedTaskIdsExcluding([planA, planB, planC], currentPlanIdByDate, '2026-10-06');

    expect(claimed.has('task-a')).toBe(true);
    expect(claimed.has('task-c')).toBe(true);
    expect(claimed.has('task-b')).toBe(false); // this is the excluded date's own task
  });

  it('ignores a proposed (not-yet-accepted) plan for another date — only accepted plans claim a task', () => {
    const acceptedA = makePlan('2026-10-05', { id: 'plan-a', status: 'accepted', blocks: [makeBlock('task-a')] });
    // A pending proposal for 2026-10-06 references task-pending, but currentPlanIdByDate never
    // points at it (only an accept would do that), so it must not claim anything.
    const proposedB = makePlan('2026-10-06', { id: 'plan-b-proposed', status: 'proposed', blocks: [makeBlock('task-pending')] });
    const currentPlanIdByDate = { '2026-10-05': 'plan-a' };

    const claimed = claimedTaskIdsExcluding([acceptedA, proposedB], currentPlanIdByDate, '2026-10-07');

    expect(claimed.has('task-a')).toBe(true);
    expect(claimed.has('task-pending')).toBe(false);
  });

  it('returns an empty set when no other date has an accepted plan', () => {
    const claimed = claimedTaskIdsExcluding([], {}, '2026-10-05');
    expect(claimed.size).toBe(0);
  });
});

describe('dateSchedulingTask', () => {
  it('finds the one date whose accepted plan currently schedules the task', () => {
    const planA = makePlan('2026-10-05', { id: 'plan-a', blocks: [makeBlock('task-a')] });
    const planB = makePlan('2026-10-06', { id: 'plan-b', blocks: [makeBlock('task-b')] });
    const currentPlanIdByDate = { '2026-10-05': 'plan-a', '2026-10-06': 'plan-b' };

    expect(dateSchedulingTask([planA, planB], currentPlanIdByDate, 'task-b')).toBe('2026-10-06');
  });

  it('returns null when the task is not on any accepted plan', () => {
    const planA = makePlan('2026-10-05', { id: 'plan-a', blocks: [makeBlock('task-a')] });
    const currentPlanIdByDate = { '2026-10-05': 'plan-a' };

    expect(dateSchedulingTask([planA], currentPlanIdByDate, 'task-unscheduled')).toBeNull();
  });
});

describe('proposeAcrossDates', () => {
  // 2026-10-07 is a Wednesday (the sample "Algorithms lecture" commitment applies Mon-Fri);
  // 2026-10-10 is the following Saturday, when that commitment never applied in the first place.
  const WEDNESDAY = '2026-10-07';
  const SATURDAY = '2026-10-10';
  const NO_ACCEPTED_PLAN_DATE = '2026-10-12';

  // One shared task pool, exactly like the real app's single `state.tasks` list that's
  // independent of which date is being planned — each date's original plan and every
  // proposeAcrossDates call below must all see the SAME pool, or an unrelated difference
  // in generated deadlines (from re-deriving "sample" tasks off a different reference date)
  // would masquerade as a plan change that has nothing to do with the preference edit itself.
  function buildAcceptedPlan(date: ISODate, preferences: ReturnType<typeof createSamplePreferences>, tasks: ReturnType<typeof createSampleTasks>) {
    const plan = generatePlan({
      date,
      preferences,
      tasks,
      version: 1,
      idGen: makeIdGen(`block-${date}`),
      nowIso: localISO(`${date}T06:00:00`),
    });
    return { ...plan, status: 'accepted' as const };
  }

  it('proposes a revision only for dates whose accepted plan actually changes, skipping unaffected and ungenerated dates', () => {
    const preferences = createSamplePreferences();
    // The 3 sample tasks are already claimed by Wednesday's accepted plan — Saturday's
    // original plan is built with none of them, exactly like the real app would produce
    // (cross-day exclusion means a task can only ever be on ONE date's accepted plan at
    // once), so a real one-time task can't spuriously "change" on two dates in this test.
    const tasks = createSampleTasks(new Date(`${WEDNESDAY}T06:00:00`));
    const wednesdayPlan = buildAcceptedPlan(WEDNESDAY, preferences, tasks); // has the Mon-Fri commitment
    const saturdayPlan = buildAcceptedPlan(SATURDAY, preferences, []); // commitment never applied here; no tasks of its own

    const updatedPreferences = { ...preferences, fixedCommitments: [] }; // removes the commitment
    const now = localISO(`${WEDNESDAY}T06:30:00`);

    const proposals = proposeAcrossDates({
      planVersions: [wednesdayPlan, saturdayPlan],
      currentPlanIdByDate: { [WEDNESDAY]: wednesdayPlan.id, [SATURDAY]: saturdayPlan.id },
      preferences: updatedPreferences,
      tasks, // the real app's one shared task list, unfiltered — exclusion is the engine's job
      dates: [WEDNESDAY, SATURDAY, NO_ACCEPTED_PLAN_DATE],
      event: { type: 'preferences_changed', summary: 'Removed a commitment.', reportedAt: now },
      now,
      idGen: makeIdGen('week-propose-block'),
    });

    expect(proposals).toHaveLength(1);
    expect(proposals[0].date).toBe(WEDNESDAY);
    expect(proposals[0].changes.length).toBeGreaterThan(0);
  });

  it('produces nothing at all when the change affects no accepted date', () => {
    const preferences = createSamplePreferences();
    const tasks = createSampleTasks(new Date(`${SATURDAY}T06:00:00`));
    const saturdayPlan = buildAcceptedPlan(SATURDAY, preferences, tasks);
    const now = localISO(`${SATURDAY}T06:30:00`);

    const proposals = proposeAcrossDates({
      planVersions: [saturdayPlan],
      currentPlanIdByDate: { [SATURDAY]: saturdayPlan.id },
      preferences: { ...preferences, fixedCommitments: [] }, // the Mon-Fri commitment never applied on Saturday anyway
      tasks,
      dates: [SATURDAY],
      event: { type: 'preferences_changed', summary: 'Removed a commitment.', reportedAt: now },
      now,
      idGen: makeIdGen('week-noop-block'),
    });

    expect(proposals).toHaveLength(0);
  });

  it('applies activeSessionTaskId only when replanning activeDate itself, never another date in the window', () => {
    const preferences = createSamplePreferences();
    const tasks = createSampleTasks(new Date(`${WEDNESDAY}T06:00:00`));
    const wednesdayPlan = buildAcceptedPlan(WEDNESDAY, preferences, tasks);
    const updatedPreferences = { ...preferences, fixedCommitments: [] };
    const now = localISO(`${WEDNESDAY}T06:30:00`);

    const baseline = proposeAcrossDates({
      planVersions: [wednesdayPlan],
      currentPlanIdByDate: { [WEDNESDAY]: wednesdayPlan.id },
      preferences: updatedPreferences,
      tasks,
      dates: [WEDNESDAY],
      event: { type: 'preferences_changed', summary: 'Removed a commitment.', reportedAt: now },
      now,
      idGen: makeIdGen('gate-block'),
      // no activeDate/activeSessionTaskId at all
    });

    // activeDate is deliberately NOT Wednesday here, even though activeSessionTaskId names a
    // task that IS scheduled on Wednesday's plan — since Wednesday isn't the active date, the
    // pin must never apply, and the result must be identical to the baseline run above.
    const withMismatchedActiveDate = proposeAcrossDates({
      planVersions: [wednesdayPlan],
      currentPlanIdByDate: { [WEDNESDAY]: wednesdayPlan.id },
      preferences: updatedPreferences,
      tasks,
      dates: [WEDNESDAY],
      event: { type: 'preferences_changed', summary: 'Removed a commitment.', reportedAt: now },
      now,
      idGen: makeIdGen('gate-block'),
      activeDate: SATURDAY,
      activeSessionTaskId: 'task-interview-prep',
    });

    expect(withMismatchedActiveDate[0].blocks).toEqual(baseline[0].blocks);
  });
});

describe('unfinished-task rollover', () => {
  const DAY1 = '2026-10-01';
  const DAY2 = '2026-10-02';
  const DAY3 = '2026-10-03';

  const rolloverPreferences: Preferences = {
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
      id: 'task-x',
      title: 'Write report',
      estimateMinutes: 60,
      priority: 'medium',
      canMove: true,
      status: 'scheduled',
      createdAt: `${DAY1}T06:00:00.000Z`,
      ...overrides,
    };
  }

  function acceptDay(date: ISODate, task: Task): PlanVersion {
    const plan = generatePlan({
      date,
      preferences: rolloverPreferences,
      tasks: [task],
      version: 1,
      idGen: makeIdGen(`${date}-block`),
    });
    return { ...plan, status: 'accepted' as const };
  }

  it('an unfinished task is no longer excluded from a later date — it is offered back as a rollover candidate', () => {
    const task = makeTask();
    const day1 = acceptDay(DAY1, task);
    expect(day1.blocks.some((b) => b.taskId === 'task-x')).toBe(true); // confirms it was scheduled on day1

    const planVersions = [day1];
    const currentPlanIdByDate = { [DAY1]: day1.id };

    // The old bug: claimedTaskIdsExcluding treated day1's historical claim as permanent.
    const excluded = claimedTaskIdsExcluding(planVersions, currentPlanIdByDate, DAY2);
    expect(excluded.has('task-x')).toBe(true); // still "claimed" by default...

    const candidates = rolloverCandidatesFor(planVersions, currentPlanIdByDate, [task], DAY2);
    expect(candidates).toEqual([{ taskId: 'task-x', fromDate: DAY1 }]); // ...but offered back for day2

    // Combining them the way AppStateContext does: rollover candidates override the exclusion.
    const rolloverIds = new Set(candidates.map((c) => c.taskId));
    const finalExclude = new Set([...excluded].filter((id) => !rolloverIds.has(id)));
    const day2 = generatePlan({
      date: DAY2,
      preferences: rolloverPreferences,
      tasks: [task],
      version: 1,
      idGen: makeIdGen('day2-block'),
      excludeTaskIds: finalExclude,
      rolloverFrom: new Map([['task-x', { remainingMinutes: 60, fromDate: DAY1 }]]),
    });
    expect(day2.blocks.some((b) => b.taskId === 'task-x')).toBe(true);
    const block = day2.blocks.find((b) => b.taskId === 'task-x');
    expect(block?.reason).toContain(`Carried over from ${DAY1}`);
    expect(day2.explanations.join(' ')).toContain('carried over unfinished');

    // Day1's own accepted plan is never touched — history is preserved exactly.
    expect(day1.blocks.some((b) => b.taskId === 'task-x')).toBe(true);
    expect(day1.status).toBe('accepted');
  });

  it('missed days: a task left unfinished on day1 still rolls into day3 even though day2 was never generated', () => {
    const task = makeTask();
    const day1 = acceptDay(DAY1, task);
    const planVersions = [day1];
    const currentPlanIdByDate = { [DAY1]: day1.id }; // day2 never generated/accepted at all

    const candidates = rolloverCandidatesFor(planVersions, currentPlanIdByDate, [task], DAY3);
    expect(candidates).toEqual([{ taskId: 'task-x', fromDate: DAY1 }]);
  });

  it('a completed task never rolls over', () => {
    const task = makeTask({ status: 'completed' });
    // A completed task is excluded from its own date's pool too (isEligibleForPool), so
    // build day1's accepted plan directly with a block referencing it, as if it had been
    // scheduled before completion — the point under test is purely the rollover check.
    const day1: PlanVersion = {
      id: 'day1-plan',
      version: 1,
      date: DAY1,
      status: 'accepted',
      blocks: [
        {
          id: 'block-x',
          kind: 'task',
          taskId: 'task-x',
          title: task.title,
          start: `${DAY1}T09:00:00.000Z`,
          end: `${DAY1}T10:00:00.000Z`,
          flexibility: 'flexible',
          reason: 'Test fixture.',
        },
      ],
      unscheduledTasks: [],
      atRiskTasks: [],
      changes: [],
      explanations: [],
      createdAt: `${DAY1}T06:00:00.000Z`,
    };
    const planVersions = [day1];
    const currentPlanIdByDate = { [DAY1]: day1.id };

    const candidates = rolloverCandidatesFor(planVersions, currentPlanIdByDate, [task], DAY2);
    expect(candidates).toEqual([]);
  });

  it('a partially completed task rolls over with its remaining (not full) estimate, via rolloverFrom', () => {
    const task = makeTask({ estimateMinutes: 90 });
    const day1 = acceptDay(DAY1, task);
    const planVersions = [day1];
    const currentPlanIdByDate = { [DAY1]: day1.id };

    const candidates = rolloverCandidatesFor(planVersions, currentPlanIdByDate, [task], DAY2);
    expect(candidates).toEqual([{ taskId: 'task-x', fromDate: DAY1 }]);

    // 50 minutes were actually logged against it (computed elsewhere from focus-session
    // data) — only the remaining 40 minutes should be offered on day2, never the full 90.
    const day2 = generatePlan({
      date: DAY2,
      preferences: rolloverPreferences,
      tasks: [task],
      version: 1,
      idGen: makeIdGen('day2-block'),
      excludeTaskIds: new Set(),
      rolloverFrom: new Map([['task-x', { remainingMinutes: 40, fromDate: DAY1 }]]),
    });
    const block = day2.blocks.find((b) => b.taskId === 'task-x');
    expect(block).toBeDefined();
    const durationMinutes = (new Date(block!.end).getTime() - new Date(block!.start).getTime()) / 60_000;
    expect(durationMinutes).toBe(40); // not the original 90
    expect(block?.reason).toContain('40 of 90 min remaining');
  });

  it('an already-accepted future plan keeps the task — a nearer date in between does not also claim it', () => {
    const task = makeTask();
    const day1 = acceptDay(DAY1, task);
    // Day3 independently already has an accepted plan scheduling the same task (e.g. the
    // user pre-planned ahead before day1's instance went unfinished).
    const day3 = acceptDay(DAY3, task);
    const planVersions = [day1, day3];
    const currentPlanIdByDate = { [DAY1]: day1.id, [DAY3]: day3.id };

    // Day2 sits between them — it must NOT also offer the task, since day3 (the latest
    // claim) already owns it. Two accepted plans must never treat the same unfinished
    // work as independently claimed.
    const candidatesForDay2 = rolloverCandidatesFor(planVersions, currentPlanIdByDate, [task], DAY2);
    expect(candidatesForDay2).toEqual([]);
    const excludedFromDay2 = claimedTaskIdsExcluding(planVersions, currentPlanIdByDate, DAY2);
    expect(excludedFromDay2.has('task-x')).toBe(true);

    // Day3 itself is the current owner — claimedTaskIdsExcluding must not exclude it there.
    const excludedFromDay3 = claimedTaskIdsExcluding(planVersions, currentPlanIdByDate, DAY3);
    expect(excludedFromDay3.has('task-x')).toBe(false);
  });

  it('a rolled-over task past its deadline is flagged overdue in its carryover reason', () => {
    const task = makeTask({ deadline: `${DAY1}T20:00:00.000Z` }); // due during day1, now in the past
    const day1 = acceptDay(DAY1, task);
    const planVersions = [day1];
    const currentPlanIdByDate = { [DAY1]: day1.id };

    const candidates = rolloverCandidatesFor(planVersions, currentPlanIdByDate, [task], DAY2);
    expect(candidates).toEqual([{ taskId: 'task-x', fromDate: DAY1 }]);

    const day2 = generatePlan({
      date: DAY2,
      preferences: rolloverPreferences,
      tasks: [task],
      version: 1,
      idGen: makeIdGen('day2-block'),
      nowIso: `${DAY2}T07:30:00.000Z`,
      excludeTaskIds: new Set(),
      rolloverFrom: new Map([['task-x', { remainingMinutes: 60, fromDate: DAY1 }]]),
    });
    const block = day2.blocks.find((b) => b.taskId === 'task-x');
    expect(block?.reason).toContain('now overdue');
    // Still urgent-today, so if it didn't fit it would land in atRiskTasks rather than
    // unscheduledTasks — but with a near-empty day it should simply get placed.
    expect(day2.unscheduledTasks).toHaveLength(0);
    expect(day2.atRiskTasks).toHaveLength(0);
  });
});
