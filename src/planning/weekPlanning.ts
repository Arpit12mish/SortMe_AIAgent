import { isEligibleForPool } from './priority';
import { replan } from './replanner';
import type { ISODate, ISODateTime, PlanVersion, Preferences, ReplanEvent, Task } from './types';

function currentPlanFor(
  date: ISODate,
  planVersions: PlanVersion[],
  currentPlanIdByDate: Record<ISODate, string>
): PlanVersion | null {
  const id = currentPlanIdByDate[date];
  if (!id) return null;
  return planVersions.find((v) => v.id === id) ?? null;
}

/**
 * For every task referenced by any accepted plan, the single chronologically LATEST
 * date whose accepted plan references it — ISODate strings ("YYYY-MM-DD") sort
 * chronologically, so plain string comparison is enough. An earlier date's claim on
 * the same task is superseded the moment a later date's accepted plan picks the task
 * back up (see rolloverCandidatesFor), so only the latest claim counts as "current."
 */
function latestClaimDates(
  planVersions: PlanVersion[],
  currentPlanIdByDate: Record<ISODate, string>
): Map<string, ISODate> {
  const latest = new Map<string, ISODate>();
  for (const [date, id] of Object.entries(currentPlanIdByDate)) {
    const plan = planVersions.find((v) => v.id === id);
    if (!plan) continue;
    for (const block of plan.blocks) {
      if (!block.taskId) continue;
      const current = latest.get(block.taskId);
      if (!current || date > current) latest.set(block.taskId, date);
    }
  }
  return latest;
}

/**
 * Every task currently claimed by some OTHER date's accepted plan — a plan block on
 * `excludeDate` must never also grab one of these, so the same one-time task can't be
 * double-booked across two days. "Claimed" means `excludeDate` isn't the chronologically
 * latest accepted date referencing the task — an earlier date's accepted plan still
 * lists the task (preserved history), but once a later date's accepted plan has picked
 * the same unfinished task back up, that earlier reference no longer counts as a live
 * claim. Only accepted (current) plans claim a task; a still-pending proposal for
 * another date never blocks this date's pool, mirroring every other "accepted is
 * authoritative, proposals are provisional" rule already in this codebase.
 */
export function claimedTaskIdsExcluding(
  planVersions: PlanVersion[],
  currentPlanIdByDate: Record<ISODate, string>,
  excludeDate: ISODate
): Set<string> {
  const latest = latestClaimDates(planVersions, currentPlanIdByDate);
  const claimed = new Set<string>();
  for (const [taskId, date] of latest) {
    if (date !== excludeDate) claimed.add(taskId);
  }
  return claimed;
}

export interface RolloverCandidate {
  taskId: string;
  /** The date whose accepted plan most recently scheduled this task, before it rolled over. */
  fromDate: ISODate;
}

/**
 * Unfinished work eligible to roll forward into `date`'s pool: a task whose latest
 * accepted claim is a date strictly BEFORE `date` (it was scheduled there and never
 * marked completed/delegated), and isn't already claimed by some even-later accepted
 * date. The latter case — a future date further out already has it — is what keeps
 * two accepted plans from ever treating the same unfinished work as independently
 * owned: `date` simply isn't offered a candidate whose true current owner is someone
 * else, before or after it. A date's own claim is never a candidate for itself,
 * and nothing here mutates or removes the task's history on its original date.
 */
export function rolloverCandidatesFor(
  planVersions: PlanVersion[],
  currentPlanIdByDate: Record<ISODate, string>,
  tasks: Task[],
  date: ISODate
): RolloverCandidate[] {
  const latest = latestClaimDates(planVersions, currentPlanIdByDate);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const candidates: RolloverCandidate[] = [];
  for (const [taskId, claimDate] of latest) {
    if (claimDate >= date) continue; // owned by `date` itself, or by a date at/after it
    const task = taskById.get(taskId);
    if (!task || !isEligibleForPool(task)) continue; // completed/delegated/gone — never rolls over
    candidates.push({ taskId, fromDate: claimDate });
  }
  return candidates;
}

/** The one date (if any) whose accepted plan currently schedules this task. */
export function dateSchedulingTask(
  planVersions: PlanVersion[],
  currentPlanIdByDate: Record<ISODate, string>,
  taskId: string
): ISODate | null {
  for (const [date, id] of Object.entries(currentPlanIdByDate)) {
    const plan = planVersions.find((v) => v.id === id);
    if (plan?.blocks.some((b) => b.taskId === taskId)) return date;
  }
  return null;
}

export interface ProposeAcrossDatesInput {
  planVersions: PlanVersion[];
  currentPlanIdByDate: Record<ISODate, string>;
  preferences: Preferences;
  tasks: Task[];
  dates: ISODate[];
  event: ReplanEvent;
  now: ISODateTime;
  idGen: () => string;
  /** Today's date and the task (if any) with an active focus session right now. A focus
   *  session can only ever be active against today's plan, so this is only ever applied
   *  when replanning `activeDate` itself — every other date in `dates` ignores it. */
  activeDate?: ISODate;
  activeSessionTaskId?: string;
}

/**
 * Runs a replan against every date in `dates` that already has an accepted plan,
 * and returns only the resulting proposals that actually differ from what's
 * accepted today (`changes.length > 0`). A date with no accepted plan yet is
 * skipped (nothing to review there — it'll pick up current preferences whenever
 * first generated), and a date genuinely unaffected by the change produces no
 * proposal at all, so "which dates are affected" falls out of this for free.
 */
export function proposeAcrossDates(input: ProposeAcrossDatesInput): PlanVersion[] {
  const proposals: PlanVersion[] = [];
  for (const date of input.dates) {
    const currentPlan = currentPlanFor(date, input.planVersions, input.currentPlanIdByDate);
    if (!currentPlan) continue;
    const excludeTaskIds = claimedTaskIdsExcluding(input.planVersions, input.currentPlanIdByDate, date);
    const proposed = replan({
      currentPlan,
      event: input.event,
      preferences: input.preferences,
      tasks: input.tasks,
      now: input.now,
      idGen: input.idGen,
      excludeTaskIds,
      activeSessionTaskId: date === input.activeDate ? input.activeSessionTaskId : undefined,
    });
    if (proposed.changes.length > 0) proposals.push(proposed);
  }
  return proposals;
}
