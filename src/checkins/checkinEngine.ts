import { toISODate } from '../planning/time';
import type { PlanVersion, Task } from '../planning/types';
import type { EnergyLevel, EveningReview, MorningCheckIn } from './types';

/**
 * "Today" is always the device's local calendar day, matching how the
 * planner itself computes day windows in local time (see planning/time.ts).
 * Comparing MorningCheckIn.date / EveningReview.date as plain YYYY-MM-DD
 * strings — never as parsed UTC instants — keeps this correct across
 * midnight and across timezones.
 */
export function hasCheckedInMorning(checkIns: MorningCheckIn[], date: string): boolean {
  return checkIns.some((c) => c.date === date);
}

export function hasReviewedEvening(reviews: EveningReview[], date: string): boolean {
  return reviews.some((r) => r.date === date);
}

export function todayLocalDate(now: Date = new Date()): string {
  return toISODate(now);
}

const LOW_ENERGY_WORDS = ['low', 'tired', 'exhausted', 'drained', 'sleepy', 'rough'];
const HIGH_ENERGY_WORDS = ['high', 'great', 'energetic', 'energized', 'pumped', 'fresh'];

/** Best-effort keyword match for a typed/spoken energy answer that isn't
 * one of the exact preset values -- same lightweight, deterministic
 * approach as src/voice/intentClassifier.ts, not an AI call. Defaults to
 * 'normal' when nothing matches, same as the field's own default. */
export function inferEnergyLevel(text: string): EnergyLevel {
  const lower = text.toLowerCase();
  if (LOW_ENERGY_WORDS.some((w) => lower.includes(w))) return 'low';
  if (HIGH_ENERGY_WORDS.some((w) => lower.includes(w))) return 'high';
  return 'normal';
}

/** Pulls the first plausible minute count out of free text (e.g. "about
 * 300", "5 hours" -> treated as 300 since the wizard's own preset options
 * are phrased in hours but stored as minutes). Returns undefined rather
 * than guessing when nothing usable is found. */
export function parseAvailableMinutes(text: string): number | undefined {
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (Number.isFinite(hours) && hours > 0) return Math.round(hours * 60);
  }
  const numberMatch = text.match(/\d+/);
  if (numberMatch) {
    const n = Number(numberMatch[0]);
    if (Number.isFinite(n) && n > 0 && n <= 1440) return n;
  }
  return undefined;
}

export interface EveningSummaryDefaults {
  completedTaskIds: string[];
  unfinishedTaskIds: string[];
  deferredTaskIds: string[];
}

/**
 * Derives a starting point for the evening review from the day's accepted
 * plan and current task statuses. The user can still adjust before saving
 * — this is a default, not a verdict.
 */
export function deriveEveningSummary(plan: PlanVersion | null, tasks: Task[]): EveningSummaryDefaults {
  if (!plan) return { completedTaskIds: [], unfinishedTaskIds: [], deferredTaskIds: [] };

  const scheduledTaskIds = new Set(plan.blocks.filter((b) => b.taskId).map((b) => b.taskId as string));
  const deferredTaskIds = [...plan.unscheduledTasks, ...plan.atRiskTasks].map((t) => t.taskId);

  const completedTaskIds: string[] = [];
  const unfinishedTaskIds: string[] = [];
  for (const taskId of scheduledTaskIds) {
    const task = tasks.find((t) => t.id === taskId);
    if (task?.status === 'completed') completedTaskIds.push(taskId);
    else unfinishedTaskIds.push(taskId);
  }

  return { completedTaskIds, unfinishedTaskIds, deferredTaskIds };
}
