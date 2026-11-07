import { createSamplePreferences, createSampleTasks, createUrgentInternshipTask } from '../../data/sampleData';
import { elapsedMs } from '../../focus/sessionEngine';
import type { FocusSession } from '../../focus/types';
import { replan } from '../replanner';
import { isProposalStale, supersedePriorProposals } from '../replanVersioning';
import { generatePlan } from '../scheduler';
import type { FixedCommitment, Task } from '../types';
import { assertNoOverlaps, localISO, localTime, makeIdGen } from '../testUtils';

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

  it('shortens the gap between breaks when a low-energy check-in triggers the replan', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);

    const reportedAt = localISO('2026-10-07T08:00:00');
    const normalReplan = replan({
      currentPlan,
      event: { type: 'event_changed', description: 'test baseline', reportedAt },
      preferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('normal-block'),
    });
    const lowEnergyReplan = replan({
      currentPlan,
      event: { type: 'energy_changed', level: 'low', reportedAt },
      preferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('low-energy-block'),
    });

    assertNoOverlaps(normalReplan.blocks);
    assertNoOverlaps(lowEnergyReplan.blocks);

    const breakCount = (plan: typeof normalReplan) => plan.blocks.filter((b) => b.kind === 'break').length;
    expect(breakCount(lowEnergyReplan)).toBeGreaterThanOrEqual(breakCount(normalReplan));
    expect(lowEnergyReplan.explanations.some((e) => e.toLowerCase().includes('shorter focus stretches'))).toBe(true);
  });

  it('replans around a task that ran longer than estimated, treating the overage like a delay', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);

    // "Algorithms lecture" style overrun reported right after a focus
    // session finished later than its estimate.
    const reportedAt = localISO('2026-10-07T15:15:00');
    const revised = replan({
      currentPlan,
      event: { type: 'late_start', taskId: 'task-interview-prep', delayMinutes: 20, reportedAt },
      preferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('overrun-block'),
    });

    assertNoOverlaps(revised.blocks);
    const effectiveNow = new Date(localISO('2026-10-07T15:35:00')).getTime();
    for (const block of revised.blocks) {
      if (new Date(block.end).getTime() <= new Date(reportedAt).getTime()) continue; // already-elapsed history
      expect(new Date(block.start).getTime()).toBeGreaterThanOrEqual(effectiveNow);
    }
  });
});

