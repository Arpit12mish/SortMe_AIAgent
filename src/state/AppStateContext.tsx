import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createSampleTasks, findMissingSampleTasks } from '../data/sampleData';
import { remainingEstimateMinutes } from '../focus/sessionEngine';
import type { FocusSession } from '../focus/types';
import { replan } from '../planning/replanner';
import { isProposalStale, supersedePriorProposals } from '../planning/replanVersioning';
import { generatePlan } from '../planning/scheduler';
import { addDaysToISODate, toISODate } from '../planning/time';
import type { ISODate, Preferences, ReplanEvent, Task, TaskPriority, TaskStatus, PlanVersion } from '../planning/types';
import { claimedTaskIdsExcluding, dateSchedulingTask, proposeAcrossDates, rolloverCandidatesFor } from '../planning/weekPlanning';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';
import { generateId } from '../utils/id';
import { useFocusSessions } from './FocusSessionContext';

/** Builds the rolloverFrom map generatePlan expects from this date's rollover candidates,
 *  using real logged focus time (never the task's full estimate again) for what remains. */
function buildRolloverFrom(
  candidates: { taskId: string; fromDate: ISODate }[],
  tasks: Task[],
  sessions: FocusSession[]
): Map<string, { remainingMinutes: number; fromDate: ISODate }> {
  const map = new Map<string, { remainingMinutes: number; fromDate: ISODate }>();
  for (const c of candidates) {
    const task = tasks.find((t) => t.id === c.taskId);
    if (!task) continue;
    map.set(c.taskId, { remainingMinutes: remainingEstimateMinutes(task, sessions), fromDate: c.fromDate });
  }
  return map;
}

export class StalePlanError extends Error {
  constructor() {
    super('This plan was replaced by a newer version. Please review the latest proposal.');
  }
}

/** How many upcoming days (starting today) the week view and multi-date review cover. */
const WEEK_WINDOW_DAYS = 7;

export interface NewTaskInput {
  title: string;
  estimateMinutes: number;
  deadline?: string;
  priority: TaskPriority;
  canMove: boolean;
  /** Optional link to a Project/Milestone at creation time — see planning/types.ts Task
   *  fields of the same name. Never required; a task created without these is a standalone
   *  task exactly as before. */
  projectId?: string;
  milestoneId?: string;
}

export interface PlanEditOverrides {
  /** Task ids that must be included in the plan even if lower priority than others. */
  forceIncludeTaskIds?: string[];
  /** Task ids to leave out of the plan for now (kept in the backlog, not deleted). */
  forceExcludeTaskIds?: string[];
}

interface AppStateShape {
  loading: boolean;
  preferences: Preferences | null;
  tasks: Task[];
  planVersions: PlanVersion[];
  currentPlan: PlanVersion | null;
  proposedPlan: PlanVersion | null;
  /** Date -> id of that date's accepted (current) plan version, for every date ever accepted. */
  currentPlanIdByDate: Record<string, string>;
  activeDate: string;
}

