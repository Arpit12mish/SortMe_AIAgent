import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { remainingEstimateMinutes } from '../focus/sessionEngine';
import { checkProjectCapacity, type CapacityCheckResult } from '../planning/capacity';
import type { ISODate } from '../planning/types';
import { tasksForProject } from '../projects/projectEngine';
import type { Milestone, Project, ProjectPriority } from '../projects/types';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';
import { generateId } from '../utils/id';
import { useAppState } from './AppStateContext';
import { useFocusSessions } from './FocusSessionContext';

export interface NewProjectInput {
  title: string;
  description?: string;
  targetDate: ISODate;
  priority: ProjectPriority;
}

export interface NewMilestoneInput {
  projectId: string;
  title: string;
  targetDate: ISODate;
}

const EMPTY_CAPACITY: CapacityCheckResult = {
  fits: true,
  placements: [],
  unplacedTaskIds: [],
  totalMinutesNeeded: 0,
  totalMinutesPlaced: 0,
};

interface ProjectStateValue {
  loading: boolean;
  projects: Project[];
  milestones: Milestone[];
  addProject: (input: NewProjectInput) => Promise<Project>;
  updateProject: (id: string, patch: Partial<NewProjectInput>) => Promise<void>;
  markProjectCompleted: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  addMilestone: (input: NewMilestoneInput) => Promise<Milestone>;
  updateMilestone: (id: string, patch: Partial<Pick<Milestone, 'title' | 'targetDate'>>) => Promise<void>;
  /** Explicit only — see Milestone.completedAt. Never set from linked-task completion or
   *  logged focus time. */
  markMilestoneCompleted: (id: string) => Promise<void>;
  reopenMilestone: (id: string) => Promise<void>;
  removeMilestone: (id: string) => Promise<void>;
  /** Whether this project's remaining linked tasks fit between today and its target date,
   *  simulated through the real planner (see planning/capacity.ts) — never a rough estimate. */
  capacityForProject: (projectId: string) => CapacityCheckResult;
}

const ProjectStateContext = createContext<ProjectStateValue | null>(null);

export function ProjectStateProvider({
  children,
  repositories,
}: {
  children: React.ReactNode;
  repositories?: AppRepositories;
}) {
  const repos = useMemo(() => repositories ?? createAsyncStorageRepositories(), [repositories]);
  // Reads the same task/plan/preferences state AppStateContext already owns, rather than
  // duplicating it — linking only ever mutates a Task's own projectId/milestoneId fields,
  // which live there, and capacity checks need the exact same inputs a real replan would use.
  const { preferences, tasks, planVersions, currentPlanIdByDate, activeDate, updateTask } = useAppState();
  const { sessions } = useFocusSessions();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [projectList, milestoneList] = await Promise.all([repos.projects.list(), repos.milestones.list()]);
      if (cancelled) return;
      setProjects(projectList);
      setMilestones(milestoneList);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const capacityForProject = useCallback(
    (projectId: string): CapacityCheckResult => {
      const project = projects.find((p) => p.id === projectId);
      if (!project || !preferences) return EMPTY_CAPACITY;
      const projectTasks = tasksForProject(tasks, projectId);
      const remainingMinutesByTaskId = new Map(projectTasks.map((t) => [t.id, remainingEstimateMinutes(t, sessions)]));
      return checkProjectCapacity({
        preferences,
        tasks,
        planVersions,
        currentPlanIdByDate,
        projectTaskIds: projectTasks.map((t) => t.id),
        fromDate: activeDate,
        toDate: project.targetDate,
        remainingMinutesByTaskId,
        now: new Date().toISOString(),
      });
    },
    [projects, preferences, tasks, planVersions, currentPlanIdByDate, activeDate, sessions]
  );

  const value = useMemo<ProjectStateValue>(
    () => ({
      loading,
      projects,
      milestones,
      addProject: async (input) => {
        const project: Project = {
          id: generateId('project'),
          title: input.title,
          description: input.description,
          targetDate: input.targetDate,
          priority: input.priority,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        await repos.projects.save(project);
        setProjects((prev) => [...prev, project]);
        return project;
      },
      updateProject: async (id, patch) => {
        const current = projects.find((p) => p.id === id);
        if (!current) return;
        const next: Project = { ...current, ...patch };
        await repos.projects.save(next);
        setProjects((prev) => prev.map((p) => (p.id === id ? next : p)));
      },
      markProjectCompleted: async (id) => {
        const current = projects.find((p) => p.id === id);
        if (!current) return;
        const next: Project = { ...current, status: 'completed', completedAt: new Date().toISOString() };
        await repos.projects.save(next);
        setProjects((prev) => prev.map((p) => (p.id === id ? next : p)));
      },
      archiveProject: async (id) => {
        const current = projects.find((p) => p.id === id);
        if (!current) return;
        const next: Project = { ...current, status: 'archived' };
        await repos.projects.save(next);
        setProjects((prev) => prev.map((p) => (p.id === id ? next : p)));
      },
      addMilestone: async (input) => {
        const siblingCount = milestones.filter((m) => m.projectId === input.projectId).length;
        const milestone: Milestone = {
          id: generateId('milestone'),
          projectId: input.projectId,
          title: input.title,
          targetDate: input.targetDate,
          status: 'pending',
          order: siblingCount,
          createdAt: new Date().toISOString(),
        };
        await repos.milestones.save(milestone);
        setMilestones((prev) => [...prev, milestone]);
        return milestone;
      },
      updateMilestone: async (id, patch) => {
        const current = milestones.find((m) => m.id === id);
        if (!current) return;
        const next: Milestone = { ...current, ...patch };
        await repos.milestones.save(next);
        setMilestones((prev) => prev.map((m) => (m.id === id ? next : m)));
      },
      markMilestoneCompleted: async (id) => {
        const current = milestones.find((m) => m.id === id);
        if (!current) return;
        const next: Milestone = { ...current, status: 'completed', completedAt: new Date().toISOString() };
        await repos.milestones.save(next);
        setMilestones((prev) => prev.map((m) => (m.id === id ? next : m)));
      },
      reopenMilestone: async (id) => {
        const current = milestones.find((m) => m.id === id);
        if (!current) return;
        const next: Milestone = { ...current, status: 'pending', completedAt: undefined };
        await repos.milestones.save(next);
        setMilestones((prev) => prev.map((m) => (m.id === id ? next : m)));
      },
      removeMilestone: async (id) => {
        // Linked tasks outlive the milestone — unlink from it (not from the project; they're
        // still general project work) rather than leaving a dangling milestoneId.
        const linkedTasks = tasks.filter((t) => t.milestoneId === id);
        await Promise.all(linkedTasks.map((t) => updateTask(t.id, { milestoneId: undefined })));
        await repos.milestones.remove(id);
        setMilestones((prev) => prev.filter((m) => m.id !== id));
      },
      capacityForProject,
    }),
    [loading, projects, milestones, repos, capacityForProject, tasks, updateTask]
  );

  return <ProjectStateContext.Provider value={value}>{children}</ProjectStateContext.Provider>;
}

export function useProjectState(): ProjectStateValue {
  const ctx = useContext(ProjectStateContext);
  if (!ctx) throw new Error('useProjectState must be used within a ProjectStateProvider');
  return ctx;
}
