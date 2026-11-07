import type { ISODateTime } from '../planning/types';

export type ReminderKind = 'focus_block' | 'morning_checkin' | 'evening_review' | 'follow_up' | 'habit' | 'hourly_checkin';

export interface ScheduledReminder {
  id: string;
  kind: ReminderKind;
  /** What this reminder is about: a plan block id, an ISODate for check-ins, or an interview id. */
  refId: string;
  scheduledFor: ISODateTime;
  /** The id expo-notifications returned for this schedule call; needed to cancel it. */
  notificationId: string;
  title: string;
  body: string;
  createdAt: ISODateTime;
}