describe('replan — preferences and task edits actually take effect', () => {
  it('regenerates commitment blocks from live preferences instead of the stale accepted plan (the headline fix)', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    expect(currentPlan.blocks.some((b) => b.title === 'Algorithms lecture')).toBe(true);

    const updatedPreferences = { ...preferences, fixedCommitments: [] };
    const reportedAt = localISO('2026-10-07T06:30:00'); // well before the lecture (09:00) starts

    const revised = replan({
      currentPlan,
      event: { type: 'preferences_changed', summary: 'Removed a commitment.', reportedAt },
      preferences: updatedPreferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('pref-block'),
    });

    assertNoOverlaps(revised.blocks);
    expect(revised.blocks.some((b) => b.title === 'Algorithms lecture')).toBe(false);
    const removedChange = revised.changes.find((c) => c.title === 'Algorithms lecture');
    expect(removedChange?.type).toBe('deferred');
  });

  it('reports a newly-added commitment as a change and schedules it', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);

    const gym: FixedCommitment = { id: 'fixed-gym', title: 'Gym', start: '16:00', end: '17:00', daysOfWeek: [1, 2, 3, 4, 5] };
    const updatedPreferences = { ...preferences, fixedCommitments: [...preferences.fixedCommitments, gym] };
    const reportedAt = localISO('2026-10-07T06:30:00');

    const revised = replan({
      currentPlan,
      event: { type: 'preferences_changed', summary: 'Added Gym.', reportedAt },
      preferences: updatedPreferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('added-block'),
    });

    assertNoOverlaps(revised.blocks);
    expect(revised.blocks.some((b) => b.title === 'Gym')).toBe(true);
    expect(revised.changes.find((c) => c.title === 'Gym')?.type).toBe('added');
  });

  it('does not retroactively move or remove a commitment that is currently in progress, even when it is the one being edited', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    const originalLecture = currentPlan.blocks.find((b) => b.title === 'Algorithms lecture')!;

    const updatedPreferences = { ...preferences, fixedCommitments: [] }; // user removes the lecture entirely
    const reportedAt = localISO('2026-10-07T09:30:00'); // mid-lecture (09:00-10:30)

    const revised = replan({
      currentPlan,
      event: { type: 'preferences_changed', summary: 'Removed a commitment.', reportedAt },
      preferences: updatedPreferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('inprogress-block'),
    });

    const lecture = revised.blocks.find((b) => b.title === 'Algorithms lecture');
    expect(lecture).toBeDefined();
    expect(lecture!.start).toBe(originalLecture.start);
    expect(lecture!.end).toBe(originalLecture.end);
  });

  it("a recurring commitment's start date keeps it out of a replan before that date (the internship scenario)", () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);

    const internship: FixedCommitment = {
      id: 'fixed-internship',
      title: 'Internship',
      start: '11:00',
      end: '15:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      startDate: '2026-10-10', // a few days after PLAN_DATE
    };
    const updatedPreferences = { ...preferences, fixedCommitments: [...preferences.fixedCommitments, internship] };
    const reportedAt = localISO('2026-10-07T06:30:00');

    const revised = replan({
      currentPlan,
      event: { type: 'preferences_changed', summary: 'Added Internship.', reportedAt },
      preferences: updatedPreferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('startdate-block'),
    });

    assertNoOverlaps(revised.blocks);
    expect(revised.blocks.some((b) => b.title === 'Internship')).toBe(false);
  });

  it('pins a task at its current time instead of dropping it when movability is edited to false', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    const originalBlock = currentPlan.blocks.find((b) => b.taskId === 'task-interview-prep')!;

    const editedTasks = sampleTasks.map((t) => (t.id === 'task-interview-prep' ? { ...t, canMove: false } : t));
    const reportedAt = localISO('2026-10-07T06:30:00');

    const revised = replan({
      currentPlan,
      event: { type: 'task_edited', taskId: 'task-interview-prep', summary: 'Edited movability.', reportedAt },
      preferences,
      tasks: editedTasks,
      now: reportedAt,
      idGen: makeIdGen('pin-block'),
    });

    assertNoOverlaps(revised.blocks);
    const block = revised.blocks.find((b) => b.taskId === 'task-interview-prep');
    expect(block).toBeDefined();
    expect(block!.flexibility).toBe('fixed');
    expect(block!.start).toBe(originalBlock.start);
  });

  it('releases a previously-pinned task back into the movable pool when movability is edited to true, without duplicating its block', () => {
    const pinnedTask: Task = {
      id: 'pinned-task',
      title: 'Pinned call with mentor',
      estimateMinutes: 30,
      priority: 'medium',
      canMove: false,
      status: 'unscheduled',
      createdAt: localISO('2026-10-07T06:00:00'),
    };
    const preferences = createSamplePreferences();
    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks: [pinnedTask],
      version: 1,
      idGen: makeIdGen('block'),
      nowIso: localISO('2026-10-07T06:00:00'),
    });
    const currentPlan = { ...plan, status: 'accepted' as const };

    const releasedTasks = [{ ...pinnedTask, canMove: true }];
    const reportedAt = localISO('2026-10-07T06:30:00');

    const revised = replan({
      currentPlan,
      event: { type: 'task_edited', taskId: 'pinned-task', summary: 'Edited movability.', reportedAt },
      preferences,
      tasks: releasedTasks,
      now: reportedAt,
      idGen: makeIdGen('release-block'),
    });

    assertNoOverlaps(revised.blocks);
    const matching = revised.blocks.filter((b) => b.taskId === 'pinned-task');
    expect(matching).toHaveLength(1);
    expect(matching[0].flexibility).toBe('flexible');
  });

  it("a pinned task's edited estimate takes effect even while pinned, as long as it hasn't started yet", () => {
    const pinnedTask: Task = {
      id: 'pinned-task',
      title: 'Pinned call with mentor',
      estimateMinutes: 30,
      priority: 'medium',
      canMove: false,
      status: 'unscheduled',
      createdAt: localISO('2026-10-07T06:00:00'),
    };
    const preferences = createSamplePreferences();
    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks: [pinnedTask],
      version: 1,
      idGen: makeIdGen('block'),
      nowIso: localISO('2026-10-07T06:00:00'),
    });
    const currentPlan = { ...plan, status: 'accepted' as const };
    const originalBlock = currentPlan.blocks.find((b) => b.taskId === 'pinned-task')!;

    const editedTasks = [{ ...pinnedTask, estimateMinutes: 60 }]; // doubled
    const reportedAt = localISO('2026-10-07T06:30:00'); // well before the block's original start

    const revised = replan({
      currentPlan,
      event: { type: 'task_edited', taskId: 'pinned-task', summary: 'Edited estimate.', reportedAt },
      preferences,
      tasks: editedTasks,
      now: reportedAt,
      idGen: makeIdGen('pin-estimate-block'),
    });

    assertNoOverlaps(revised.blocks);
    const block = revised.blocks.find((b) => b.taskId === 'pinned-task')!;
    expect(block.start).toBe(originalBlock.start);
    const minutes = (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60_000;
    expect(minutes).toBe(60);
  });

  it("a still-movable task's edited estimate reflows its scheduled duration", () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);

    const editedTasks = sampleTasks.map((t) => (t.id === 'task-interview-prep' ? { ...t, estimateMinutes: 90 } : t));
    const reportedAt = localISO('2026-10-07T06:30:00');

    const revised = replan({
      currentPlan,
      event: { type: 'task_edited', taskId: 'task-interview-prep', summary: 'Edited estimate.', reportedAt },
      preferences,
      tasks: editedTasks,
      now: reportedAt,
      idGen: makeIdGen('estimate-block'),
    });

    assertNoOverlaps(revised.blocks);
    const block = revised.blocks.find((b) => b.taskId === 'task-interview-prep')!;
    const minutes = (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60_000;
    expect(minutes).toBe(90);
  });

  it('leaves the frozen (already-elapsed) portion of the day untouched while a later edit still takes effect on the future portion', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    const originalBreakfast = currentPlan.blocks.find((b) => b.title === 'Breakfast')!;

    const updatedPreferences = {
      ...preferences,
      mealWindows: { ...preferences.mealWindows, dinner: { start: '19:00', end: '19:30' } },
    };
    const reportedAt = localISO('2026-10-07T08:35:00'); // after breakfast (08:00-08:30) has ended

    const revised = replan({
      currentPlan,
      event: { type: 'preferences_changed', summary: 'Changed dinner time.', reportedAt },
      preferences: updatedPreferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('conflict-block'),
    });

    assertNoOverlaps(revised.blocks);

    const newBreakfast = revised.blocks.find((b) => b.title === 'Breakfast')!;
    expect(newBreakfast).toEqual(originalBreakfast);

    const newDinner = revised.blocks.find((b) => b.title === 'Dinner')!;
    expect(localTime(newDinner.start)).toBe('19:00');
    expect(localTime(newDinner.end)).toBe('19:30');
  });

  it('includes the summary text in explanations for preferences_changed and task_edited events', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    const reportedAt = localISO('2026-10-07T06:30:00');

    const prefRevised = replan({
      currentPlan,
      event: { type: 'preferences_changed', summary: 'Updated sleep window.', reportedAt },
      preferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('reason-block-a'),
    });
    expect(prefRevised.explanations.some((e) => e.includes('Updated sleep window.'))).toBe(true);

    const taskRevised = replan({
      currentPlan,
      event: { type: 'task_edited', taskId: 'task-interview-prep', summary: 'Edited "Interview preparation".', reportedAt },
      preferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('reason-block-b'),
    });
    expect(taskRevised.explanations.some((e) => e.includes('Edited "Interview preparation".'))).toBe(true);
  });

  it('excludes a task claimed by another date even though it would otherwise be placeable (cross-day allocation)', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    const reportedAt = localISO('2026-10-07T06:30:00');

    const revised = replan({
      currentPlan,
      event: { type: 'preferences_changed', summary: 'No-op preference touch.', reportedAt },
      preferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('exclude-block'),
      excludeTaskIds: new Set(['task-interview-prep']),
    });

    assertNoOverlaps(revised.blocks);
    expect(revised.blocks.some((b) => b.taskId === 'task-interview-prep')).toBe(false);
    expect(revised.unscheduledTasks.some((t) => t.taskId === 'task-interview-prep')).toBe(false);
    expect(revised.atRiskTasks.some((t) => t.taskId === 'task-interview-prep')).toBe(false);
  });
});

