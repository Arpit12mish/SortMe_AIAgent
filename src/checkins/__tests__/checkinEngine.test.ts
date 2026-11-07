import { deriveEveningSummary, hasCheckedInMorning, hasReviewedEvening, todayLocalDate } from '../checkinEngine';
import type { PlanVersion, Task } from '../../planning/types';
import type { MorningCheckIn } from '../types';

describe('hasCheckedInMorning / hasReviewedEvening — local-date correctness', () => {
  it('matches only a check-in recorded for the same local date', () => {
    const checkIns: MorningCheckIn[] = [
      { id: 'c1', date: '2026-10-07', energyLevel: 'normal', createdAt: '2026-10-07T07:00:00.000Z' },
    ];
    expect(hasCheckedInMorning(checkIns, '2026-10-07')).toBe(true);
    expect(hasCheckedInMorning(checkIns, '2026-10-08')).toBe(false);
  });

  it('does not confuse a check-in made late at night with the next calendar day', () => {
    // A check-in created at 23:50 local time on the 7th must still be
    // keyed to "2026-10-07", not silently roll to the 8th.
    const checkIns: MorningCheckIn[] = [
      { id: 'c1', date: '2026-10-07', energyLevel: 'low', createdAt: '2026-10-07T23:50:00.000Z' },
    ];
    expect(hasCheckedInMorning(checkIns, '2026-10-07')).toBe(true);
    expect(hasCheckedInMorning(checkIns, '2026-10-08')).toBe(false);
  });

  it('evening reviews follow the same local-date matching', () => {
    expect(hasReviewedEvening([{ id: 'r1', date: '2026-10-07', completedTaskIds: [], unfinishedTaskIds: [], deferredTaskIds: [], createdAt: '2026-10-07T21:00:00.000Z' }], '2026-10-07')).toBe(true);
  });
});

describe('todayLocalDate', () => {
  it('formats using local calendar fields, matching toISODate used by the planner', () => {
    // Just before midnight local time must still report that same local day.
    const d = new Date(2026, 9, 7, 23, 59); // months are 0-indexed: October
    expect(todayLocalDate(d)).toBe('2026-10-07');
  });

  it('rolls over correctly at the local midnight boundary', () => {
    const d = new Date(2026, 9, 8, 0, 1);
    expect(todayLocalDate(d)).toBe('2026-10-08');
  });
});

describe('deriveEveningSummary', () => {
  const basePlan: PlanVersion = {
    id: 'p1',
    version: 1,
    date: '2026-10-07',
    status: 'accepted',
    blocks: [
      { id: 'b1', kind: 'task', taskId: 't1', title: 'Task 1', start: '', end: '', flexibility: 'flexible', reason: '' },
      { id: 'b2', kind: 'task', taskId: 't2', title: 'Task 2', start: '', end: '', flexibility: 'flexible', reason: '' },
    ],
    unscheduledTasks: [{ taskId: 't3', title: 'Task 3', reason: 'no room' }],
    atRiskTasks: [],
    changes: [],
    explanations: [],
    createdAt: '2026-10-07T06:00:00.000Z',
  };

  const tasks: Task[] = [
    { id: 't1', title: 'Task 1', estimateMinutes: 30, priority: 'medium', canMove: true, status: 'completed', createdAt: '' },
    { id: 't2', title: 'Task 2', estimateMinutes: 30, priority: 'medium', canMove: true, status: 'scheduled', createdAt: '' },
    { id: 't3', title: 'Task 3', estimateMinutes: 30, priority: 'low', canMove: true, status: 'unscheduled', createdAt: '' },
  ];

  it('buckets scheduled-and-completed, scheduled-but-not-done, and deferred tasks separately', () => {
    const summary = deriveEveningSummary(basePlan, tasks);
    expect(summary.completedTaskIds).toEqual(['t1']);
    expect(summary.unfinishedTaskIds).toEqual(['t2']);
    expect(summary.deferredTaskIds).toEqual(['t3']);
  });

  it('returns empty buckets when there is no plan yet', () => {
    expect(deriveEveningSummary(null, tasks)).toEqual({
      completedTaskIds: [],
      unfinishedTaskIds: [],
      deferredTaskIds: [],
    });
  });
});
