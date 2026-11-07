import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_HOURLY_SETTINGS } from '../hourly/types';
import type { HourlyCheckInChoice, HourlyCheckInSettings, HourlyEntry } from '../hourly/types';
import { requestNotificationPermission } from '../reminders/notificationService';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';

interface AnswerHourInput {
  pastChoice: HourlyCheckInChoice;
  pastNote?: string;
  /** The two questions are shown together, so an intention can be recorded in the same action. */
  intention?: string;
}

interface HourlyStateValue {
  loading: boolean;
  settings: HourlyCheckInSettings;
  entries: HourlyEntry[];
  permissionDenied: boolean;
  /** Turning this on requests OS notification permission right here — independent of the general Reminders toggle in ReminderStateContext. */
  setEnabled: (enabled: boolean) => Promise<void>;
  updateSettings: (patch: Partial<Omit<HourlyCheckInSettings, 'enabled'>>) => Promise<void>;
  getEntry: (date: string, hour: number) => HourlyEntry | undefined;
  /** Answers "what did you do in the last hour" (and optionally "what's next"). Works for any past hour, including one already answered — this is also how a user corrects an earlier hour. */
  answerHour: (date: string, hour: number, input: AnswerHourInput) => Promise<HourlyEntry>;
  /** Sets or changes the intention for an hour directly from the Hourly Plan view, without implying the check-in question was answered. */
  setIntention: (date: string, hour: number, intention: string) => Promise<HourlyEntry>;
}

const HourlyStateContext = createContext<HourlyStateValue | null>(null);

export function HourlyStateProvider({
  children,
  repositories,
}: {
  children: React.ReactNode;
  repositories?: AppRepositories;
}) {
  const repos = useMemo(() => repositories ?? createAsyncStorageRepositories(), [repositories]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<HourlyCheckInSettings>(DEFAULT_HOURLY_SETTINGS);
  const [entries, setEntries] = useState<HourlyEntry[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedSettings, storedEntries] = await Promise.all([repos.hourlySettings.get(), repos.hourlyEntries.list()]);
      if (cancelled) return;
      setSettings(storedSettings ?? DEFAULT_HOURLY_SETTINGS);
      setEntries(storedEntries);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const persistSettings = useCallback(
    async (next: HourlyCheckInSettings) => {
      await repos.hourlySettings.save(next);
      setSettings(next);
    },
    [repos]
  );

  const setEnabled = useCallback<HourlyStateValue['setEnabled']>(
    async (next) => {
      if (!next) {
        await persistSettings({ ...settings, enabled: false });
        return;
      }
      const granted = await requestNotificationPermission();
      setPermissionDenied(!granted);
      // The Hourly Plan view itself must keep working when permission is denied —
      // only the notification side is gated here; staying "off" just means no
      // local reminders get scheduled, never that the feature is unusable.
      await persistSettings({ ...settings, enabled: granted });
    },
    [settings, persistSettings]
  );

  const updateSettings = useCallback<HourlyStateValue['updateSettings']>(
    async (patch) => {
      await persistSettings({ ...settings, ...patch });
    },
    [settings, persistSettings]
  );

  const getEntry = useCallback<HourlyStateValue['getEntry']>(
    (date, hour) => entries.find((e) => e.date === date && e.hour === hour),
    [entries]
  );

  const upsertEntry = useCallback(
    async (date: string, hour: number, patch: Parameters<AppRepositories['hourlyEntries']['upsert']>[2]) => {
      const entry = await repos.hourlyEntries.upsert(date, hour, patch, new Date().toISOString());
      setEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry]);
      return entry;
    },
    [repos]
  );

  const answerHour = useCallback<HourlyStateValue['answerHour']>(
    (date, hour, input) => upsertEntry(date, hour, { ...input, respondedAt: new Date().toISOString() }),
    [upsertEntry]
  );

  const setIntention = useCallback<HourlyStateValue['setIntention']>(
    (date, hour, intention) => upsertEntry(date, hour, { intention }),
    [upsertEntry]
  );

  const value = useMemo<HourlyStateValue>(
    () => ({ loading, settings, entries, permissionDenied, setEnabled, updateSettings, getEntry, answerHour, setIntention }),
    [loading, settings, entries, permissionDenied, setEnabled, updateSettings, getEntry, answerHour, setIntention]
  );

  return <HourlyStateContext.Provider value={value}>{children}</HourlyStateContext.Provider>;
}

export function useHourlyCheckIns(): HourlyStateValue {
  const ctx = useContext(HourlyStateContext);
  if (!ctx) throw new Error('useHourlyCheckIns must be used within a HourlyStateProvider');
  return ctx;
}
