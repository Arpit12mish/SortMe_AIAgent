// Domain types for the Hourly Plan / Hourly Check-in feature. These never
// store a second schedule: planned activity for an hour is always derived
// from the accepted PlanVersion (see hourlyEngine.buildHourlyGrid) at read
// time. Only the user's own intentions, responses, and notes persist here.

import type { ISODate, ISODateTime, TimeString } from '../planning/types';

export type HourlyCheckInChoice = 'followed_plan' | 'partly_followed' | 'did_something_else' | 'interrupted' | 'skip';

/**
 * One local hour (0-23) of one local date. `pastChoice`/`pastNote` answer
 * "what did you do in the last hour"; `intention` answers "what do you want
 * to do in the next hour" and can also be set directly from the Hourly Plan
 * view without going through a check-in. `respondedAt` is the only signal
 * that distinguishes "not checked in" from "answered" — an entry can exist
 * (e.g. just an intention was set) without being "responded to".
 */
export interface HourlyEntry {
  id: string;
  date: ISODate;
  /** 0-23, the local hour this entry is about. */
  hour: number;
  pastChoice?: HourlyCheckInChoice;
  pastNote?: string;
  intention?: string;
  respondedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export const HOURLY_CHECKIN_FREQUENCIES = [30, 60, 90, 120] as const;
export type HourlyCheckInFrequency = (typeof HOURLY_CHECKIN_FREQUENCIES)[number];

export interface HourlyCheckInSettings {
  /** Off by default; the Hourly Plan view works regardless of this. */
  enabled: boolean;
  frequencyMinutes: HourlyCheckInFrequency;
  /** Unset means "default to the current wake/sleep time" (see hourlyEngine.resolveWindow). */
  windowStart?: TimeString;
  windowEnd?: TimeString;
  promptDuringFixed: boolean;
  promptDuringProtected: boolean;
}

export const DEFAULT_HOURLY_SETTINGS: HourlyCheckInSettings = {
  enabled: false,
  frequencyMinutes: 60,
  promptDuringFixed: false,
  promptDuringProtected: false,
};
