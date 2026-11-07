import { durationMinutes, toISODate } from '../planning/time';
import type { ISODate, PlanVersion } from '../planning/types';
import { elapsedMs } from './sessionEngine';
import type { FocusSession } from './types';

export interface WeeklyReviewDay {
  date: ISODate;
  plannedMinutes: number;
  actualMinutes: number;
  sessionsCompleted: number;
}

export interface WeeklyReviewSummary {
  days: WeeklyReviewDay[];
  totalPlannedMinutes: number;
  totalActualMinutes: number;
  totalSessionsCompleted: number;
  totalSessionsPartial: number;
  totalSessionsBlocked: number;
}

function lastNLocalDates(todayLocalDate: ISODate, days: number): ISODate[] {
  const [year, month, day] = todayLocalDate.split('-').map(Number);
  const dates: ISODate[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(toISODate(new Date(year, (month ?? 1) - 1, day - i)));
  }
  return dates;
}

/** The accepted plan with the highest version for a given date, if any. */
function latestAcceptedPlanFor(planVersions: PlanVersion[], date: ISODate): PlanVersion | undefined {
  return planVersions
    .filter((v) => v.date === date && v.status === 'accepted')
    .sort((a, b) => b.version - a.version)[0];
}

/**
 * Purely factual aggregation of the last `days` calendar days: time
 * planned (from each day's accepted plan) against time actually spent (from
 * ended focus sessions), and how many sessions ended in each outcome. No
 * productivity or health claims are derived from these numbers — the UI
 * layer should present them as-is.
 */
export function buildWeeklyReview(
  sessions: FocusSession[],
  planVersions: PlanVersion[],
  todayLocalDate: ISODate,
  days = 7
): WeeklyReviewSummary {
  const dates = lastNLocalDates(todayLocalDate, days);

  const reviewDays: WeeklyReviewDay[] = dates.map((date) => {
    const plan = latestAcceptedPlanFor(planVersions, date);
    const plannedMinutes = plan
      ? plan.blocks.filter((b) => b.kind === 'task').reduce((sum, b) => sum + durationMinutes(b), 0)
      : 0;

    const daySessions = sessions.filter(
      (s) => (s.status === 'completed' || s.status === 'stopped') && toISODate(new Date(s.startedAt)) === date
    );
    const actualMinutes = daySessions.reduce((sum, s) => {
      const endMs = s.endedAt ? new Date(s.endedAt).getTime() : new Date(s.startedAt).getTime();
      return sum + elapsedMs(s, endMs) / 60_000;
    }, 0);

    return {
      date,
      plannedMinutes,
      actualMinutes: Math.round(actualMinutes),
      sessionsCompleted: daySessions.filter((s) => s.outcome === 'completed').length,
    };
  });

  const allEndedInRange = sessions.filter(
    (s) => (s.status === 'completed' || s.status === 'stopped') && dates.includes(toISODate(new Date(s.startedAt)))
  );

  return {
    days: reviewDays,
    totalPlannedMinutes: reviewDays.reduce((sum, d) => sum + d.plannedMinutes, 0),
    totalActualMinutes: reviewDays.reduce((sum, d) => sum + d.actualMinutes, 0),
    totalSessionsCompleted: allEndedInRange.filter((s) => s.outcome === 'completed').length,
    totalSessionsPartial: allEndedInRange.filter((s) => s.outcome === 'partial').length,
    totalSessionsBlocked: allEndedInRange.filter((s) => s.outcome === 'blocked').length,
  };
}
