import type { FocusSession } from '../../focus/types';
import { generatePlan } from '../../planning/scheduler';
import { makeIdGen } from '../../planning/testUtils';
import type { PlanVersion, Preferences, Task } from '../../planning/types';
import { rolloverCandidatesFor } from '../../planning/weekPlanning';
import {
  computeProjectProgress,
  tasksForMilestone,
  tasksForProject,
  unassignedProjectTasks,
  upcomingDeadlines,
} from '../projectEngine';
import type { Milestone } from '../types';

const PROJECT_ID = 'project-1';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Write report',
    estimateMinutes: 60,
    priority: 'medium',
    canMove: true,
    status: 'unscheduled',
    createdAt: '2026-10-01T06:00:00.000Z',
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'milestone-1',
    projectId: PROJECT_ID,
    title: 'Phase 1',
    targetDate: '2026-10-10',
    status: 'pending',
    order: 0,
    createdAt: '2026-10-01T06:00:00.000Z',
    ...overrides,
  };
}

describe('tasksForProject / tasksForMilestone / unassignedProjectTasks', () => {
  it('separates project-only tasks from milestone-linked ones, and ignores tasks for other projects', () => {
    const unassigned = makeTask({ id: 't-unassigned', projectId: PROJECT_ID });
    const underMilestone = makeTask({ id: 't-milestone', projectId: PROJECT_ID, milestoneId: 'milestone-1' });
    const otherProject = makeTask({ id: 't-other', projectId: 'project-2' });
    const standalone = makeTask({ id: 't-standalone' });
    const tasks = [unassigned, underMilestone, otherProject, standalone];

    expect(tasksForProject(tasks, PROJECT_ID).map((t) => t.id).sort()).toEqual(['t-milestone', 't-unassigned']);
    expect(tasksForMilestone(tasks, 'milestone-1').map((t) => t.id)).toEqual(['t-milestone']);
    expect(unassignedProjectTasks(tasks, PROJECT_ID).map((t) => t.id)).toEqual(['t-unassigned']);
  });
});

describe('computeProjectProgress', () => {
  it('counts milestones and tasks purely from their own status — never derived from time logged', () => {
    const milestones = [
      makeMilestone({ id: 'm1', status: 'completed' }),
      makeMilestone({ id: 'm2', status: 'pending' }),
    ];
    const tasks = [
      makeTask({ id: 't1', projectId: PROJECT_ID, status: 'completed', estimateMinutes: 60 }),
      makeTask({ id: 't2', projectId: PROJECT_ID, status: 'scheduled', estimateMinutes: 90 }),
    ];
    // A full 90-minute session was logged against t2, yet it was never marked completed —
    // progress must still show it as the one remaining (not-done) task.
    const sessions: FocusSession[] = [
      {
        id: 's1',
        taskId: 't2',
        taskTitle: 'Write report',
        estimateMinutes: 90,
        status: 'stopped',
        startedAt: '2026-10-01T09:00:00.000Z',
        pauseIntervals: [],
        endedAt: '2026-10-01T10:30:00.000Z',
        outcome: 'partial',
        createdAt: '2026-10-01T09:00:00.000Z',
      },
    ];

    const progress = computeProjectProgress(PROJECT_ID, milestones, tasks, sessions);

    expect(progress.milestonesTotal).toBe(2);
    expect(progress.milestonesCompleted).toBe(1);
    expect(progress.tasksTotal).toBe(2);
    expect(progress.tasksCompleted).toBe(1);
    expect(progress.taskCompletionRatio).toBe(0.5);
    // t2's 90 min logged in full leaves its remaining estimate floored, never zero, and t1
    // (completed) contributes nothing — remaining work is purely t2's, never "0 because the
    // session covered the whole estimate."
    expect(progress.remainingEstimatedMinutes).toBeGreaterThan(0);
    expect(progress.remainingEstimatedMinutes).toBeLessThan(90);
  });

  it('reports zero progress and zero remaining work for a project with nothing linked yet', () => {
    const progress = computeProjectProgress(PROJECT_ID, [], [], []);
    expect(progress).toEqual({
      milestonesTotal: 0,
      milestonesCompleted: 0,
      tasksTotal: 0,
      tasksCompleted: 0,
      taskCompletionRatio: 0,
      milestoneCompletionRatio: 0,
      remainingEstimatedMinutes: 0,
    });
  });

  it('excludes a delegated task from remaining estimated work, same as a completed one', () => {
    const tasks = [makeTask({ id: 't1', projectId: PROJECT_ID, status: 'delegated', estimateMinutes: 120 })];
    const progress = computeProjectProgress(PROJECT_ID, [], tasks, []);
    expect(progress.remainingEstimatedMinutes).toBe(0);
  });
});

describe('upcomingDeadlines', () => {
  it('lists pending milestones and non-completed task deadlines, nearest first, excluding completed items', () => {
    const milestones = [
      makeMilestone({ id: 'm-far', targetDate: '2026-11-01', status: 'pending' }),
      makeMilestone({ id: 'm-done', targetDate: '2026-10-02', status: 'completed' }), // must not appear
      makeMilestone({ id: 'm-near', targetDate: '2026-10-05', status: 'pending' }),
    ];
    const tasks = [
      makeTask({ id: 't-due', projectId: PROJECT_ID, deadline: '2026-10-03T18:00:00.000Z', status: 'scheduled' }),
      makeTask({ id: 't-done', projectId: PROJECT_ID, deadline: '2026-10-01T18:00:00.000Z', status: 'completed' }), // must not appear
      makeTask({ id: 't-nodate', projectId: PROJECT_ID, status: 'scheduled' }), // no deadline, must not appear
    ];

    const result = upcomingDeadlines(PROJECT_ID, milestones, tasks);

    expect(result.map((d) => d.id)).toEqual(['t-due', 'm-near', 'm-far']);
    expect(result.every((d) => d.date >= '2026-10-03')).toBe(true);
  });
});

describe('project tasks and the unfinished-task rollover mechanism', () => {
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

  it('a project-linked task left unfinished on day 1 is the SAME task the project still sees on day 2 — never duplicated', () => {
    const task = makeTask({ id: 'proj-task', projectId: PROJECT_ID, estimateMinutes: 60, status: 'scheduled' });

    const day1Plan = generatePlan({
      date: '2026-10-01',
      preferences: rolloverPreferences,
      tasks: [task],
      version: 1,
      idGen: makeIdGen('day1-block'),
    });
    const day1: PlanVersion = { ...day1Plan, status: 'accepted' };
    expect(day1.blocks.some((b) => b.taskId === 'proj-task')).toBe(true);

    // The rollover candidate for day 2 is exactly this task id — not a copy with a new id.
    const candidates = rolloverCandidatesFor([day1], { '2026-10-01': day1.id }, [task], '2026-10-02');
    expect(candidates).toEqual([{ taskId: 'proj-task', fromDate: '2026-10-01' }]);

    // The project still sees exactly one linked task throughout — rollover is a scheduling
    // concern (which date currently claims it), not a change to the task roster itself.
    expect(tasksForProject([task], PROJECT_ID).map((t) => t.id)).toEqual(['proj-task']);
  });
});
