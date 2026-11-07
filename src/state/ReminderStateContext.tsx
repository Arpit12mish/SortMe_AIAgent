import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { todayLocalDate } from '../checkins/checkinEngine';
import type { HabitCheckIn, HabitDefinition } from '../habits/types';
import type { HourSlot } from '../hourly/hourlyEngine';
import type { HourlyCheckInSettings, HourlyEntry } from '../hourly/types';
import type { ISODate, PlanVersion, Preferences } from '../planning/types';
import type { InterviewEntry } from '../prep/types';
import {
  cancelNotification,
  hasNotificationPermission,
  requestNotificationPermission,
  scheduleNotification,
} from '../reminders/notificationService';
import {
  desiredCheckInReminder,
  desiredFocusBlockReminders,
  desiredFollowUpReminder,
  desiredHabitReminders,
  desiredHourlyCheckInReminders,
  diffReminders,
} from '../reminders/reminderEngine';
import type { ReminderKind, ScheduledReminder } from '../reminders/types';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';
import { generateId } from '../utils/id';

const FOCUS_BLOCK_LEAD_MINUTES = 10;
const MORNING_CHECKIN_TIME = '08:00';
const EVENING_REVIEW_TIME = '20:30';
const FOLLOW_UP_TIME = '09:00';

interface ReminderStateValue {
  loading: boolean;
  enabled: boolean;
  permissionDenied: boolean;
  reminders: ScheduledReminder[];
  /** Turning this on requests OS notification permission right here, at the point of use. */
  setEnabled: (enabled: boolean) => Promise<void>;
  syncFocusBlockReminders: (plan: PlanVersion) => Promise<void>;
  syncCheckInReminders: () => Promise<void>;
  syncFollowUpReminders: (interviews: InterviewEntry[]) => Promise<void>;
  syncHabitReminders: (habits: HabitDefinition[], checkIns: HabitCheckIn[]) => Promise<void>;
  /** Not gated by the general `enabled` toggle above — hourly check-ins have their own on/off in HourlyCheckInSettings. */
  syncHourlyCheckInReminders: (
    date: ISODate,
    slots: HourSlot[],
    settings: HourlyCheckInSettings,
    preferences: Preferences,
    entries: HourlyEntry[]
  ) => Promise<void>;
  cancelAll: () => Promise<void>;
}

const ReminderStateContext = createContext<ReminderStateValue | null>(null);

