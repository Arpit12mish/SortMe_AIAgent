import { toISODate } from '../../planning/time';
import { localISO } from '../../planning/testUtils';
import {
  completionRateForPeriod,
  computeStreaks,
  deriveHabitDayStatus,
  habitsScheduledForDate,
  monthGridDates,
} from '../habitEngine';
import type { HabitCheckIn, HabitDefinition } from '../types';

function makeHabit(overrides: Partial<HabitDefinition> = {}): HabitDefinition {
  return {
    id: 'h1',
    name: 'Drink water',
    scheduledDays: [1, 3, 5], // Mon/Wed/Fri
    startDate: '2026-10-01',
    order: 0,
    archived: false,
    createdAt: localISO('2026-10-01T08:00:00'),
    ...overrides,
  };
}

function makeCheckIn(habitId: string, date: string, status: HabitCheckIn['status']): HabitCheckIn {
  return {
    id: `habit-${habitId}-${date}`,
    habitId,
    date,
    status,
    createdAt: localISO(`${date}T09:00:00`),
    updatedAt: localISO(`${date}T09:00:00`),
  };
}

describe('deriveHabitDayStatus — missed vs. untracked', () => {
  it('is untracked before the habit start date, regardless of day-of-week', () => {
    // 2026-09-28 is a Monday (scheduled), but before startDate 2026-10-01.
    const habit = makeHabit({ startDate: '2026-10-01' });
    expect(deriveHabitDayStatus(habit, [], '2026-09-28', '2026-10-10')).toBe('untracked');
  });

  it('is missed for a past scheduled day with no check-in', () => {
    const habit = makeHabit(); // Mon/Wed/Fri
    // 2026-10-05 is a Monday, scheduled, strictly before "today".
    expect(deriveHabitDayStatus(habit, [], '2026-10-05', '2026-10-10')).toBe('missed');
  });

  it('is untracked for a past unscheduled (rest) day with no check-in, never missed', () => {
    const habit = makeHabit(); // Mon/Wed/Fri
    // 2026-10-06 is a Tuesday — not scheduled.
    expect(deriveHabitDayStatus(habit, [], '2026-10-06', '2026-10-10')).toBe('untracked');
  });

  it('is untracked for today even when scheduled and unchecked', () => {
    const habit = makeHabit();
    // 2026-10-05 is a Monday, scheduled, and IS "today".
    expect(deriveHabitDayStatus(habit, [], '2026-10-05', '2026-10-05')).toBe('untracked');
  });

  it('is untracked for a future scheduled day, never missed', () => {
    const habit = makeHabit();
    // 2026-10-12 is a Monday, scheduled, in the future relative to "today".
    expect(deriveHabitDayStatus(habit, [], '2026-10-12', '2026-10-05')).toBe('untracked');
  });

  it('an explicit check-in wins even on an unscheduled day', () => {
    const habit = makeHabit();
    const checkIns = [makeCheckIn(habit.id, '2026-10-06', 'completed')]; // Tuesday, a rest day
    expect(deriveHabitDayStatus(habit, checkIns, '2026-10-06', '2026-10-10')).toBe('completed');
  });
});

describe('deriveHabitDayStatus — local timezone boundary', () => {
  it('does not mark yesterday missed just before local midnight', () => {
    const habit = makeHabit({ startDate: '2026-10-01' });
    const today = toISODate(new Date(2026, 9, 7, 23, 59)); // still 2026-10-07 locally
    expect(today).toBe('2026-10-07');
    // 2026-10-07 is a Wednesday (scheduled) and IS today, so it stays untracked.
    expect(deriveHabitDayStatus(habit, [], '2026-10-07', today)).toBe('untracked');
  });

  it('marks yesterday missed just after local midnight rolls over', () => {
    const habit = makeHabit({ startDate: '2026-10-01' });
    const today = toISODate(new Date(2026, 9, 8, 0, 1)); // now 2026-10-08 locally
    expect(today).toBe('2026-10-08');
    // 2026-10-07 (Wednesday, scheduled) is now strictly in the past.
    expect(deriveHabitDayStatus(habit, [], '2026-10-07', today)).toBe('missed');
  });
});

describe('rest days do not break a streak', () => {
  it('a completed day either side of an unscheduled rest day stays one unbroken streak', () => {
    const habit = makeHabit({ scheduledDays: [1, 2, 4] }); // Mon, Tue, Thu — Wed is a rest day
    const checkIns = [
      makeCheckIn(habit.id, '2026-10-05', 'completed'), // Mon
      makeCheckIn(habit.id, '2026-10-06', 'completed'), // Tue
      // 2026-10-07 Wed: unscheduled rest day, no check-in
      makeCheckIn(habit.id, '2026-10-08', 'completed'), // Thu
    ];
    const { current } = computeStreaks(habit, checkIns, '2026-10-08');
    expect(current).toBe(3);
  });
});

