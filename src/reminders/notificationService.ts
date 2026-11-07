import * as Notifications from 'expo-notifications';
import type { DesiredReminder } from './reminderEngine';

// Shows a banner even while the app is in the foreground, so a reminder
// isn't silently swallowed just because SortMe happens to be open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Requests notification permission. Must only be called at the moment the
 * user turns reminders on, never proactively at app launch — see
 * ReminderStateContext.setEnabled.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function hasNotificationPermission(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

export async function scheduleNotification(reminder: DesiredReminder): Promise<string> {
  // A DATE trigger is not actually distinct on iOS: expo-notifications
  // builds it as `UNTimeIntervalNotificationTrigger(timeInterval:
  // date.timeIntervalSinceNow)` internally, which throws natively for any
  // non-positive interval (see TriggerRecords.swift). Computing the
  // interval directly, here, on both platforms means there is exactly one
  // code path that can go wrong instead of two, and the floor below is a
  // last line of defense — reminderEngine's builders already refuse to
  // produce a reminder that isn't safely in the future.
  const secondsFromNow = Math.max(1, Math.round((new Date(reminder.scheduledFor).getTime() - Date.now()) / 1000));
  return Notifications.scheduleNotificationAsync({
    content: { title: reminder.title, body: reminder.body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsFromNow },
  });
}

export async function cancelNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