interface AppStateValue extends AppStateShape {
  completeOnboarding: (preferences: Preferences, opts?: { loadSampleScenario?: boolean }) => Promise<void>;
  updatePreferences: (patch: Partial<Preferences>) => Promise<void>;
  /** Proposes a revision reflecting whatever was just saved via updatePreferences, for every
   *  date in the 7-day window that already has an accepted plan the change actually affects.
   *  Settings itself never auto-triggers a replan, so this is a separate, explicit action. */
  reviewPreferencesChange: (summary: string) => Promise<void>;
  addTask: (input: NewTaskInput, opts?: { triggerReplan?: boolean }) => Promise<Task>;
  updateTask: (
    id: string,
    patch: Partial<
      Pick<Task, 'title' | 'estimateMinutes' | 'deadline' | 'priority' | 'canMove' | 'projectId' | 'milestoneId'>
    >,
    opts?: { triggerReplan?: boolean }
  ) => Promise<void>;
  /** Marks a task completed outright — the one thing that permanently stops it from ever
   *  rolling over to a later date (see planning/weekPlanning.rolloverCandidatesFor). Called
   *  when a focus session on the task ends with outcome 'completed'; never mutates a plan's
   *  own history, just the task's live status. */
  markTaskCompleted: (id: string) => Promise<void>;
  generateInitialPlan: () => Promise<void>;
  /** Generates a fresh proposed plan for an arbitrary date (week view). No-op if that date
   *  already has a current or proposed plan — the caller should just show what's there. */
  generatePlanForDate: (date: string) => Promise<void>;
  /** The current (accepted) and proposed plan for any date, not just today. */
  planForDate: (date: string) => { current: PlanVersion | null; proposed: PlanVersion | null };
  reportDelay: (taskId: string | undefined, delayMinutes: number) => Promise<void>;
  /** tasksOverride lets a caller that just added several tasks/interviews in the same batch
   *  (e.g. the daily-briefing apply flow) hand the replanner the up-to-date task list directly
   *  — the context's own `tasks` closure here can't see same-batch additions until a re-render
   *  settles, since each addTask call is a separately-closed-over function invocation. */
  reportEventChanged: (description: string, tasksOverride?: Task[]) => Promise<void>;
  reportEnergyChanged: (level: 'low' | 'normal' | 'high') => Promise<void>;
  acceptProposedPlan: (date: string, expectedPlanId?: string) => Promise<void>;
  editProposedPlan: (date: string, overrides: PlanEditOverrides) => Promise<void>;
  discardProposedPlan: (date: string, expectedPlanId?: string) => Promise<void>;
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
  // FocusSessionProvider wraps AppStateProvider precisely so this is reachable — a task with
  // an active (running/paused) session must be pinned exactly where it's scheduled for every
  // replan while that session lasts, regardless of its own canMove. `sessions` (the full
  // history, not just the active one) is what lets a rolled-over task's remaining estimate
  // be computed from real logged time instead of its full original estimate.
  const { activeSession, sessions } = useFocusSessions();
  const [activeDate] = useState(() => toISODate(new Date()));
  const [state, setState] = useState<AppStateShape>({
    loading: true,
    preferences: null,
    tasks: [],
    planVersions: [],
    currentPlan: null,
    proposedPlan: null,
    currentPlanIdByDate: {},
    activeDate,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedPreferences, loadedTasks, planVersions, currentPlanIdByDate] = await Promise.all([
        repos.preferences.get(),
        repos.tasks.list(),
        repos.plans.listVersions(),
        repos.plans.getAllCurrentVersionIds(),
      ]);
      if (cancelled) return;

      // Preferences is a single blind-overwritten JSON blob with no migration layer, so an
      // install from before protectedTimeBlocks/travelTimeMinutes existed will parse with
      // them missing. Normalize once here so every downstream reader always sees a fully
      // populated object instead of repeating `?? []` everywhere.
      const preferences: Preferences | null = loadedPreferences && {
        ...loadedPreferences,
        protectedTimeBlocks: loadedPreferences.protectedTimeBlocks ?? [],
      };

      const currentPlan = planVersions.find((v) => v.id === currentPlanIdByDate[activeDate]) ?? null;
      const proposedPlan =
        planVersions.find((v) => v.date === activeDate && v.status === 'proposed') ?? null;

      // One-time backfill for installs that hit the historical lost-update bug in
      // AsyncStorageTaskRepository.create(): a plan block can reference a sample
      // task id that was never actually persisted. Only ever recreates rows whose
      // id matches a known sample task and that a real plan still references, so
      // it can't touch or duplicate a user's own tasks; once backfilled, tasks
      // contains them and this is a no-op on every later start.
      let tasks = loadedTasks;
      const missingSampleTasks = findMissingSampleTasks(tasks, planVersions);
      if (missingSampleTasks.length > 0) {
        // A backfilled task should reflect what the current accepted plan
        // actually did with it (scheduled/unscheduled/at_risk), not the bare
        // 'unscheduled' default createSampleTasks() gives every task before
        // any plan has run — otherwise the Tasks tab would show a task the
        // Today plan is actively scheduling as still "unscheduled".
        const statusMap = currentPlan ? applyPlanTaskStatuses(currentPlan) : new Map<string, TaskStatus>();
        const backfilled = missingSampleTasks.map((t) =>
          statusMap.has(t.id) ? { ...t, status: statusMap.get(t.id)! } : t
        );
        await Promise.all(backfilled.map((t) => repos.tasks.create(t)));
        tasks = [...tasks, ...backfilled];
      }

      setState({
        loading: false,
        preferences,
        tasks,
        planVersions,
        currentPlan,
        proposedPlan,
        currentPlanIdByDate,
        activeDate,
      });
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
        const existingIds = new Set(tasks.map((t) => t.id));
        const sampleTasks = createSampleTasks(new Date());
        // Guards against duplicate rows if this ever runs twice for the same
        // install (e.g. onboarding revisited without an intervening reset) —
        // create() itself is now race-safe for concurrent calls, but it's still
        // a plain append, not an upsert, so a repeat call must skip ids that
        // already exist rather than rely on the repository to dedupe.
        const newSampleTasks = sampleTasks.filter((t) => !existingIds.has(t.id));
        await Promise.all(newSampleTasks.map((t) => repos.tasks.create(t)));
        tasks = [...tasks, ...newSampleTasks];

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
          currentPlanIdByDate: { ...s.currentPlanIdByDate, [activeDate]: acceptedPlan.id },
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

  /**
   * The single engine entry point for every generate/replan path, for ANY date — today's
   * existing flows (generateInitialPlan, reportDelay, ...) and the week view's arbitrary-date
   * flows both funnel through this. Always excludes tasks already claimed by another date's
   * accepted plan (see weekPlanning.claimedTaskIdsExcluding), which is a no-op empty set
   * whenever no other date has an accepted plan yet — so single-day usage is unaffected.
   */
  const runReplanOrGenerateForDate = useCallback(
    async (date: string, event: ReplanEvent | null, tasksOverride?: Task[]) => {
      const preferences = state.preferences;
      if (!preferences) return;
      const tasks = tasksOverride ?? state.tasks;
      const now = new Date().toISOString();
      const currentPlanForDate =
        state.planVersions.find((v) => v.id === state.currentPlanIdByDate[date]) ?? null;
      const excludeTaskIds = claimedTaskIdsExcluding(state.planVersions, state.currentPlanIdByDate, date);
      // A focus session can only ever be active against today's plan (it's only ever started
      // from a block on activeDate), so it's never relevant when generating/replanning any
      // other date.
      const activeSessionTaskId = date === activeDate ? activeSession?.taskId : undefined;

      let proposed: PlanVersion;
      if (currentPlanForDate && event) {
        proposed = replan({
          currentPlan: currentPlanForDate,
          event,
          preferences,
          tasks,
          now,
          idGen: () => generateId('block'),
          excludeTaskIds,
          activeSessionTaskId,
        });
      } else {
        // Rollover only applies to a date's FIRST generation (there's no earlier accepted
        // plan for `date` itself to replan against) — unfinished work from an earlier
        // accepted date is offered back into the pool here instead of staying excluded.
        const rolloverCandidates = rolloverCandidatesFor(state.planVersions, state.currentPlanIdByDate, tasks, date);
        const rolloverTaskIds = new Set(rolloverCandidates.map((c) => c.taskId));
        const rolloverFrom = buildRolloverFrom(rolloverCandidates, tasks, sessions);
        const existingForDate = state.planVersions.filter((v) => v.date === date);
        const nextVersion = (currentPlanForDate?.version ?? existingForDate.length) + 1;
        proposed = generatePlan({
          date,
          preferences,
          tasks,
          version: nextVersion,
          parentVersionId: currentPlanForDate?.id,
          idGen: () => generateId('block'),
          nowIso: now,
          excludeTaskIds: new Set([...excludeTaskIds].filter((id) => !rolloverTaskIds.has(id))),
          rolloverFrom,
        });
      }

      await repos.plans.saveVersion(proposed);
      // If a prior proposal for this date was never accepted or discarded,
      // it's now superseded rather than left dangling as a second "current" one.
      const { updated, superseded } = supersedePriorProposals([...state.planVersions, proposed], proposed);
      await Promise.all(superseded.map((v) => repos.plans.saveVersion(v)));
      setState((s) => ({
        ...s,
        planVersions: updated,
        ...(date === activeDate ? { proposedPlan: proposed } : {}),
      }));
    },
    [repos, state.preferences, state.tasks, state.planVersions, state.currentPlanIdByDate, activeDate, activeSession, sessions]
  );

  const triggerReplanInternal = useCallback(
    (event: ReplanEvent, tasksOverride?: Task[]) => runReplanOrGenerateForDate(activeDate, event, tasksOverride),
    [runReplanOrGenerateForDate, activeDate]
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
        projectId: input.projectId,
        milestoneId: input.milestoneId,
        status: 'unscheduled',
        createdAt: new Date().toISOString(),
      };
      await repos.tasks.create(task);
      // Must derive the next tasks array from the setState updater's own `s`, not the
      // outer `state.tasks` closure: two addTask calls fired back-to-back from the same
      // render (e.g. a batch-apply loop) would otherwise both read the same stale
      // pre-loop snapshot and each overwrite the other's addition instead of accumulating.
      let tasks: Task[] = [];
      setState((s) => {
        tasks = [...s.tasks, task];
        return { ...s, tasks };
      });

      if (opts?.triggerReplan) {
        await triggerReplanInternal({ type: 'new_task', taskId: task.id, reportedAt: task.createdAt }, tasks);
      }
      return task;
    },
    [repos, triggerReplanInternal]
  );

  const reviewPreferencesChange = useCallback<AppStateValue['reviewPreferencesChange']>(
    async (summary) => {
      const preferences = state.preferences;
      if (!preferences) return;
      const now = new Date().toISOString();
      const dates = Array.from({ length: WEEK_WINDOW_DAYS }, (_, i) => addDaysToISODate(activeDate, i));

      const proposals = proposeAcrossDates({
        planVersions: state.planVersions,
        currentPlanIdByDate: state.currentPlanIdByDate,
        preferences,
        tasks: state.tasks,
        dates,
        event: { type: 'preferences_changed', summary, reportedAt: now },
        now,
        idGen: () => generateId('block'),
        activeDate,
        activeSessionTaskId: activeSession?.taskId,
      });
      if (proposals.length === 0) return;

      await Promise.all(proposals.map((p) => repos.plans.saveVersion(p)));

      // Each proposal supersedes any still-pending proposal for its OWN date only —
      // threading the accumulating version list through every call keeps every other
      // date's history untouched, exactly like the single-date path already does.
      let allVersions = [...state.planVersions, ...proposals];
      const allSuperseded: PlanVersion[] = [];
      for (const p of proposals) {
        const { updated, superseded } = supersedePriorProposals(allVersions, p);
        allVersions = updated;
        allSuperseded.push(...superseded);
      }
      await Promise.all(allSuperseded.map((v) => repos.plans.saveVersion(v)));

      const todaysProposal = proposals.find((p) => p.date === activeDate);
      setState((s) => ({
        ...s,
        planVersions: allVersions,
        ...(todaysProposal ? { proposedPlan: todaysProposal } : {}),
      }));
    },
    [repos, state.preferences, state.planVersions, state.currentPlanIdByDate, state.tasks, activeDate, activeSession]
  );

  const updateTask = useCallback<AppStateValue['updateTask']>(
    async (id, patch, opts) => {
      await repos.tasks.update(id, patch);
      const tasks = state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
      setState((s) => ({ ...s, tasks }));

      if (opts?.triggerReplan) {
        const edited = tasks.find((t) => t.id === id);
        // Review against whichever date currently has this task on its accepted plan —
        // falling back to today when it isn't scheduled anywhere yet, matching the old
        // always-today behavior for that case.
        const targetDate =
          dateSchedulingTask(state.planVersions, state.currentPlanIdByDate, id) ?? activeDate;
        await runReplanOrGenerateForDate(
          targetDate,
          { type: 'task_edited', taskId: id, summary: `Edited "${edited?.title ?? 'a task'}".`, reportedAt: new Date().toISOString() },
          tasks
        );
      }
    },
    [repos, state.tasks, state.planVersions, state.currentPlanIdByDate, runReplanOrGenerateForDate, activeDate]
  );

  const markTaskCompleted = useCallback<AppStateValue['markTaskCompleted']>(
    async (id) => {
      await repos.tasks.update(id, { status: 'completed' });
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: 'completed' as const } : t)),
      }));
    },
    [repos]
  );

  const generateInitialPlan = useCallback<AppStateValue['generateInitialPlan']>(async () => {
    await runReplanOrGenerateForDate(activeDate, null);
  }, [runReplanOrGenerateForDate, activeDate]);

  const generatePlanForDate = useCallback<AppStateValue['generatePlanForDate']>(
    async (date) => {
      const currentId = state.currentPlanIdByDate[date];
      const hasProposal = state.planVersions.some((v) => v.date === date && v.status === 'proposed');
      if (currentId || hasProposal) return; // already something there for this date; caller just shows it
      await runReplanOrGenerateForDate(date, null);
    },
    [state.currentPlanIdByDate, state.planVersions, runReplanOrGenerateForDate]
  );

  const planForDate = useCallback<AppStateValue['planForDate']>(
    (date) => {
      const currentId = state.currentPlanIdByDate[date];
      const current = currentId ? state.planVersions.find((v) => v.id === currentId) ?? null : null;
      const proposed = state.planVersions.find((v) => v.date === date && v.status === 'proposed') ?? null;
      return { current, proposed };
    },
    [state.planVersions, state.currentPlanIdByDate]
  );

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
    async (description, tasksOverride) => {
      await triggerReplanInternal(
        { type: 'event_changed', description, reportedAt: new Date().toISOString() },
        tasksOverride
      );
    },
    [triggerReplanInternal]
  );

  const reportEnergyChanged = useCallback<AppStateValue['reportEnergyChanged']>(
    async (level) => {
      await triggerReplanInternal({ type: 'energy_changed', level, reportedAt: new Date().toISOString() });
    },
    [triggerReplanInternal]
  );

  const acceptProposedPlan = useCallback<AppStateValue['acceptProposedPlan']>(
    async (date, expectedPlanId) => {
      const proposed = state.planVersions.find((v) => v.date === date && v.status === 'proposed') ?? null;
      if (!proposed) return;
      if (expectedPlanId && isProposalStale(expectedPlanId, proposed)) {
        throw new StalePlanError();
      }
      const accepted: PlanVersion = { ...proposed, status: 'accepted' };
      await repos.plans.saveVersion(accepted);
      await repos.plans.setCurrentVersionId(date, accepted.id);
      const statusMap = applyPlanTaskStatuses(accepted);
      const tasks = await persistTaskStatuses(statusMap, state.tasks);
      setState((s) => ({
        ...s,
        tasks,
        planVersions: s.planVersions.map((v) => (v.id === accepted.id ? accepted : v)),
        currentPlanIdByDate: { ...s.currentPlanIdByDate, [date]: accepted.id },
        ...(date === activeDate ? { currentPlan: accepted, proposedPlan: null } : {}),
      }));
    },
    [repos, state.planVersions, state.tasks, persistTaskStatuses, activeDate]
  );

  const discardProposedPlan = useCallback<AppStateValue['discardProposedPlan']>(
    async (date, expectedPlanId) => {
      const proposed = state.planVersions.find((v) => v.date === date && v.status === 'proposed') ?? null;
      if (!proposed) return;
      if (expectedPlanId && isProposalStale(expectedPlanId, proposed)) {
        throw new StalePlanError();
      }
      const discarded: PlanVersion = { ...proposed, status: 'discarded' };
      await repos.plans.saveVersion(discarded);
      setState((s) => ({
        ...s,
        planVersions: s.planVersions.map((v) => (v.id === discarded.id ? discarded : v)),
        ...(date === activeDate ? { proposedPlan: null } : {}),
      }));
    },
    [repos, state.planVersions, activeDate]
  );

  const editProposedPlan = useCallback<AppStateValue['editProposedPlan']>(
    async (date, overrides) => {
      const preferences = state.preferences;
      const base = state.planVersions.find((v) => v.date === date && v.status === 'proposed') ?? null;
      if (!preferences || !base) return;

      const forceExclude = new Set(overrides.forceExcludeTaskIds ?? []);
      const forceInclude = new Set(overrides.forceIncludeTaskIds ?? []);
      const now = new Date().toISOString();
      const excludeTaskIds = claimedTaskIdsExcluding(state.planVersions, state.currentPlanIdByDate, date);
      const activeSessionTaskId = date === activeDate ? activeSession?.taskId : undefined;

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
          excludeTaskIds,
          activeSessionTaskId,
        });
      } else {
        const rolloverCandidates = rolloverCandidatesFor(state.planVersions, state.currentPlanIdByDate, adjustedTasks, date);
        const rolloverTaskIds = new Set(rolloverCandidates.map((c) => c.taskId));
        const rolloverFrom = buildRolloverFrom(rolloverCandidates, adjustedTasks, sessions);
        revised = generatePlan({
          date,
          preferences,
          tasks: adjustedTasks,
          version: base.version,
          parentVersionId: base.parentVersionId,
          idGen: () => generateId('block'),
          nowIso: now,
          excludeTaskIds: new Set([...excludeTaskIds].filter((id) => !rolloverTaskIds.has(id))),
          rolloverFrom,
        });
      }
      revised = { ...revised, id: base.id, createdAt: base.createdAt };

      await repos.plans.saveVersion(revised);
      setState((s) => ({
        ...s,
        planVersions: s.planVersions.map((v) => (v.id === revised.id ? revised : v)),
        ...(date === activeDate ? { proposedPlan: revised } : {}),
      }));
    },
    [repos, state.preferences, state.planVersions, state.tasks, state.currentPlanIdByDate, activeDate, activeSession, sessions]
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
      currentPlanIdByDate: {},
      activeDate,
    });
  }, [repos, activeDate]);

  const value = useMemo<AppStateValue>(
    () => ({
      ...state,
      completeOnboarding,
      updatePreferences,
      reviewPreferencesChange,
      addTask,
      updateTask,
      markTaskCompleted,
      generateInitialPlan,
      generatePlanForDate,
      planForDate,
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
      reviewPreferencesChange,
      addTask,
      updateTask,
      markTaskCompleted,
      generateInitialPlan,
      generatePlanForDate,
      planForDate,
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
