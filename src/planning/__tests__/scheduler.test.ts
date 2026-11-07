import { createSamplePreferences, createSampleTasks } from '../../data/sampleData';
import { dayWindowFor, fixedBlocksFor, generatePlan, protectedTimeBlocksFor, travelBlocksFor } from '../scheduler';
import type { FixedCommitment, Preferences, ProtectedTimeBlock, Task } from '../types';
import { assertNoOverlaps, localTime, makeIdGen } from '../testUtils';

// A Wednesday, so the sample "Algorithms lecture" (Mon-Fri) applies.
const PLAN_DATE = '2026-10-07';

describe('generatePlan', () => {
  it('schedules fixed commitments, meals, and tasks without any overlap', () => {
    const preferences = createSamplePreferences();
    const tasks = createSampleTasks(new Date('2026-10-07T06:00:00'));

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks,
      version: 1,
      idGen: makeIdGen('block'),
      nowIso: new Date('2026-10-07T06:00:00').toISOString(),
    });

    assertNoOverlaps(plan.blocks);

    const lecture = plan.blocks.find((b) => b.title === 'Algorithms lecture');
    expect(lecture?.flexibility).toBe('fixed');
    expect(localTime(lecture!.start)).toBe('09:00');
    expect(localTime(lecture!.end)).toBe('10:30');

    const dinner = plan.blocks.find((b) => b.title === 'Dinner');
    expect(dinner?.flexibility).toBe('protected');
    expect(localTime(dinner!.start)).toBe('20:00');

    // All three sample tasks should fit comfortably in an ordinary day.
    expect(plan.unscheduledTasks).toHaveLength(0);
    expect(plan.atRiskTasks).toHaveLength(0);
    for (const task of tasks) {
      expect(plan.blocks.some((b) => b.taskId === task.id)).toBe(true);
    }

    // Soft preference: tasks should land inside the 18:00-22:00 focus window
    // when there's room, ahead of dinner, matching the blueprint's example.
    const interviewBlock = plan.blocks.find((b) => b.taskId === 'task-interview-prep');
    expect(localTime(interviewBlock!.start)).toBe('18:00');
  });

  it('never schedules anything outside the wake/sleep window', () => {
    const preferences = createSamplePreferences();
    const tasks = createSampleTasks(new Date('2026-10-07T06:00:00'));

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks,
      version: 1,
      idGen: makeIdGen('block'),
    });

    const wake = new Date(`${PLAN_DATE}T07:00:00`).getTime();
    const sleep = new Date(`${PLAN_DATE}T23:00:00`).getTime();
    for (const block of plan.blocks) {
      expect(new Date(block.start).getTime()).toBeGreaterThanOrEqual(wake);
      expect(new Date(block.end).getTime()).toBeLessThanOrEqual(sleep);
    }
  });

  it('reports a scheduling conflict instead of silently dropping urgent work', () => {
    const preferences = createSamplePreferences();
    // Pack the day with far more urgent, deadline-bound work than can fit.
    const overloadedTasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
      id: `overload-${i}`,
      title: `Urgent task ${i}`,
      estimateMinutes: 90,
      priority: 'urgent',
      canMove: true,
      status: 'unscheduled',
      createdAt: new Date(`2026-10-07T06:0${i}:00`).toISOString(),
      deadline: new Date(`${PLAN_DATE}T22:00:00`).toISOString(),
    }));

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks: overloadedTasks,
      version: 1,
      idGen: makeIdGen('block'),
    });

    assertNoOverlaps(plan.blocks);

    // Every task is accounted for: either scheduled or explicitly flagged.
    const scheduledIds = new Set(plan.blocks.filter((b) => b.taskId).map((b) => b.taskId));
    const flaggedIds = new Set([...plan.atRiskTasks, ...plan.unscheduledTasks].map((t) => t.taskId));
    for (const task of overloadedTasks) {
      expect(scheduledIds.has(task.id) || flaggedIds.has(task.id)).toBe(true);
    }

    expect(plan.atRiskTasks.length).toBeGreaterThan(0);
    expect(plan.explanations.some((e) => e.includes('could not be scheduled'))).toBe(true);
  });

  it('keeps a non-movable task fixed in place for future planning', () => {
    const preferences = createSamplePreferences();
    const tasks: Task[] = [
      {
        id: 'pinned-task',
        title: 'Pinned call with mentor',
        estimateMinutes: 30,
        priority: 'medium',
        canMove: false,
        status: 'unscheduled',
        createdAt: '2026-10-07T06:00:00.000Z',
      },
    ];

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks,
      version: 1,
      idGen: makeIdGen('block'),
    });

    const block = plan.blocks.find((b) => b.taskId === 'pinned-task');
    expect(block?.flexibility).toBe('fixed');
  });
});

