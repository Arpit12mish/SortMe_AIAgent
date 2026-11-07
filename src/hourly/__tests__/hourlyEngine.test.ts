import { createSamplePreferences } from '../../data/sampleData';
import type { FocusSession } from '../../focus/types';
import { localISO, localTime } from '../../planning/testUtils';
import type { PlanBlock, PlanVersion, Preferences } from '../../planning/types';
import { DEFAULT_HOURLY_SETTINGS } from '../types';
import type { HourlyEntry } from '../types';
import {
  actualFocusMinutesForHour,
  buildHourlyGrid,
  choiceSuggestsReplan,
  describeHourlyReplanTrigger,
  groupHourlyGrid,
  hourlyEntryId,
  isHourEligibleForCheckIn,
  isTimeOfDayWithinWindow,
  statusForHour,
  statusLabel,
  unansweredPastHours,
} from '../hourlyEngine';

const DATE = '2026-10-07';

function makePlan(blocks: PlanBlock[]): PlanVersion {
  return {
    id: 'p1',
    version: 1,
    date: DATE,
    status: 'accepted',
    blocks,
    unscheduledTasks: [],
    atRiskTasks: [],
    changes: [],
    explanations: [],
    createdAt: localISO(`${DATE}T06:00:00`),
  };
}

function makeBlock(overrides: Partial<PlanBlock>): PlanBlock {
  return {
    id: 'b1',
    kind: 'task',
    title: 'Write report',
    start: localISO(`${DATE}T10:00:00`),
    end: localISO(`${DATE}T11:00:00`),
    flexibility: 'flexible',
    reason: '',
    ...overrides,
  };
}

