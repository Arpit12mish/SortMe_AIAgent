import { buildWeeklyReview } from '../weeklyReview';
import type { PlanVersion } from '../../planning/types';
import type { FocusSession } from '../types';

function plan(date: string, plannedTaskMinutes: number, version = 1): PlanVersion {
  const start = new Date(`${date}T09:00:00.000Z`);
  const end = new Date(start.getTime() + plannedTaskMinutes * 60_000);
  return {
    id: `plan-${date}-${version}`,
    version,
    date,
    status: 'accepted',
    blocks: [
      { id: 'b1', kind: 'task', taskId: 't1', title: 'Task', start: start.toISOString(), end: end.toISOString(), flexibility: 'flexible', reason: '' },
    ],
    unscheduledTasks: [],
    atRiskTasks: [],
    changes: [],
    explanations: [],
    createdAt: `${date}T06:00:00.000Z`,
  };
}

function session(startedAt: string, minutes: number, outcome: FocusSession['outcome']): FocusSession {
  const endedAt = new Date(new Date(startedAt).getTime() + minutes * 60_000).toISOString();
  return {
    id: `s-${startedAt}`,
    taskId: 't1',
    taskTitle: 'Task',
    estimateMinutes: minutes,
    status: 'completed',
    startedAt,
    pauseIntervals: [],
    endedAt,
    outcome,
    createdAt: startedAt,
  };
}

describe('buildWeeklyReview', () => {
  it('sums planned minutes from each day\'s accepted plan and actual minutes from ended sessions', () => {
    const today = '2026-10-07';
    const plans = [plan('2026-10-07', 60)];
    const sessions = [session('2026-10-07T09:00:00.000Z', 45, 'completed')];

    const review = buildWeeklyReview(sessions, plans, today, 7);
    const todayEntry = review.days.find((d) => d.date === today)!;
    expect(todayEntry.plannedMinutes).toBe(60);
    expect(todayEntry.actualMinutes).toBe(45);
    expect(review.totalSessionsCompleted).toBe(1);
  });

  it('picks the latest accepted version for a date, ignoring older accepted versions', () => {
    const plans = [plan('2026-10-07', 60, 1), plan('2026-10-07', 90, 2)];
    const review = buildWeeklyReview([], plans, '2026-10-07', 1);
    expect(review.days[0].plannedMinutes).toBe(90);
  });

  it('excludes sessions and plans outside the requested day window', () => {
    const plans = [plan('2026-09-01', 60)]; // far outside a 7-day window ending 2026-10-07
    const sessions = [session('2026-09-01T09:00:00.000Z', 30, 'completed')];
    const review = buildWeeklyReview(sessions, plans, '2026-10-07', 7);
    expect(review.totalPlannedMinutes).toBe(0);
    expect(review.totalActualMinutes).toBe(0);
  });

  it('separately counts completed, partial, and blocked session outcomes', () => {
    const sessions = [
      session('2026-10-07T09:00:00.000Z', 30, 'completed'),
      session('2026-10-06T09:00:00.000Z', 20, 'partial'),
      session('2026-10-05T09:00:00.000Z', 10, 'blocked'),
    ];
    const review = buildWeeklyReview(sessions, [], '2026-10-07', 7);
    expect(review.totalSessionsCompleted).toBe(1);
    expect(review.totalSessionsPartial).toBe(1);
    expect(review.totalSessionsBlocked).toBe(1);
  });

  it('ignores sessions still in progress (no endedAt / not completed or stopped)', () => {
    const running: FocusSession = {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Task',
      estimateMinutes: 30,
      status: 'running',
      startedAt: '2026-10-07T09:00:00.000Z',
      pauseIntervals: [],
      createdAt: '2026-10-07T09:00:00.000Z',
    };
    const review = buildWeeklyReview([running], [], '2026-10-07', 7);
    expect(review.totalActualMinutes).toBe(0);
  });
});
