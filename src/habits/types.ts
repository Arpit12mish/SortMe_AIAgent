import type { ISODate, ISODateTime, TimeString } from '../planning/types';

export interface HabitDefinition {
  id: string;
  name: string;
  /** Free-text target, e.g. "8 glasses", "30 minutes". Never parsed by engine logic — purely descriptive. */
  goal?: string;
  /** 0 = Sunday .. 6 = Saturday, same convention as FixedCommitment.daysOfWeek. */
  scheduledDays: number[];
  startDate: ISODate;
  reminderTime?: TimeString;
  /** Position among the user's habits; reassigned as a contiguous 0..n-1 sequence on reorder. */
  order: number;
  archived: boolean;
  archivedAt?: ISODateTime;
  createdAt: ISODateTime;
}

export type HabitCheckInStatus = 'completed' | 'partial' | 'missed';

/**
 * 'untracked' is NEVER persisted as a HabitCheckIn row — it is the absence
 * of one for a given habit+date, mirroring how hasCheckedInMorning derives
 * presence/absence rather than storing a boolean. See habitEngine.ts's
 * deriveHabitDayStatus for how a day resolves to this value.
 */
export type HabitDayStatus = HabitCheckInStatus | 'untracked';

export interface HabitCheckIn {
  /** Deterministic: `habit-${habitId}-${date}` — enforces exactly one row per habit+date at the storage layer. */
  id: string;
  habitId: string;
  date: ISODate;
  status: HabitCheckInStatus;
  note?: string;
  createdAt: ISODateTime;
  /** Bumped on every save; equals createdAt on first save. Distinguishes a corrected entry from an original one. */
  updatedAt: ISODateTime;
}