function makeCommitment(overrides: Partial<FixedCommitment> = {}): FixedCommitment {
  return {
    id: 'fixed-internship',
    title: 'Internship',
    start: '09:00',
    end: '17:00',
    daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
    ...overrides,
  };
}

describe('fixedBlocksFor — recurring commitment date range', () => {
  // PLAN_DATE (2026-10-07) is a Wednesday.
  it('does not schedule a commitment before its start date', () => {
    const preferences: Preferences = { ...createSamplePreferences(), fixedCommitments: [makeCommitment({ startDate: '2026-10-10' })] };
    expect(fixedBlocksFor(PLAN_DATE, preferences, makeIdGen('b'))).toHaveLength(0);
  });

  it('schedules a commitment on and after its start date', () => {
    const preferences: Preferences = { ...createSamplePreferences(), fixedCommitments: [makeCommitment({ startDate: '2026-10-07' })] };
    expect(fixedBlocksFor(PLAN_DATE, preferences, makeIdGen('b'))).toHaveLength(1);
  });

  it('does not schedule a commitment after its end date', () => {
    const preferences: Preferences = { ...createSamplePreferences(), fixedCommitments: [makeCommitment({ endDate: '2026-10-01' })] };
    expect(fixedBlocksFor(PLAN_DATE, preferences, makeIdGen('b'))).toHaveLength(0);
  });

  it('schedules a commitment within its date range', () => {
    const preferences: Preferences = {
      ...createSamplePreferences(),
      fixedCommitments: [makeCommitment({ startDate: '2026-10-01', endDate: '2026-10-31' })],
    };
    const blocks = fixedBlocksFor(PLAN_DATE, preferences, makeIdGen('b'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceId).toBe('fixed-internship');
  });

  it('still requires a matching weekday even within the date range', () => {
    const preferences: Preferences = {
      ...createSamplePreferences(),
      fixedCommitments: [makeCommitment({ daysOfWeek: [1], startDate: '2026-10-01', endDate: '2026-10-31' })], // Monday only
    };
    expect(fixedBlocksFor(PLAN_DATE, preferences, makeIdGen('b'))).toHaveLength(0);
  });
});

describe('protectedTimeBlocksFor', () => {
  function makeProtected(overrides: Partial<ProtectedTimeBlock> = {}): ProtectedTimeBlock {
    return { id: 'protected-gym', title: 'Gym', start: '06:00', end: '07:00', daysOfWeek: [1, 3, 5], ...overrides };
  }

  it('produces a protected, kind:protected block on a matching day', () => {
    const preferences: Preferences = { ...createSamplePreferences(), protectedTimeBlocks: [makeProtected()] };
    const blocks = protectedTimeBlocksFor(PLAN_DATE, preferences, makeIdGen('b')); // Wednesday
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('protected');
    expect(blocks[0].flexibility).toBe('protected');
    expect(blocks[0].sourceId).toBe('protected-gym');
    expect(localTime(blocks[0].start)).toBe('06:00');
  });

  it('produces nothing on a non-matching day', () => {
    const preferences: Preferences = { ...createSamplePreferences(), protectedTimeBlocks: [makeProtected({ daysOfWeek: [2, 4] })] };
    expect(protectedTimeBlocksFor(PLAN_DATE, preferences, makeIdGen('b'))).toHaveLength(0); // Wednesday not in [2,4]
  });
});

describe('travelBlocksFor', () => {
  it('generates travel-to and travel-from blocks around a located commitment', () => {
    const preferences: Preferences = {
      ...createSamplePreferences(),
      travelTimeMinutes: 20,
      fixedCommitments: [makeCommitment({ location: 'Downtown office' })],
    };
    const blocks = travelBlocksFor(PLAN_DATE, preferences, makeIdGen('b'));
    expect(blocks).toHaveLength(2);
    const to = blocks.find((b) => b.title.startsWith('Travel to'))!;
    const from = blocks.find((b) => b.title.startsWith('Travel from'))!;
    expect(localTime(to.end)).toBe('09:00'); // ends right as the commitment starts
    expect(localTime(from.start)).toBe('17:00'); // starts right as the commitment ends
    expect(to.flexibility).toBe('fixed');
  });

  it('generates nothing when the commitment has no location', () => {
    const preferences: Preferences = { ...createSamplePreferences(), travelTimeMinutes: 20, fixedCommitments: [makeCommitment()] };
    expect(travelBlocksFor(PLAN_DATE, preferences, makeIdGen('b'))).toHaveLength(0);
  });

  it('generates nothing when the travel time buffer is unset', () => {
    const preferences: Preferences = {
      ...createSamplePreferences(),
      fixedCommitments: [makeCommitment({ location: 'Downtown office' })],
    };
    expect(travelBlocksFor(PLAN_DATE, preferences, makeIdGen('b'))).toHaveLength(0);
  });

  it('clips travel time to the day window instead of extending before wake time', () => {
    const preferences: Preferences = {
      ...createSamplePreferences(),
      travelTimeMinutes: 120, // 2 hours — more than fits before a 07:00 wake time for a 08:00 commitment
      fixedCommitments: [makeCommitment({ start: '08:00', end: '09:00', location: 'Downtown office' })],
    };
    const blocks = travelBlocksFor(PLAN_DATE, preferences, makeIdGen('b'));
    const to = blocks.find((b) => b.title.startsWith('Travel to'))!;
    expect(localTime(to.start)).toBe('07:00'); // clamped to wake time, not 06:00
  });
});

describe('dayWindowFor — overnight sleep boundary', () => {
  it('rolls the day window end onto the next calendar day when sleep time is numerically before wake time', () => {
    const preferences: Preferences = {
      ...createSamplePreferences(),
      sleepWindow: { wakeTime: '07:00', sleepTime: '01:00' },
    };
    const window = dayWindowFor(PLAN_DATE, preferences);
    expect(localTime(window.start)).toBe('07:00');
    expect(localTime(window.end)).toBe('01:00');
    // The end must actually land on the next calendar day, not the same one.
    const startDate = new Date(window.start);
    const endDate = new Date(window.end);
    expect(endDate.getDate()).toBe(startDate.getDate() + 1);
  });

  it('keeps the ordinary same-day window when sleep time is after wake time', () => {
    const preferences = createSamplePreferences(); // wake 07:00, sleep 23:00
    const window = dayWindowFor(PLAN_DATE, preferences);
    const startDate = new Date(window.start);
    const endDate = new Date(window.end);
    expect(endDate.getDate()).toBe(startDate.getDate());
  });

  it('generating consecutive overnight-window days does not bleed a late block into the next date', () => {
    const preferences: Preferences = {
      ...createSamplePreferences(),
      sleepWindow: { wakeTime: '07:00', sleepTime: '01:00' },
    };
    const dayOne = dayWindowFor('2026-10-07', preferences);
    const dayTwo = dayWindowFor('2026-10-08', preferences);
    // Day one's window runs into the small hours of Oct 8, but day two's own
    // window must still start fresh at Oct 8 07:00 — not right after day one ends.
    expect(new Date(dayTwo.start).getTime()).toBeGreaterThan(new Date(dayOne.end).getTime());
    expect(localTime(dayTwo.start)).toBe('07:00');
  });
});

describe('generatePlan — future-dated commitment appears only on/after its start date', () => {
  // A recurring Mon-Fri "Internship" starting 2026-10-05 (a Monday); 2026-09-30 (Wed) is
  // before it, 2026-10-05 itself and 2026-10-06 (Tue) are on/after it.
  const internship = makeCommitment({
    id: 'fixed-internship',
    title: 'Internship',
    start: '09:00',
    end: '17:00',
    daysOfWeek: [1, 2, 3, 4, 5],
    startDate: '2026-10-05',
  });

  it('is absent from a plan generated before the start date', () => {
    const preferences: Preferences = { ...createSamplePreferences(), fixedCommitments: [internship] };
    const plan = generatePlan({
      date: '2026-09-30',
      preferences,
      tasks: [],
      version: 1,
      idGen: makeIdGen('block'),
    });
    expect(plan.blocks.some((b) => b.title === 'Internship')).toBe(false);
  });

  it('is present on the start date itself', () => {
    const preferences: Preferences = { ...createSamplePreferences(), fixedCommitments: [internship] };
    const plan = generatePlan({
      date: '2026-10-05',
      preferences,
      tasks: [],
      version: 1,
      idGen: makeIdGen('block'),
    });
    const block = plan.blocks.find((b) => b.title === 'Internship');
    expect(block).toBeDefined();
    expect(block?.flexibility).toBe('fixed');
  });

  it('is present on later matching weekdays after the start date', () => {
    const preferences: Preferences = { ...createSamplePreferences(), fixedCommitments: [internship] };
    const plan = generatePlan({
      date: '2026-10-06',
      preferences,
      tasks: [],
      version: 1,
      idGen: makeIdGen('block'),
    });
    expect(plan.blocks.some((b) => b.title === 'Internship')).toBe(true);
  });
});

describe('generatePlan — excludeTaskIds (cross-day task allocation)', () => {
  it('leaves an excluded task out of blocks, unscheduled, and at-risk entirely', () => {
    const preferences = createSamplePreferences();
    const claimedElsewhere: Task = {
      id: 'task-claimed',
      title: 'Claimed by another date',
      estimateMinutes: 60,
      priority: 'medium',
      canMove: true,
      status: 'unscheduled',
      createdAt: '2026-10-07T06:00:00.000Z',
    };

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks: [claimedElsewhere],
      version: 1,
      idGen: makeIdGen('block'),
      excludeTaskIds: new Set(['task-claimed']),
    });

    expect(plan.blocks.some((b) => b.taskId === 'task-claimed')).toBe(false);
    expect(plan.unscheduledTasks.some((t) => t.taskId === 'task-claimed')).toBe(false);
    expect(plan.atRiskTasks.some((t) => t.taskId === 'task-claimed')).toBe(false);
  });
});

