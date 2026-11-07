import { toISODate } from '../planning/time';
import type { PlanVersion, Preferences, Task } from '../planning/types';

/**
 * Sample onboarding answers for a student balancing classes, interview prep,
 * and a portfolio project — the persona described in the product blueprint.
 */
export function createSamplePreferences(): Preferences {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    sleepWindow: { sleepTime: '23:00', wakeTime: '07:00' },
    fixedCommitments: [
      {
        id: 'fixed-algorithms-lecture',
        title: 'Algorithms lecture',
        start: '09:00',
        end: '10:30',
        daysOfWeek: [1, 2, 3, 4, 5],
      },
    ],
    goals: [
      { id: 'goal-internship', title: 'Land a software internship' },
      { id: 'goal-portfolio', title: 'Ship a polished portfolio project' },
    ],
    protectedTimeBlocks: [],
    preferredFocusBlocks: [{ start: '18:00', end: '22:00' }],
    mealWindows: {
      breakfast: { start: '08:00', end: '08:30' },
      lunch: { start: '13:00', end: '13:30' },
      dinner: { start: '20:00', end: '20:30' },
    },
    onboardingCompletedAt: new Date().toISOString(),
  };
}

/**
 * The evening study plan from the blueprint's core rescheduling example:
 * interview prep, portfolio work, and study, all before a mid-evening
 * interruption arrives.
 */
export function createSampleTasks(now: Date = new Date()): Task[] {
  const createdAt = now.toISOString();
  return [
    {
      id: 'task-interview-prep',
      title: 'Interview preparation',
      estimateMinutes: 60,
      priority: 'medium',
      canMove: true,
      status: 'unscheduled',
      createdAt,
    },
    {
      id: 'task-portfolio-work',
      title: 'Portfolio work',
      estimateMinutes: 60,
      priority: 'medium',
      canMove: true,
      status: 'unscheduled',
      createdAt,
    },
    {
      id: 'task-study-ds',
      title: 'Study — Data Structures',
      estimateMinutes: 60,
      priority: 'medium',
      canMove: true,
      status: 'unscheduled',
      createdAt,
    },
  ];
}

/**
 * The interruption: an internship assignment due tomorrow morning that
 * needs two hours of focused work tonight.
 */
export function createUrgentInternshipTask(now: Date = new Date()): Task {
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(9, 0, 0, 0);
  return {
    id: 'task-internship-assignment',
    title: 'Internship assignment',
    estimateMinutes: 120,
    deadline: deadline.toISOString(),
    priority: 'urgent',
    canMove: true,
    status: 'unscheduled',
    createdAt: now.toISOString(),
  };
}

export function todayISODate(now: Date = new Date()): string {
  return toISODate(now);
}

/**
 * Finds sample tasks that a persisted plan's blocks reference by id but that
 * don't actually exist in `tasks` — the exact shape of the historical bug
 * where a lost update during onboarding seeding dropped some of
 * createSampleTasks()'s rows while the plan (saved once, not racily) still
 * referenced all of them. Only ever returns tasks whose id matches a known
 * sample task id, so it can never fabricate a task for a genuinely unrelated
 * dangling reference, and never touches or duplicates a real user task (those
 * get ids from generateId('task'), which can't collide with the static
 * sample ids). Safe to call on every app start: once the missing rows are
 * created, `tasks` contains them and this returns an empty array.
 */
export function findMissingSampleTasks(tasks: Task[], planVersions: PlanVersion[]): Task[] {
  const existingIds = new Set(tasks.map((t) => t.id));
  const referencedIds = new Set<string>();
  for (const version of planVersions) {
    for (const block of version.blocks) {
      if (block.taskId) referencedIds.add(block.taskId);
    }
  }

  const sampleTasksById = new Map(createSampleTasks().map((t) => [t.id, t]));
  const missing: Task[] = [];
  for (const id of referencedIds) {
    if (!existingIds.has(id)) {
      const sampleTask = sampleTasksById.get(id);
      if (sampleTask) missing.push(sampleTask);
    }
  }
  return missing;
}
