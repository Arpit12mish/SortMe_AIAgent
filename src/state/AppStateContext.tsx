import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createSampleTasks } from '../data/sampleData';
import { replan } from '../planning/replanner';
import { generatePlan } from '../planning/scheduler';
import { toISODate } from '../planning/time';
import type { Preferences, ReplanEvent, Task, TaskPriority, TaskStatus, PlanVersion } from '../planning/types';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';
import { generateId } from '../utils/id';

export interface NewTaskInput {
  title: string;
  estimateMinutes: number;
  deadline?: string;
  priority: TaskPriority;
  canMove: boolean;
}

export interface PlanEditOverrides {
  /** Task ids that must be included in today's plan even if lower priority than others. */
  forceIncludeTaskIds?: string[];
  /** Task ids to leave out of today's plan for now (kept in the backlog, not deleted). */
  forceExcludeTaskIds?: string[];
}

interface AppStateShape {
  loading: boolean;
  preferences: Preferences | null;
  tasks: Task[];
  planVersions: PlanVersion[];
  currentPlan: PlanVersion | null;
  proposedPlan: PlanVersion | null;
  activeDate: string;
}

interface AppStateValue extends AppStateShape {
  completeOnboarding: (preferences: Preferences, opts?: { loadSampleScenario?: boolean }) => Promise<void>;
  updatePreferences: (patch: Partial<Preferences>) => Promise<void>;
  addTask: (input: NewTaskInput, opts?: { triggerReplan?: boolean }) => Promise<void>;
  generateInitialPlan: () => Promise<void>;
  reportDelay: (taskId: string | undefined, delayMinutes: number) => Promise<void>;
  reportEventChanged: (description: string) => Promise<void>;
  reportEnergyChanged: (level: 'low' | 'normal' | 'high') => Promise<void>;
  acceptProposedPlan: () => Promise<void>;
  editProposedPlan: (overrides: PlanEditOverrides) => Promise<void>;
  discardProposedPlan: () => Promise<void>;
  resetAppData: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

function applyPlanTaskStatuses(plan: PlanVersion): Map<string, TaskStatus> {
  const statusByTaskId = new Map<string, TaskStatus>();
  for (const block of plan.blocks) {
    if (block.taskId) statusByTaskId.set(block.taskId, 'scheduled');
  }
  for (const ref of plan.unscheduledTasks) {
    statusByTaskId.set(ref.taskId, 'unscheduled');
  }
  for (const ref of plan.atRiskTasks) {
    statusByTaskId.set(ref.taskId, 'at_risk');
  }
  return statusByTaskId;
}

export function AppStateProvider({
  children,
  repositories,
}: {
  children: React.ReactNode;
  repositories?: AppRepositories;
}) {
  const repos = useMemo(() => repositories ?? createAsyncStorageRepositories(), [repositories]);
  const [activeDate] = useState(() => toISODate(new Date()));
  const [state, setState] = useState<AppStateShape>({
    loading: true,
    preferences: null,
    tasks: [],
    planVersions: [],
    currentPlan: null,
    proposedPlan: null,
    activeDate,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [preferences, tasks, planVersions, currentPlanId] = await Promise.all([
        repos.preferences.get(),
        repos.tasks.list(),
        repos.plans.listVersions(),
        repos.plans.getCurrentVersionId(activeDate),
      ]);
      if (cancelled) return;
      const currentPlan = planVersions.find((v) => v.id === currentPlanId) ?? null;
      const proposedPlan =
        planVersions.find((v) => v.date === activeDate && v.status === 'proposed') ?? null;
      setState({ loading: false, preferences, tasks, planVersions, currentPlan, proposedPlan, activeDate });
    })();
    return () => {
      cancelled = true;
    };
  }, [repos, activeDate]);

  const persistTaskStatuses = useCallback(
    async (statusByTaskId: Map<string, TaskStatus>, baseTasks: Task[]) => {
      await Promise.all(
        [...statusByTaskId.entries()].map(([id, status]) => repos.tasks.update(id, { status }))
      );
      return baseTasks.map((t) => (statusByTaskId.has(t.id) ? { ...t, status: statusByTaskId.get(t.id)! } : t));
    },
    [repos]
  );

  const completeOnboarding = useCallback<AppStateValue['completeOnboarding']>(
    async (preferences, opts) => {
      await repos.preferences.save(preferences);
      let tasks = state.tasks;
      if (opts?.loadSampleScenario) {
        const sampleTasks = createSampleTasks(new Date());
        await Promise.all(sampleTasks.map((t) => repos.tasks.create(t)));
        tasks = [...tasks, ...sampleTasks];

        const plan = generatePlan({
          date: activeDate,
          preferences,
          tasks,
          version: 1,
          idGen: () => generateId('block'),
        });
        const acceptedPlan: PlanVersion = { ...plan, status: 'accepted' };
        await repos.plans.saveVersion(acceptedPlan);
        await repos.plans.setCurrentVersionId(activeDate, acceptedPlan.id);
        const statusMap = applyPlanTaskStatuses(acceptedPlan);
        tasks = await persistTaskStatuses(statusMap, tasks);

        setState((s) => ({
          ...s,
          preferences,
          tasks,
          planVersions: [...s.planVersions, acceptedPlan],
          currentPlan: acceptedPlan,
          proposedPlan: null,
        }));
        return;
      }
      setState((s) => ({ ...s, preferences, tasks }));
    },
    [repos, state.tasks, activeDate, persistTaskStatuses]
  );

  const updatePreferences = useCallback<AppStateValue['updatePreferences']>(
    async (patch) => {
      setState((s) => {
        if (!s.preferences) return s;
        const next = { ...s.preferences, ...patch };
        repos.preferences.save(next);
        return { ...s, preferences: next };
      });
    },
    [repos]
  );

  const runReplanOrGenerate = useCallback(
    async (event: ReplanEvent | null, tasksOverride?: Task[]) => {
      const preferences = state.preferences;
      if (!preferences) return;
      const tasks = tasksOverride ?? state.tasks;
      const now = new Date().toISOString();

      let proposed: PlanVersion;
      if (state.currentPlan && event) {
        proposed = replan({
          currentPlan: state.currentPlan,
          event,
          preferences,
          tasks,
          now,
          idGen: () => generateId('block'),
        });
      } else {
        const nextVersion = (state.currentPlan?.version ?? state.planVersions.length) + 1;
        proposed = generatePlan({
          date: state.activeDate,
          preferences,
          tasks,
          version: nextVersion,
          parentVersionId: state.currentPlan?.id,
          idGen: () => generateId('block'),
          nowIso: now,
        });
      }

      await repos.plans.saveVersion(proposed);
      setState((s) => ({ ...s, planVersions: [...s.planVersions, proposed], proposedPlan: proposed }));
    },
    [repos, state.preferences, state.tasks, state.currentPlan, state.planVersions, state.activeDate]
  );

  const triggerReplanInternal = useCallback(
    (event: ReplanEvent, tasksOverride?: Task[]) => runReplanOrGenerate(event, tasksOverride),
    [runReplanOrGenerate]
  );

  const addTask = useCallback<AppStateValue['addTask']>(
    async (input, opts) => {
      const task: Task = {
        id: generateId('task'),
        title: input.title,
        estimateMinutes: input.estimateMinutes,
        deadline: input.deadline,
        priority: input.priority,
        canMove: input.canMove,
        status: 'unscheduled',
        createdAt: new Date().toISOString(),
      };
      await repos.tasks.create(task);
      const tasks = [...state.tasks, task];
      setState((s) => ({ ...s, tasks }));

      if (opts?.triggerReplan) {
        await triggerReplanInternal({ type: 'new_task', taskId: task.id, reportedAt: task.createdAt }, tasks);
      }
    },
    [repos, state.tasks, triggerReplanInternal]
  );

  const generateInitialPlan = useCallback<AppStateValue['generateInitialPlan']>(async () => {
    await runReplanOrGenerate(null);
  }, [runReplanOrGenerate]);

  const reportDelay = useCallback<AppStateValue['reportDelay']>(
    async (taskId, delayMinutes) => {
      await triggerReplanInternal({
        type: 'late_start',
        taskId,
        delayMinutes,
        reportedAt: new Date().toISOString(),
      });
    },
    [triggerReplanInternal]
  );

  const reportEventChanged = useCallback<AppStateValue['reportEventChanged']>(
    async (description) => {
      await triggerReplanInternal({ type: 'event_changed', description, reportedAt: new Date().toISOString() });
    },
    [triggerReplanInternal]
  );

  const reportEnergyChanged = useCallback<AppStateValue['reportEnergyChanged']>(
    async (level) => {
      await triggerReplanInternal({ type: 'energy_changed', level, reportedAt: new Date().toISOString() });
    },
    [triggerReplanInternal]
  );

  const acceptProposedPlan = useCallback<AppStateValue['acceptProposedPlan']>(async () => {
    if (!state.proposedPlan) return;
    const accepted: PlanVersion = { ...state.proposedPlan, status: 'accepted' };
    await repos.plans.saveVersion(accepted);
    await repos.plans.setCurrentVersionId(state.activeDate, accepted.id);
    const statusMap = applyPlanTaskStatuses(accepted);
    const tasks = await persistTaskStatuses(statusMap, state.tasks);
    setState((s) => ({
      ...s,
      tasks,
      planVersions: s.planVersions.map((v) => (v.id === accepted.id ? accepted : v)),
      currentPlan: accepted,
      proposedPlan: null,
    }));
  }, [repos, state.proposedPlan, state.activeDate, state.tasks, persistTaskStatuses]);

  const discardProposedPlan = useCallback<AppStateValue['discardProposedPlan']>(async () => {
    if (!state.proposedPlan) return;
    const discarded: PlanVersion = { ...state.proposedPlan, status: 'discarded' };
    await repos.plans.saveVersion(discarded);
    setState((s) => ({
      ...s,
      planVersions: s.planVersions.map((v) => (v.id === discarded.id ? discarded : v)),
      proposedPlan: null,
    }));
  }, [repos, state.proposedPlan]);

  const editProposedPlan = useCallback<AppStateValue['editProposedPlan']>(
    async (overrides) => {
      const preferences = state.preferences;
      const base = state.proposedPlan;
      if (!preferences || !base) return;

      const forceExclude = new Set(overrides.forceExcludeTaskIds ?? []);
      const forceInclude = new Set(overrides.forceIncludeTaskIds ?? []);
      const now = new Date().toISOString();

      // Re-run allocation from the plan's parent, honoring the user's overrides,
      // by nudging priority: forced-include tasks are promoted to 'urgent' for
      // this run only (the underlying task priority is untouched), and
      // forced-exclude tasks are removed from the pool entirely.
      const adjustedTasks = state.tasks
        .filter((t) => !forceExclude.has(t.id))
        .map((t) => (forceInclude.has(t.id) ? { ...t, priority: 'urgent' as const } : t));

      let revised: PlanVersion;
      const parentPlan = state.planVersions.find((v) => v.id === base.parentVersionId);
      if (parentPlan && base.triggeredBy) {
        revised = replan({
          currentPlan: parentPlan,
          event: base.triggeredBy,
          preferences,
          tasks: adjustedTasks,
          now,
          idGen: () => generateId('block'),
        });
      } else {
        revised = generatePlan({
          date: state.activeDate,
          preferences,
          tasks: adjustedTasks,
          version: base.version,
          parentVersionId: base.parentVersionId,
          idGen: () => generateId('block'),
          nowIso: now,
        });
      }
      revised = { ...revised, id: base.id, createdAt: base.createdAt };

      await repos.plans.saveVersion(revised);
      setState((s) => ({
        ...s,
        planVersions: s.planVersions.map((v) => (v.id === revised.id ? revised : v)),
        proposedPlan: revised,
      }));
    },
    [repos, state.preferences, state.proposedPlan, state.tasks, state.planVersions, state.activeDate]
  );

  const resetAppData = useCallback<AppStateValue['resetAppData']>(async () => {
    await repos.resetAll();
    setState({
      loading: false,
      preferences: null,
      tasks: [],
      planVersions: [],
      currentPlan: null,
      proposedPlan: null,
      activeDate,
    });
  }, [repos, activeDate]);

  const value = useMemo<AppStateValue>(
    () => ({
      ...state,
      completeOnboarding,
      updatePreferences,
      addTask,
      generateInitialPlan,
      reportDelay,
      reportEventChanged,
      reportEnergyChanged,
      acceptProposedPlan,
      editProposedPlan,
      discardProposedPlan,
      resetAppData,
    }),
    [
      state,
      completeOnboarding,
      updatePreferences,
      addTask,
      generateInitialPlan,
      reportDelay,
      reportEventChanged,
      reportEnergyChanged,
      acceptProposedPlan,
      editProposedPlan,
      discardProposedPlan,
      resetAppData,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppStateProvider');
  return ctx;
}