describe('buildHourlyGrid', () => {
  it('returns 24 hour slots, one per local hour of the date', () => {
    const preferences = createSamplePreferences(); // wake 07:00, sleep 23:00
    const slots = buildHourlyGrid(DATE, null, preferences);
    expect(slots).toHaveLength(24);
    expect(slots.map((s) => s.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('marks hours outside the wake/sleep window as sleep, and inside with no block as free', () => {
    const preferences = createSamplePreferences();
    const slots = buildHourlyGrid(DATE, null, preferences);
    expect(slots[3].kind).toBe('sleep'); // 03:00, well before 07:00 wake
    expect(slots[12].kind).toBe('free'); // 12:00, awake, no plan at all
    expect(slots[22].kind).toBe('free'); // 22:00, still before 23:00 sleep
    expect(slots[23].kind).toBe('sleep'); // 23:00-24:00, after sleep time
  });

  it('handles a sleep window that crosses midnight without any special-casing', () => {
    // Sleeps at 01:00, wakes at 09:00 — the awake window spans into the next day.
    const preferences: Preferences = { ...createSamplePreferences(), sleepWindow: { sleepTime: '01:00', wakeTime: '09:00' } };
    const slots = buildHourlyGrid(DATE, null, preferences);
    expect(slots[0].kind).toBe('sleep'); // 00:00-01:00 belongs to the previous night's sleep
    expect(slots[23].kind).toBe('free'); // 23:00-24:00 is still awake (sleeps at 01:00 the next day)
    expect(slots[9].kind).toBe('free'); // just woke up
  });

  it('maps a multi-hour task block across every hour it overlaps, as the same block — never duplicated', () => {
    const preferences = createSamplePreferences();
    const block = makeBlock({ start: localISO(`${DATE}T10:00:00`), end: localISO(`${DATE}T12:30:00`) });
    const plan = makePlan([block]);
    const slots = buildHourlyGrid(DATE, plan, preferences);

    expect(slots[10].kind).toBe('blocks');
    expect(slots[11].kind).toBe('blocks');
    expect(slots[12].kind).toBe('blocks');
    expect(slots[13].kind).toBe('free');
    // The exact same PlanBlock object/id appears in each overlapping hour.
    expect(slots[10].blocks[0].id).toBe(block.id);
    expect(slots[11].blocks[0].id).toBe(block.id);
    expect(slots[12].blocks[0].id).toBe(block.id);
  });
});

describe('groupHourlyGrid', () => {
  it('merges contiguous hours showing the exact same thing into one row', () => {
    const preferences = createSamplePreferences();
    const block = makeBlock({ start: localISO(`${DATE}T10:00:00`), end: localISO(`${DATE}T12:30:00`) });
    const plan = makePlan([block]);
    const slots = buildHourlyGrid(DATE, plan, preferences);
    const rows = groupHourlyGrid(slots);

    const taskRow = rows.find((r) => r.kind === 'blocks');
    expect(taskRow?.startHour).toBe(10);
    expect(taskRow?.endHour).toBe(13); // covers hours 10, 11, 12

    // A long sleep stretch collapses to one row too.
    const sleepRow = rows.find((r) => r.kind === 'sleep' && r.startHour === 0);
    expect(sleepRow?.endHour).toBe(7); // 00:00 through 07:00 wake
  });

  it('does not merge two different blocks even if adjacent', () => {
    const preferences = createSamplePreferences();
    const a = makeBlock({ id: 'a', start: localISO(`${DATE}T10:00:00`), end: localISO(`${DATE}T11:00:00`) });
    const b = makeBlock({ id: 'b', title: 'Study', start: localISO(`${DATE}T11:00:00`), end: localISO(`${DATE}T12:00:00`) });
    const slots = buildHourlyGrid(DATE, makePlan([a, b]), preferences);
    const rows = groupHourlyGrid(slots);
    const blockRows = rows.filter((r) => r.kind === 'blocks');
    expect(blockRows).toHaveLength(2);
  });
});

describe('isTimeOfDayWithinWindow', () => {
  it('handles a normal same-day window', () => {
    expect(isTimeOfDayWithinWindow('10:00', '08:00', '20:00')).toBe(true);
    expect(isTimeOfDayWithinWindow('07:00', '08:00', '20:00')).toBe(false);
    expect(isTimeOfDayWithinWindow('21:00', '08:00', '20:00')).toBe(false);
  });

  it('handles a window that wraps past midnight', () => {
    expect(isTimeOfDayWithinWindow('23:30', '22:00', '02:00')).toBe(true);
    expect(isTimeOfDayWithinWindow('01:00', '22:00', '02:00')).toBe(true);
    expect(isTimeOfDayWithinWindow('12:00', '22:00', '02:00')).toBe(false);
  });
});

describe('isHourEligibleForCheckIn', () => {
  const preferences = createSamplePreferences();

  it('is never eligible when settings are disabled', () => {
    const slots = buildHourlyGrid(DATE, null, preferences);
    expect(isHourEligibleForCheckIn(slots[12], DEFAULT_HOURLY_SETTINGS, preferences)).toBe(false);
  });

  it('never prompts during sleep, even if the configured window would otherwise include it', () => {
    const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true, windowStart: '00:00', windowEnd: '23:59' };
    const slots = buildHourlyGrid(DATE, null, preferences);
    expect(slots[3].kind).toBe('sleep');
    expect(isHourEligibleForCheckIn(slots[3], settings, preferences)).toBe(false);
  });

  it('is eligible for a free hour inside the default (wake/sleep) window once enabled', () => {
    const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true };
    const slots = buildHourlyGrid(DATE, null, preferences);
    expect(isHourEligibleForCheckIn(slots[12], settings, preferences)).toBe(true);
  });

  it('respects promptDuringFixed / promptDuringProtected', () => {
    const fixedBlock = makeBlock({ kind: 'fixed', start: localISO(`${DATE}T09:00:00`), end: localISO(`${DATE}T10:00:00`) });
    const slots = buildHourlyGrid(DATE, makePlan([fixedBlock]), preferences);
    const settingsDefault = { ...DEFAULT_HOURLY_SETTINGS, enabled: true };
    const settingsAllowFixed = { ...settingsDefault, promptDuringFixed: true };
    expect(isHourEligibleForCheckIn(slots[9], settingsDefault, preferences)).toBe(false);
    expect(isHourEligibleForCheckIn(slots[9], settingsAllowFixed, preferences)).toBe(true);
  });
});

describe('statusForHour', () => {
  const preferences = createSamplePreferences();
  const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true };

  function entry(overrides: Partial<HourlyEntry>): HourlyEntry {
    return {
      id: hourlyEntryId(DATE, 9),
      date: DATE,
      hour: 9,
      createdAt: localISO(`${DATE}T09:05:00`),
      updatedAt: localISO(`${DATE}T09:05:00`),
      ...overrides,
    };
  }

  it('is "sleep" during sleep hours regardless of entries', () => {
    const slots = buildHourlyGrid(DATE, null, preferences);
    expect(statusForHour(slots[3], undefined, settings, preferences, localISO(`${DATE}T20:00:00`))).toBe('sleep');
  });

  it('is "not_checked_in" (never "missed" or "failed") for an eligible past hour with no response', () => {
    const slots = buildHourlyGrid(DATE, null, preferences);
    const status = statusForHour(slots[9], undefined, settings, preferences, localISO(`${DATE}T20:00:00`));
    expect(status).toBe('not_checked_in');
    expect(statusLabel(status)).toBe('Not checked in');
  });

  it('is "answered" once responded, and "skipped" specifically when the choice was skip', () => {
    const slots = buildHourlyGrid(DATE, null, preferences);
    const now = localISO(`${DATE}T20:00:00`);
    expect(statusForHour(slots[9], entry({ pastChoice: 'followed_plan', respondedAt: now }), settings, preferences, now)).toBe(
      'answered'
    );
    expect(statusForHour(slots[9], entry({ pastChoice: 'skip', respondedAt: now }), settings, preferences, now)).toBe('skipped');
  });

  it('is "not_eligible" for an hour that has not happened yet', () => {
    const slots = buildHourlyGrid(DATE, null, preferences);
    const status = statusForHour(slots[18], undefined, settings, preferences, localISO(`${DATE}T09:00:00`));
    expect(status).toBe('not_eligible');
  });
});

describe('unansweredPastHours', () => {
  const preferences = createSamplePreferences();
  const settings = { ...DEFAULT_HOURLY_SETTINGS, enabled: true };

  it('lists only past, eligible, unanswered hours', () => {
    const slots = buildHourlyGrid(DATE, null, preferences);
    const now = localISO(`${DATE}T11:30:00`);
    const entries: HourlyEntry[] = [
      {
        id: hourlyEntryId(DATE, 8),
        date: DATE,
        hour: 8,
        pastChoice: 'followed_plan',
        respondedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const hours = unansweredPastHours(DATE, slots, entries, settings, preferences, now);
    // 07:00 (wake) through 10:00 are past; 08:00 was answered; 11:00 hasn't fully elapsed yet.
    expect(hours).toEqual([7, 9, 10]);
  });

  it('returns nothing when hourly check-ins are disabled', () => {
    const slots = buildHourlyGrid(DATE, null, preferences);
    const hours = unansweredPastHours(DATE, slots, [], DEFAULT_HOURLY_SETTINGS, preferences, localISO(`${DATE}T12:00:00`));
    expect(hours).toEqual([]);
  });
});

describe('actualFocusMinutesForHour', () => {
  function makeSession(overrides: Partial<FocusSession>): FocusSession {
    return {
      id: 's1',
      taskId: 't1',
      taskTitle: 'Task',
      estimateMinutes: 60,
      status: 'completed',
      startedAt: localISO(`${DATE}T10:00:00`),
      pauseIntervals: [],
      createdAt: localISO(`${DATE}T10:00:00`),
      ...overrides,
    };
  }

  it('counts active time overlapping the hour, excluding paused time', () => {
    const session = makeSession({
      startedAt: localISO(`${DATE}T10:00:00`),
      endedAt: localISO(`${DATE}T11:00:00`),
      pauseIntervals: [{ pausedAt: localISO(`${DATE}T10:20:00`), resumedAt: localISO(`${DATE}T10:30:00`) }],
    });
    const hourInterval = { start: localISO(`${DATE}T10:00:00`), end: localISO(`${DATE}T11:00:00`) };
    const minutes = actualFocusMinutesForHour([session], hourInterval, localISO(`${DATE}T12:00:00`));
    expect(minutes).toBe(50); // 60 minutes minus the 10-minute pause
  });

  it('counts a still-running session only up to now, not its eventual end', () => {
    const session = makeSession({ startedAt: localISO(`${DATE}T10:00:00`), status: 'running' });
    const hourInterval = { start: localISO(`${DATE}T10:00:00`), end: localISO(`${DATE}T11:00:00`) };
    const minutes = actualFocusMinutesForHour([session], hourInterval, localISO(`${DATE}T10:25:00`));
    expect(minutes).toBe(25);
  });

  it('excludes time from a session still paused (no resumedAt yet)', () => {
    const session = makeSession({
      startedAt: localISO(`${DATE}T10:00:00`),
      pauseIntervals: [{ pausedAt: localISO(`${DATE}T10:15:00`) }],
      status: 'paused',
    });
    const hourInterval = { start: localISO(`${DATE}T10:00:00`), end: localISO(`${DATE}T11:00:00`) };
    const minutes = actualFocusMinutesForHour([session], hourInterval, localISO(`${DATE}T10:45:00`));
    expect(minutes).toBe(15);
  });

  it('only counts the portion of a session that actually overlaps the hour', () => {
    const session = makeSession({ startedAt: localISO(`${DATE}T09:40:00`), endedAt: localISO(`${DATE}T10:20:00`) });
    const hourInterval = { start: localISO(`${DATE}T10:00:00`), end: localISO(`${DATE}T11:00:00`) };
    const minutes = actualFocusMinutesForHour([session], hourInterval, localISO(`${DATE}T12:00:00`));
    expect(minutes).toBe(20);
  });
});

describe('choiceSuggestsReplan / describeHourlyReplanTrigger', () => {
  it('suggests a replan for interruption-like choices, not for followed_plan or skip', () => {
    expect(choiceSuggestsReplan('interrupted')).toBe(true);
    expect(choiceSuggestsReplan('did_something_else')).toBe(true);
    expect(choiceSuggestsReplan('partly_followed')).toBe(true);
    expect(choiceSuggestsReplan('followed_plan')).toBe(false);
    expect(choiceSuggestsReplan('skip')).toBe(false);
  });

  it('describes the trigger in words a replan event can carry as its description', () => {
    const description = describeHourlyReplanTrigger(14, 'interrupted', 'Phone call ran long', 'Catch up on email');
    expect(description).toContain('14:00');
    expect(description).toContain('interrupted');
    expect(description).toContain('Phone call ran long');
    expect(description).toContain('Catch up on email');
  });
});

describe('hourlyEntryId', () => {
  it('is deterministic per date+hour, so saves to the same hour naturally collapse to one entry', () => {
    expect(hourlyEntryId(DATE, 9)).toBe(hourlyEntryId(DATE, 9));
    expect(hourlyEntryId(DATE, 9)).not.toBe(hourlyEntryId(DATE, 10));
    expect(hourlyEntryId(DATE, 9)).not.toBe(hourlyEntryId('2026-10-08', 9));
  });
});

// Sanity check against localTime, matching the convention used in planning/__tests__.
describe('local time helper sanity', () => {
  it('localISO/localTime round-trip for a plain local literal', () => {
    expect(localTime(localISO(`${DATE}T14:30:00`))).toBe('14:30');
  });
});