describe('generatePlan — rolloverFrom (unfinished-task rollover)', () => {
  it('when a rolled-over task still does not fit, its unscheduled/at-risk reason says so and keeps the reduced remaining estimate', () => {
    const preferences = createSamplePreferences();
    const tooBigToFit: Task = {
      id: 'task-rollover',
      title: 'Big leftover task',
      estimateMinutes: 1000, // nothing close to fitting in a normal day
      priority: 'urgent', // guarantees at-risk rather than merely unscheduled
      canMove: true,
      status: 'scheduled',
      createdAt: '2026-10-06T06:00:00.000Z',
    };

    const plan = generatePlan({
      date: PLAN_DATE,
      preferences,
      tasks: [tooBigToFit],
      version: 1,
      idGen: makeIdGen('block'),
      excludeTaskIds: new Set(),
      rolloverFrom: new Map([['task-rollover', { remainingMinutes: 900, fromDate: '2026-10-06' }]]),
    });

    expect(plan.blocks.some((b) => b.taskId === 'task-rollover')).toBe(false);
    const ref = plan.atRiskTasks.find((t) => t.taskId === 'task-rollover');
    expect(ref).toBeDefined();
    expect(ref?.reason).toContain('Carried over from 2026-10-06');
    expect(ref?.reason).toContain('900 of 1000 min remaining');
    expect(ref?.reason).toContain('Still needs 900 min');
  });
});
