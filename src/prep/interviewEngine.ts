import type { InterviewEntry, InterviewOutcome } from './types';

// Deliberately neutral, non-judgmental copy for every outcome.
export const OUTCOME_LABEL: Record<InterviewOutcome, string> = {
  pending: 'Pending',
  passed_round: 'Passed this round',
  not_selected: 'Not selected this time',
  no_response: 'No response yet',
  offer_received: 'Offer received',
  withdrawn: 'Withdrawn',
};

export const STAGE_LABEL: Record<InterviewEntry['stage'], string> = {
  applied: 'Applied',
  phone_screen: 'Phone screen',
  technical: 'Technical',
  onsite: 'Onsite',
  offer: 'Offer',
  closed: 'Closed',
};

/**
 * Follow-ups due today or earlier that haven't been marked done, oldest
 * first — surfaced as suggestions only. Nothing here sends anything; it's
 * purely a list for the person to act on themselves.
 */
export function dueFollowUps(interviews: InterviewEntry[], todayLocalDate: string): InterviewEntry[] {
  return interviews
    .filter((e) => e.followUpDate && !e.followUpDone && e.followUpDate <= todayLocalDate)
    .sort((a, b) => (a.followUpDate ?? '').localeCompare(b.followUpDate ?? ''));
}

/** The soonest interview at or after `nowMs`, or null if none is scheduled. */
export function nearestUpcomingInterview(interviews: InterviewEntry[], nowMs: number): InterviewEntry | null {
  const upcoming = interviews
    .filter((i) => i.interviewDate && new Date(i.interviewDate).getTime() >= nowMs)
    .sort((a, b) => new Date(a.interviewDate!).getTime() - new Date(b.interviewDate!).getTime());
  return upcoming[0] ?? null;
}
