import { dueFollowUps, nearestUpcomingInterview } from '../interviewEngine';
import type { InterviewEntry } from '../types';

function entry(
  id: string,
  followUpDate: string | undefined,
  followUpDone = false,
  interviewDate?: string
): InterviewEntry {
  return {
    id,
    company: 'Acme',
    role: 'Engineer',
    stage: 'phone_screen',
    interviewDate,
    outcome: 'pending',
    followUpDate,
    followUpDone,
    questionsAsked: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('dueFollowUps', () => {
  it('includes a follow-up due today or earlier, oldest first', () => {
    const due = dueFollowUps(
      [entry('a', '2026-10-05'), entry('b', '2026-10-03'), entry('c', '2026-10-07')],
      '2026-10-07'
    );
    expect(due.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('excludes follow-ups scheduled for a future date', () => {
    const due = dueFollowUps([entry('future', '2026-10-08')], '2026-10-07');
    expect(due).toHaveLength(0);
  });

  it('excludes entries with no follow-up date and ones already marked done', () => {
    const due = dueFollowUps(
      [entry('none', undefined), entry('done', '2026-10-01', true)],
      '2026-10-07'
    );
    expect(due).toHaveLength(0);
  });
});

describe('nearestUpcomingInterview', () => {
  const nowMs = new Date('2026-10-07T00:00:00.000Z').getTime();

  it('returns the soonest interview at or after now', () => {
    const result = nearestUpcomingInterview(
      [
        entry('later', undefined, false, '2026-10-20T10:00:00.000Z'),
        entry('soonest', undefined, false, '2026-10-09T10:00:00.000Z'),
        entry('past', undefined, false, '2026-10-01T10:00:00.000Z'),
      ],
      nowMs
    );
    expect(result?.id).toBe('soonest');
  });

  it('returns null when no interview is scheduled at or after now', () => {
    const result = nearestUpcomingInterview(
      [entry('past', undefined, false, '2026-10-01T10:00:00.000Z'), entry('none', undefined)],
      nowMs
    );
    expect(result).toBeNull();
  });
});