export function ReminderStateProvider({
  children,
  repositories,
}: {
  children: React.ReactNode;
  repositories?: AppRepositories;
}) {
  const repos = useMemo(() => repositories ?? createAsyncStorageRepositories(), [repositories]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabledState] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [reminders, setReminders] = useState<ScheduledReminder[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, granted] = await Promise.all([repos.reminders.list(), hasNotificationPermission()]);
      if (cancelled) return;
      setReminders(list);
      // Reminders can only be "on" if permission is actually granted; a
      // revoked OS permission silently turns this back off rather than
      // pretending reminders are still active.
      setEnabledState(granted);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const applyDiff = useCallback(
    async (desired: Parameters<typeof diffReminders>[0], kinds: ReminderKind[]) => {
      const diff = diffReminders(desired, reminders, kinds);
      // A true no-op must not touch `reminders` state: setting it to a new
      // array reference here would change this callback's identity, which
      // would change every effect that depends on it, which would call
      // this again — a self-sustaining render loop for as long as
      // reminders stay enabled. Only a real change is allowed through.
      if (diff.toCreate.length === 0 && diff.toCancel.length === 0) return;

      await Promise.all(diff.toCancel.map((r) => cancelNotification(r.notificationId).catch(() => undefined)));
      // Scheduling is best-effort: a single reminder failing to schedule
      // (the OS can refuse for reasons outside this app's control) must
      // never throw past this point and break whatever the user was
      // actually doing — saving a check-in, accepting a plan, adding a
      // follow-up. Each attempt is caught individually and just skipped.
      const created: ScheduledReminder[] = [];
      for (const d of diff.toCreate) {
        try {
          const notificationId = await scheduleNotification(d);
          const reminder: ScheduledReminder = {
            id: generateId('reminder'),
            kind: d.kind,
            refId: d.refId,
            scheduledFor: d.scheduledFor,
            notificationId,
            title: d.title,
            body: d.body,
            createdAt: new Date().toISOString(),
          };
          await repos.reminders.save(reminder);
          created.push(reminder);
        } catch {
          // Skipped: this one reminder didn't schedule. Nothing else here depends on it.
        }
      }
      for (const r of diff.toCancel) {
        await repos.reminders.remove(r.id);
      }
      setReminders((prev) => [...prev.filter((r) => !diff.toCancel.some((c) => c.id === r.id)), ...created]);
    },
    [reminders, repos]
  );

  const setEnabled = useCallback<ReminderStateValue['setEnabled']>(
    async (next) => {
      if (!next) {
        setEnabledState(false);
        return;
      }
      const granted = await requestNotificationPermission();
      setPermissionDenied(!granted);
      setEnabledState(granted);
    },
    []
  );

  const syncFocusBlockReminders = useCallback<ReminderStateValue['syncFocusBlockReminders']>(
    async (plan) => {
      if (!enabled) return;
      const desired = desiredFocusBlockReminders(plan, new Date().toISOString(), FOCUS_BLOCK_LEAD_MINUTES);
      await applyDiff(desired, ['focus_block']);
    },
    [enabled, applyDiff]
  );

  const syncCheckInReminders = useCallback<ReminderStateValue['syncCheckInReminders']>(async () => {
    if (!enabled) return;
    const today = todayLocalDate();
    const now = new Date().toISOString();
    const desired = [
      desiredCheckInReminder('morning_checkin', today, MORNING_CHECKIN_TIME, 'Morning check-in', now),
      desiredCheckInReminder('evening_review', today, EVENING_REVIEW_TIME, 'Evening review', now),
    ].filter((d): d is NonNullable<typeof d> => d !== null);
    await applyDiff(desired, ['morning_checkin', 'evening_review']);
  }, [enabled, applyDiff]);

  const syncFollowUpReminders = useCallback<ReminderStateValue['syncFollowUpReminders']>(
    async (interviews) => {
      if (!enabled) return;
      const now = new Date().toISOString();
      const desired = interviews
        .map((i) => desiredFollowUpReminder(i, FOLLOW_UP_TIME, now))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      await applyDiff(desired, ['follow_up']);
    },
    [enabled, applyDiff]
  );

  const syncHabitReminders = useCallback<ReminderStateValue['syncHabitReminders']>(
    async (habits, habitCheckIns) => {
      if (!enabled) return;
      const desired = desiredHabitReminders(habits, habitCheckIns, todayLocalDate(), new Date().toISOString());
      await applyDiff(desired, ['habit']);
    },
    [enabled, applyDiff]
  );

  const syncHourlyCheckInReminders = useCallback<ReminderStateValue['syncHourlyCheckInReminders']>(
    async (date, slots, settings, preferences, entries) => {
      const desired = desiredHourlyCheckInReminders(date, slots, settings, preferences, entries, new Date().toISOString());
      await applyDiff(desired, ['hourly_checkin']);
    },
    [applyDiff]
  );

  const cancelAll = useCallback(async () => {
    await Promise.all(reminders.map((r) => cancelNotification(r.notificationId).catch(() => undefined)));
    await Promise.all(reminders.map((r) => repos.reminders.remove(r.id)));
    setReminders([]);
  }, [reminders, repos]);

  const value = useMemo<ReminderStateValue>(
    () => ({
      loading,
      enabled,
      permissionDenied,
      reminders,
      setEnabled,
      syncFocusBlockReminders,
      syncCheckInReminders,
      syncFollowUpReminders,
      syncHabitReminders,
      syncHourlyCheckInReminders,
      cancelAll,
    }),
    [
      loading,
      enabled,
      permissionDenied,
      reminders,
      setEnabled,
      syncFocusBlockReminders,
      syncCheckInReminders,
      syncFollowUpReminders,
      syncHabitReminders,
      syncHourlyCheckInReminders,
      cancelAll,
    ]
  );

  return <ReminderStateContext.Provider value={value}>{children}</ReminderStateContext.Provider>;
}

export function useReminders(): ReminderStateValue {
  const ctx = useContext(ReminderStateContext);
  if (!ctx) throw new Error('useReminders must be used within a ReminderStateProvider');
  return ctx;
}
