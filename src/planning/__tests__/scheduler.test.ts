import { createSamplePreferences, createSampleTasks } from '../../data/sampleData';
import { generatePlan } from '../scheduler';
import type { Task } from '../types';
import { assertNoOverlaps, localTime, makeIdGen } from '../testUtils';

// A Wednesday, so the sample "Algorithms lecture" (Mon-Fri) applies.
const PLAN_DATE = '2026-10-07';

describe('generatePlan', () => {
  it('schedules fixed commitments, meals, and tasks without any overlap', () => {
    const preferences = createSamplePreferences();
    const tasks = createSampleTasks(new Date('2026-10-07T06:00:00'));

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks,
      version: 1,
      idGen: makeIdGen('block'),
      nowIso: new Date('2026-10-07T06:00:00').toISOString(),
    });

    assertNoOverlaps(plan.blocks);

    const lecture = plan.blocks.find((b) => b.title === 'Algorithms lecture');
    expect(lecture?.flexibility).toBe('fixed');
    expect(localTime(lecture!.start)).toBe('09:00');
    expect(localTime(lecture!.end)).toBe('10:30');

    const dinner = plan.blocks.find((b) => b.title === 'Dinner');
    expect(dinner?.flexibility).toBe('protected');
    expect(localTime(dinner!.start)).toBe('20:00');

    // All three sample tasks should fit comfortably in an ordinary day.
    expect(plan.unscheduledTasks).toHaveLength(0);
    expect(plan.atRiskTasks).toHaveLength(0);
    for (const task of tasks) {
      expect(plan.blocks.some((b) => b.taskId === task.id)).toBe(true);
    }

    // Soft preference: tasks should land inside the 18:00-22:00 focus window
    // when there's room, ahead of dinner, matching the blueprint's example.
    const interviewBlock = plan.blocks.find((b) => b.taskId === 'task-interview-prep');
    expect(localTime(interviewBlock!.start)).toBe('18:00');
  });

  it('never schedules anything outside the wake/sleep window', () => {
    const preferences = createSamplePreferences();
    const tasks = createSampleTasks(new Date('2026-10-07T06:00:00'));

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks,
      version: 1,
      idGen: makeIdGen('block'),
    });

    const wake = new Date(`${PLAN_DATE}T07:00:00`).getTime();
    const sleep = new Date(`${PLAN_DATE}T23:00:00`).getTime();
    for (const block of plan.blocks) {
      expect(new Date(block.start).getTime()).toBeGreaterThanOrEqual(wake);
      expect(new Date(block.end).getTime()).toBeLessThanOrEqual(sleep);
    }
  });

  it('reports a scheduling conflict instead of silently dropping urgent work', () => {
    const preferences = createSamplePreferences();
    // Pack the day with far more urgent, deadline-bound work than can fit.
    const overloadedTasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
      id: `overload-${i}`,
      title: `Urgent task ${i}`,
      estimateMinutes: 90,
      priority: 'urgent',
      canMove: true,
      status: 'unscheduled',
      createdAt: new Date(`2026-10-07T06:0${i}:00`).toISOString(),
      deadline: new Date(`${PLAN_DATE}T22:00:00`).toISOString(),
    }));

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks: overloadedTasks,
      version: 1,
      idGen: makeIdGen('block'),
    });

    assertNoOverlaps(plan.blocks);

    // Every task is accounted for: either scheduled or explicitly flagged.
    const scheduledIds = new Set(plan.blocks.filter((b) => b.taskId).map((b) => b.taskId));
    const flaggedIds = new Set([...plan.atRiskTasks, ...plan.unscheduledTasks].map((t) => t.taskId));
    for (const task of overloadedTasks) {
      expect(scheduledIds.has(task.id) || flaggedIds.has(task.id)).toBe(true);
    }

    expect(plan.atRiskTasks.length).toBeGreaterThan(0);
    expect(plan.explanations.some((e) => e.includes('could not be scheduled'))).toBe(true);
  });

  it('keeps a non-movable task fixed in place for future planning', () => {
    const preferences = createSamplePreferences();
    const tasks: Task[] = [
      {
        id: 'pinned-task',
        title: 'Pinned call with mentor',
        estimateMinutes: 30,
        priority: 'medium',
        canMove: false,
        status: 'unscheduled',
        createdAt: '2026-10-07T06:00:00.000Z',
      },
    ];

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks,
      version: 1,
      idGen: makeIdGen('block'),
    });

    const block = plan.blocks.find((b) => b.taskId === 'pinned-task');
    expect(block?.flexibility).toBe('fixed');
  });
});
