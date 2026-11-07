// Domain types for Goals/Projects — a higher-level grouping of existing Tasks, never a
// parallel task model. A Task links in via Task.projectId/milestoneId (see planning/types.ts);
// nothing here duplicates a task's own fields.
import type { ISODate, ISODateTime } from '../planning/types';

export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'active' | 'completed' | 'archived';

export interface Project {
  id: string;
  title: string;
  description?: string;
  targetDate: ISODate;
  priority: ProjectPriority;
  status: ProjectStatus;
  createdAt: ISODateTime;
  /** Set only by an explicit "mark complete" action — never inferred from linked tasks'
   *  completion or from time logged against them. */
  completedAt?: ISODateTime;
}

export type MilestoneStatus = 'pending' | 'completed';

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  targetDate: ISODate;
  status: MilestoneStatus;
  /** Position among the project's milestones; reassigned as a contiguous 0..n-1 sequence,
   *  same convention as HabitDefinition.order. */
  order: number;
  createdAt: ISODateTime;
  /** Set only by an explicit "mark complete" action — see Project.completedAt. A milestone
   *  is never auto-completed because its linked tasks finished or because focus time was
   *  logged against them; the user always decides. */
  completedAt?: ISODateTime;
}