describe('replan — an active focus session pins its task regardless of canMove', () => {
  it('keeps a normally movable task frozen in place under urgent-task pressure that would otherwise bump it', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    const originalInterview = currentPlan.blocks.find((b) => b.taskId === 'task-interview-prep')!;
    expect(originalInterview.flexibility).toBe('flexible'); // ordinarily movable, before the pin applies

    const internshipTask = createUrgentInternshipTask(now);
    const allTasks = [...sampleTasks, internshipTask];
    const reportedAt = localISO('2026-10-07T17:45:00');

    const revised = replan({
      currentPlan,
      event: { type: 'new_task', taskId: internshipTask.id, reportedAt },
      preferences,
      tasks: allTasks,
      now: reportedAt,
      idGen: makeIdGen('session-pin-block'),
      activeSessionTaskId: 'task-interview-prep',
    });

    assertNoOverlaps(revised.blocks);

    const interviewBlock = revised.blocks.find((b) => b.taskId === 'task-interview-prep')!;
    expect(interviewBlock.start).toBe(originalInterview.start);
    expect(interviewBlock.end).toBe(originalInterview.end);
    expect(interviewBlock.flexibility).toBe('fixed');
    // Pinned, so the diff never reports it as moved or deferred.
    expect(revised.changes.some((c) => c.taskId === 'task-interview-prep')).toBe(false);

    // The urgent task is still fully accounted for — scheduled around the pinned block, or
    // explicitly flagged — never silently dropped, exactly like the unpinned version of this
    // same scenario (see "the blueprint internship-interruption scenario" above).
    const internshipScheduled = revised.blocks.some((b) => b.taskId === internshipTask.id);
    const internshipFlagged = [...revised.unscheduledTasks, ...revised.atRiskTasks].some(
      (t) => t.taskId === internshipTask.id
    );
    expect(internshipScheduled || internshipFlagged).toBe(true);

    // The block's placement is byte-for-byte preserved, so a FocusSession's own elapsed-time
    // tracking — computed purely from its own persisted timestamps, never from the plan — is
    // completely unaffected by this replan.
    const session: FocusSession = {
      id: 'session-1',
      taskId: 'task-interview-prep',
      taskTitle: 'Interview preparation',
      planBlockId: originalInterview.id,
      estimateMinutes: 60,
      status: 'running',
      startedAt: reportedAt,
      pauseIntervals: [],
      createdAt: reportedAt,
    };
    const fiveMinutesLater = new Date(reportedAt).getTime() + 5 * 60_000;
    expect(elapsedMs(session, fiveMinutesLater)).toBe(5 * 60_000);
  });

  it('does not duplicate or disturb the block when a non-movable task also happens to have an active session', () => {
    const pinnedTask: Task = {
      id: 'pinned-task',
      title: 'Pinned call with mentor',
      estimateMinutes: 30,
      priority: 'medium',
      canMove: false,
      status: 'unscheduled',
      createdAt: localISO('2026-10-07T06:00:00'),
    };
    const preferences = createSamplePreferences();
    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks: [pinnedTask],
      version: 1,
      idGen: makeIdGen('block'),
      nowIso: localISO('2026-10-07T06:00:00'),
    });
    const currentPlan = { ...plan, status: 'accepted' as const };
    const originalBlock = currentPlan.blocks.find((b) => b.taskId === 'pinned-task')!;

    const reportedAt = localISO('2026-10-07T06:30:00');
    const revised = replan({
      currentPlan,
      event: { type: 'event_changed', description: 'Unrelated change.', reportedAt },
      preferences,
      tasks: [pinnedTask],
      now: reportedAt,
      idGen: makeIdGen('fixed-session-block'),
      activeSessionTaskId: 'pinned-task',
    });

    assertNoOverlaps(revised.blocks);
    const matching = revised.blocks.filter((b) => b.taskId === 'pinned-task');
    expect(matching).toHaveLength(1);
    expect(matching[0].start).toBe(originalBlock.start);
    expect(matching[0].end).toBe(originalBlock.end);
    expect(matching[0].flexibility).toBe('fixed');
  });

  it('releases a task back into the ordinary movable pool once its focus session is no longer active', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    const reportedAt = localISO('2026-10-07T06:30:00');

    // While the session is active, an unrelated event still keeps the task pinned in place.
    const whilePinned = replan({
      currentPlan,
      event: { type: 'event_changed', description: 'Something changed.', reportedAt },
      preferences,
      tasks: sampleTasks,
      now: reportedAt,
      idGen: makeIdGen('pinned-phase'),
      activeSessionTaskId: 'task-interview-prep',
    });
    expect(whilePinned.blocks.find((b) => b.taskId === 'task-interview-prep')?.flexibility).toBe('fixed');

    // Once the session has ended, a later replan — always built from the still-accepted plan,
    // exactly like the real app's runReplanOrGenerateForDate — no longer pins it: it is
    // ordinarily movable again, free to be scheduled wherever urgent work now needs the room.
    const urgentTask: Task = {
      id: 'task-urgent-followup',
      title: 'Urgent follow-up',
      estimateMinutes: 60,
      priority: 'urgent',
      canMove: true,
      status: 'unscheduled',
      createdAt: reportedAt,
      deadline: localISO('2026-10-07T19:30:00'),
    };
    const afterSession = replan({
      currentPlan,
      event: { type: 'new_task', taskId: urgentTask.id, reportedAt },
      preferences,
      tasks: [...sampleTasks, urgentTask],
      now: reportedAt,
      idGen: makeIdGen('released-phase'),
      // no activeSessionTaskId passed — the session has ended by this point
    });

    const releasedBlock = afterSession.blocks.find((b) => b.taskId === 'task-interview-prep');
    expect(releasedBlock).toBeDefined();
    expect(releasedBlock!.flexibility).toBe('flexible');
  });

  it('keeps the pin intact across a stale, superseded proposal and the one that replaces it', () => {
    const now = new Date('2026-10-07T06:00:00');
    const sampleTasks = createSampleTasks(now);
    const { preferences, plan: currentPlan } = buildAcceptedEveningPlan(sampleTasks);
    const originalInterview = currentPlan.blocks.find((b) => b.taskId === 'task-interview-prep')!;

    const firstReportedAt = localISO('2026-10-07T06:30:00');
    const firstProposal = replan({
      currentPlan,
      event: { type: 'event_changed', description: 'First change.', reportedAt: firstReportedAt },
      preferences,
      tasks: sampleTasks,
      now: firstReportedAt,
      idGen: makeIdGen('stale-first'),
      activeSessionTaskId: 'task-interview-prep',
    });

    // A second event arrives before the first proposal is ever reviewed. The real app always
    // builds the next proposal from the still-accepted plan, never from a pending one, so this
    // mirrors runReplanOrGenerateForDate's actual behavior exactly.
    const secondReportedAt = localISO('2026-10-07T06:45:00');
    const secondProposal = replan({
      currentPlan,
      event: { type: 'event_changed', description: 'Second change.', reportedAt: secondReportedAt },
      preferences,
      tasks: sampleTasks,
      now: secondReportedAt,
      idGen: makeIdGen('stale-second'),
      activeSessionTaskId: 'task-interview-prep',
    });

    const { superseded } = supersedePriorProposals([currentPlan, firstProposal, secondProposal], secondProposal);
    expect(superseded.map((v) => v.id)).toEqual([firstProposal.id]);
    expect(isProposalStale(firstProposal.id, secondProposal)).toBe(true);

    // Both the discarded proposal and the one that replaced it kept the in-session task frozen
    // exactly where it was — superseding a stale proposal never has to "undo" an active pin.
    for (const proposal of [firstProposal, secondProposal]) {
      const block = proposal.blocks.find((b) => b.taskId === 'task-interview-prep')!;
      expect(block.start).toBe(originalInterview.start);
      expect(block.end).toBe(originalInterview.end);
      expect(block.flexibility).toBe('fixed');
    }
  });
});
