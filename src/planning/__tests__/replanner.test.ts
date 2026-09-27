import { createSamplePreferences, createSampleTasks, createUrgentInternshipTask } from '../../data/sampleData';
import { replan } from '../replanner';
import { generatePlan } from '../scheduler';
import type { Task } from '../types';
import { assertNoOverlaps, localISO, makeIdGen } from '../testUtils';

const PLAN_DATE = '2026-10-07';

function buildAcceptedEveningPlan(tasks: Task[]) {
  const preferences = createSamplePreferences();
  const plan = generatePlan({
    date: PLAN_DATE,
    preferences,
    tasks,
    version: 1,
    idGen: makeIdGen('block'),
    nowIso: localISO('2026-10-07T06:00:00'),
  });
  return { preferences, plan: { ...plan, status: 'accepted' as const } };
}

describe('replan — the blueprint internship-interruption scenario', () => {
  it('protects dinner and sleep, schedules the urgent assignment, and defers rather than deletes', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);

    const originalDinner = currentPlan.blocks.find((b) => b.title === 'Dinner')!;
    const originalInterview = currentPlan.blocks.find((b) => b.taskId === 'task-interview-prep')!;

    const internshipTask = createUrgentInternshipTask(now);
    const allTasks = [...sampleTasks, internshipTask];
    const reportedAt = localISO('2026-10-07T17:45:00');

    const revised = replan({
      currentPlan,
      event: { type: 'new_task', taskId: internshipTask.id, reportedAt },
      preferences,
      tasks: allTasks,
      now: reportedAt,
      idGen: makeIdGen('replan-block'),
    });

    assertNoOverlaps(revised.blocks);

    // Version bookkeeping: never mutate history, always append.
    expect(revised.version).toBe(currentPlan.version + 1);
    expect(revised.parentVersionId).toBe(currentPlan.id);
    expect(revised.status).toBe('proposed');
    expect(currentPlan.status).toBe('accepted'); // untouched

    // Dinner (protected) is preserved with its full original duration.
    const newDinner = revised.blocks.find((b) => b.title === 'Dinner')!;
    expect(newDinner.start).toBe(originalDinner.start);
    expect(newDinner.end).toBe(originalDinner.end);

    // Sleep boundary respected: nothing after 23:00.
    const sleepCutoff = new Date(`${PLAN_DATE}T23:00:00`).getTime();
    for (const block of revised.blocks) {
      expect(new Date(block.end).getTime()).toBeLessThanOrEqual(sleepCutoff);
    }

    // The urgent assignment is fully scheduled today.
    const internshipBlock = revised.blocks.find((b) => b.taskId === internshipTask.id);
    expect(internshipBlock).toBeDefined();
    const scheduledMinutes =
      (new Date(internshipBlock!.end).getTime() - new Date(internshipBlock!.start).getTime()) / 60_000;
    expect(scheduledMinutes).toBe(internshipTask.estimateMinutes);

    // Every original task is still accounted for — scheduled, deferred, or at risk —
    // never silently dropped.
    for (const task of allTasks) {
      const stillScheduled = revised.blocks.some((b) => b.taskId === task.id);
      const flagged = [...revised.unscheduledTasks, ...revised.atRiskTasks].some((t) => t.taskId === task.id);
      expect(stillScheduled || flagged).toBe(true);
    }

    // The plan explains what moved or was deferred.
    expect(revised.changes.length).toBeGreaterThan(0);
    const addedChange = revised.changes.find((c) => c.taskId === internshipTask.id);
    expect(addedChange?.type).toBe('added');

    // At least one previously-scheduled task got bumped (moved or deferred) —
    // the interview-prep slot can no longer start at its original time.
    const newInterviewBlock = revised.blocks.find((b) => b.taskId === 'task-interview-prep');
    const interviewMovedOrGone =
      !newInterviewBlock || newInterviewBlock.start !== originalInterview.start;
    expect(interviewMovedOrGone).toBe(true);

    // Nothing is claimed as deleted: any task missing a block appears in changes as deferred
    // or in one of the flagged lists.
    const deferredChanges = revised.changes.filter((c) => c.type === 'deferred');
    for (const dc of deferredChanges) {
      expect(revised.unscheduledTasks.some((t) => t.taskId === dc.taskId)).toBe(true);
    }
  });

  it('reports a delay by treating already-elapsed time as consumed, not reopened', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);

    const reportedAt = localISO('2026-10-07T17:45:00');
    const revised = replan({
      currentPlan,
      event: { type: 'late_start', taskId: 'task-interview-prep', delayMinutes: 45, reportedAt },
      preferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('late-block'),
    });

    assertNoOverlaps(revised.blocks);

    // Nothing is scheduled to start before the delayed effective time (18:30).
    const effectiveNow = new Date(localISO('2026-10-07T18:30:00')).getTime();
    for (const block of revised.blocks) {
      if (block.title === 'Algorithms lecture' || block.title === 'Breakfast' || block.title === 'Lunch') {
        continue; // already-elapsed history, frozen as-is
      }
      expect(new Date(block.start).getTime()).toBeGreaterThanOrEqual(effectiveNow);
    }

    for (const task of sampleTasks) {
      const stillScheduled = revised.blocks.some((b) => b.taskId === task.id);
      const flagged = [...revised.unscheduledTasks, ...revised.atRiskTasks].some((t) => t.taskId === task.id);
      expect(stillScheduled || flagged).toBe(true);
    }
  });

  it('surfaces a conflict instead of pretending an impossible plan works', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);

    const hugeTask: Task = {
      id: 'task-huge-emergency',
      title: 'Emergency rewrite',
      estimateMinutes: 400, // far more than remains before sleep
      deadline: localISO('2026-10-07T22:00:00'),
      priority: 'urgent',
      canMove: true,
      status: 'unscheduled',
      createdAt: localISO('2026-10-07T21:00:00'),
    };

    const reportedAt = localISO('2026-10-07T21:00:00'); // late in the evening
    const revised = replan({
      currentPlan,
      event: { type: 'new_task', taskId: hugeTask.id, reportedAt },
      preferences,
      tasks: [...sampleTasks, hugeTask],
      now: reportedAt,
      idGen: makeIdGen('conflict-block'),
    });

    assertNoOverlaps(revised.blocks);
    expect(revised.atRiskTasks.some((t) => t.taskId === hugeTask.id)).toBe(true);
    expect(revised.explanations.some((e) => e.toLowerCase().includes('does not fit') || e.toLowerCase().includes('conflict') || e.toLowerCase().includes('choose what to drop'))).toBe(true);

    const sleepCutoff = new Date(`${PLAN_DATE}T23:00:00`).getTime();
    for (const block of revised.blocks) {
      expect(new Date(block.end).getTime()).toBeLessThanOrEqual(sleepCutoff);
    }
  });
});
