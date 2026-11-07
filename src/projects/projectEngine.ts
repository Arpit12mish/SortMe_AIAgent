import { remainingEstimateMinutes } from '../focus/sessionEngine';
import type { FocusSession } from '../focus/types';
import type { ISODate, Task } from '../planning/types';
import type { Milestone } from './types';

/** Every task linked to this project, directly or via a milestone. */
export function tasksForProject(tasks: Task[], projectId: string): Task[] {
  return tasks.filter((t) => t.projectId === projectId);
}

export function tasksForMilestone(tasks: Task[], milestoneId: string): Task[] {
  return tasks.filter((t) => t.milestoneId === milestoneId);
}

/** Tasks linked directly to the project but not tied to any specific milestone. */
export function unassignedProjectTasks(tasks: Task[], projectId: string): Task[] {
  return tasks.filter((t) => t.projectId === projectId && !t.milestoneId);
}

export interface ProjectProgress {
  milestonesTotal: number;
  milestonesCompleted: number;
  tasksTotal: number;
  tasksCompleted: number;
  /** 0..1 — the only completion measure, driven purely by Task.status === 'completed' and
   *  Milestone.status === 'completed'. Never derived from focus-session time logged. */
  taskCompletionRatio: number;
  milestoneCompletionRatio: number;
  /** Sum of each incomplete linked task's REMAINING estimate (full estimate minus real
   *  logged focus time, via focus/sessionEngine.remainingEstimateMinutes) — never the
   *  original estimate for a task that's already been partly worked on, and never reduced
   *  to zero just because a session touched it. */
  remainingEstimatedMinutes: number;
}

export function computeProjectProgress(
  projectId: string,
  milestones: Milestone[],
  tasks: Task[],
  sessions: FocusSession[]
): ProjectProgress {
  const projectMilestones = milestones.filter((m) => m.projectId === projectId);
  const projectTasks = tasksForProject(tasks, projectId);

  const milestonesTotal = projectMilestones.length;
  const milestonesCompleted = projectMilestones.filter((m) => m.status === 'completed').length;

  const tasksTotal = projectTasks.length;
  const tasksCompleted = projectTasks.filter((t) => t.status === 'completed').length;

  const remainingEstimatedMinutes = projectTasks
    .filter((t) => t.status !== 'completed' && t.status !== 'delegated')
    .reduce((sum, t) => sum + remainingEstimateMinutes(t, sessions), 0);

  return {
    milestonesTotal,
    milestonesCompleted,
    tasksTotal,
    tasksCompleted,
    taskCompletionRatio: tasksTotal === 0 ? 0 : tasksCompleted / tasksTotal,
    milestoneCompletionRatio: milestonesTotal === 0 ? 0 : milestonesCompleted / milestonesTotal,
    remainingEstimatedMinutes,
  };
}

export interface UpcomingDeadline {
  kind: 'milestone' | 'task';
  id: string;
  title: string;
  date: ISODate;
}

/**
 * Every not-yet-complete deadline for this project — a pending milestone's target date, or
 * a non-completed linked task's own deadline — nearest first. A completed item never
 * appears here regardless of how it was finished (never derived from logged time, only
 * from Task.status/Milestone.status actually being 'completed').
 */
export function upcomingDeadlines(projectId: string, milestones: Milestone[], tasks: Task[]): UpcomingDeadline[] {
  const items: UpcomingDeadline[] = [];
  for (const m of milestones) {
    if (m.projectId !== projectId || m.status === 'completed') continue;
    items.push({ kind: 'milestone', id: m.id, title: m.title, date: m.targetDate });
  }
  for (const t of tasksForProject(tasks, projectId)) {
    if (!t.deadline || t.status === 'completed' || t.status === 'delegated') continue;
    items.push({ kind: 'task', id: t.id, title: t.title, date: t.deadline.slice(0, 10) });
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