describe('computeStreaks', () => {
  it('an unbroken run makes current equal to longest', () => {
    const habit = makeHabit();
    const checkIns = [
      makeCheckIn(habit.id, '2026-10-05', 'completed'),
      makeCheckIn(habit.id, '2026-10-07', 'completed'),
      makeCheckIn(habit.id, '2026-10-09', 'completed'),
    ];
    const { current, longest } = computeStreaks(habit, checkIns, '2026-10-09');
    expect(current).toBe(3);
    expect(longest).toBe(3);
  });

  it('a missed day resets current but longest retains the earlier max', () => {
    const habit = makeHabit();
    const checkIns = [
      makeCheckIn(habit.id, '2026-10-05', 'completed'),
      makeCheckIn(habit.id, '2026-10-07', 'completed'),
      makeCheckIn(habit.id, '2026-10-09', 'completed'),
      // 2026-10-12 (Mon) is scheduled and left unchecked -> missed, breaking the streak
      makeCheckIn(habit.id, '2026-10-14', 'completed'),
    ];
    const { current, longest } = computeStreaks(habit, checkIns, '2026-10-14');
    expect(current).toBe(1);
    expect(longest).toBe(3);
  });

  it('partial extends a streak the same as completed', () => {
    const habit = makeHabit();
    const checkIns = [
      makeCheckIn(habit.id, '2026-10-05', 'partial'),
      makeCheckIn(habit.id, '2026-10-07', 'completed'),
      makeCheckIn(habit.id, '2026-10-09', 'partial'),
    ];
    const { current } = computeStreaks(habit, checkIns, '2026-10-09');
    expect(current).toBe(3);
  });

  it('a pending (untracked) today does not zero an in-progress streak', () => {
    const habit = makeHabit();
    const checkIns = [
      makeCheckIn(habit.id, '2026-10-05', 'completed'),
      makeCheckIn(habit.id, '2026-10-07', 'completed'),
      // 2026-10-09 (Fri, scheduled) is "today" and has no check-in yet
    ];
    const { current } = computeStreaks(habit, checkIns, '2026-10-09');
    expect(current).toBe(2);
  });

  it('days after archiving neither extend nor break the streak', () => {
    const habit = makeHabit({ archived: true, archivedAt: localISO('2026-10-07T12:00:00') });
    const checkIns = [
      makeCheckIn(habit.id, '2026-10-05', 'completed'),
      makeCheckIn(habit.id, '2026-10-07', 'completed'),
      // 2026-10-09, 2026-10-12 etc. are all after archiving and unscheduled per isScheduledOn
    ];
    const { current } = computeStreaks(habit, checkIns, '2026-10-14');
    expect(current).toBe(2);
  });
});

describe('editing a past entry recalculates streaks', () => {
  it('correcting a missed day to completed increases the current streak', () => {
    const habit = makeHabit();
    const before: HabitCheckIn[] = [
      makeCheckIn(habit.id, '2026-10-09', 'completed'),
      // 2026-10-07 (Wed, scheduled) left unchecked -> missed, breaking the streak
    ];
    expect(computeStreaks(habit, before, '2026-10-09').current).toBe(1);

    // Same upsert path saveCheckIn/correctCheckIn use: same deterministic id, new status.
    const corrected = [...before, makeCheckIn(habit.id, '2026-10-07', 'completed')];
    expect(computeStreaks(habit, corrected, '2026-10-09').current).toBe(2);
  });
});

describe('completionRateForPeriod', () => {
  it('computes a mixed week correctly, excluding rest days from the denominator', () => {
    const habit = makeHabit(); // Mon/Wed/Fri
    const checkIns = [
      makeCheckIn(habit.id, '2026-10-05', 'completed'), // Mon
      makeCheckIn(habit.id, '2026-10-07', 'partial'), // Wed
      // 2026-10-09 (Fri) left unchecked -> missed
    ];
    const stats = completionRateForPeriod(habit, checkIns, '2026-10-05', '2026-10-09', '2026-10-10');
    expect(stats.scheduledDays).toBe(3);
    expect(stats.completedDays).toBe(1);
    expect(stats.partialDays).toBe(1);
    expect(stats.missedDays).toBe(1);
    expect(stats.completionRate).toBeCloseTo(2 / 3);
  });

  it('excludes days beyond today from the denominator', () => {
    const habit = makeHabit();
    const stats = completionRateForPeriod(habit, [], '2026-10-05', '2026-10-30', '2026-10-09');
    // Only Mon 10-05, Wed 10-07, Fri 10-09 fall within the clamped range.
    expect(stats.scheduledDays).toBe(3);
  });

  it('returns a zero rate with no scheduled days, without dividing by zero', () => {
    const habit = makeHabit({ scheduledDays: [] });
    const stats = completionRateForPeriod(habit, [], '2026-10-05', '2026-10-09', '2026-10-09');
    expect(stats.scheduledDays).toBe(0);
    expect(stats.completionRate).toBe(0);
  });
});

describe('monthGridDates', () => {
  it('always returns 42 cells with correct inMonth flags on leading/trailing days', () => {
    // October 2026: 1st is a Thursday.
    const cells = monthGridDates(2026, 10);
    expect(cells).toHaveLength(42);
    expect(cells[0].date).toBe('2026-09-27'); // Sunday on/before the 1st
    expect(cells[0].inMonth).toBe(false);
    const first = cells.find((c) => c.date === '2026-10-01');
    expect(first?.inMonth).toBe(true);
    // Every cell's inMonth flag must agree with whether its date actually falls in October 2026.
    for (const cell of cells) {
      expect(cell.inMonth).toBe(cell.date.startsWith('2026-10'));
    }
  });
});

describe('habitsScheduledForDate', () => {
  it('excludes an archived habit even on a matching day-of-week', () => {
    const habit = makeHabit({ archived: true, archivedAt: localISO('2026-10-01T00:00:00') });
    expect(habitsScheduledForDate([habit], '2026-10-05')).toEqual([]);
  });

  it('includes an active habit scheduled on that day', () => {
    const habit = makeHabit();
    expect(habitsScheduledForDate([habit], '2026-10-05')).toEqual([habit]); // Monday
    expect(habitsScheduledForDate([habit], '2026-10-06')).toEqual([]); // Tuesday, rest day
  });
});
