import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { HabitCheckIn, HabitCheckInStatus, HabitDefinition } from '../habits/types';
import type { ISODate, TimeString } from '../planning/types';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';
import { generateId } from '../utils/id';

export interface NewHabitInput {
  name: string;
  goal?: string;
  scheduledDays: number[];
  startDate: ISODate;
  reminderTime?: TimeString;
}

interface HabitStateValue {
  loading: boolean;
  habits: HabitDefinition[];
  checkIns: HabitCheckIn[];
  addHabit: (input: NewHabitInput) => Promise<HabitDefinition>;
  updateHabit: (id: string, patch: Partial<NewHabitInput>) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  reorderHabits: (orderedIds: string[]) => Promise<void>;
  saveCheckIn: (habitId: string, date: ISODate, status: HabitCheckInStatus, note?: string) => Promise<HabitCheckIn>;
  /** Same upsert path as saveCheckIn — named separately for call-site clarity when
   *  correcting an earlier day's entry. Streaks/rates are pure derivations over the
   *  full checkIns array, so recalculation is automatic; there's no cache to bust. */
  correctCheckIn: (habitId: string, date: ISODate, status: HabitCheckInStatus, note?: string) => Promise<HabitCheckIn>;
  clearCheckIn: (habitId: string, date: ISODate) => Promise<void>;
}

const HabitStateContext = createContext<HabitStateValue | null>(null);

export function HabitStateProvider({
  children,
  repositories,
}: {
  children: React.ReactNode;
  repositories?: AppRepositories;
}) {
  const repos = useMemo(() => repositories ?? createAsyncStorageRepositories(), [repositories]);
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<HabitDefinition[]>([]);
  const [checkIns, setCheckIns] = useState<HabitCheckIn[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [habitList, checkInList] = await Promise.all([repos.habits.list(), repos.habitCheckIns.list()]);
      if (cancelled) return;
      setHabits(habitList);
      setCheckIns(checkInList);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const saveCheckInInternal = useCallback(
    async (habitId: string, date: ISODate, status: HabitCheckInStatus, note?: string): Promise<HabitCheckIn> => {
      const id = `habit-${habitId}-${date}`;
      const existing = checkIns.find((c) => c.id === id);
      const now = new Date().toISOString();
      const checkIn: HabitCheckIn = {
        id,
        habitId,
        date,
        status,
        note,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await repos.habitCheckIns.save(checkIn);
      setCheckIns((prev) => [...prev.filter((c) => c.id !== id), checkIn]);
      return checkIn;
    },
    [checkIns, repos]
  );

  const value = useMemo<HabitStateValue>(
    () => ({
      loading,
      habits,
      checkIns,
      addHabit: async (input) => {
        const habit: HabitDefinition = {
          id: generateId('habit'),
          name: input.name,
          goal: input.goal,
          scheduledDays: input.scheduledDays,
          startDate: input.startDate,
          reminderTime: input.reminderTime,
          order: habits.length,
          archived: false,
          createdAt: new Date().toISOString(),
        };
        await repos.habits.save(habit);
        setHabits((prev) => [...prev, habit]);
        return habit;
      },
      updateHabit: async (id, patch) => {
        const current = habits.find((h) => h.id === id);
        if (!current) return;
        const next: HabitDefinition = { ...current, ...patch };
        await repos.habits.save(next);
        setHabits((prev) => prev.map((h) => (h.id === id ? next : h)));
      },
      archiveHabit: async (id) => {
        const current = habits.find((h) => h.id === id);
        if (!current) return;
        const next: HabitDefinition = { ...current, archived: true, archivedAt: new Date().toISOString() };
        await repos.habits.save(next);
        setHabits((prev) => prev.map((h) => (h.id === id ? next : h)));
      },
      reorderHabits: async (orderedIds) => {
        await repos.habits.reorder(orderedIds);
        const orderById = new Map(orderedIds.map((id, i) => [id, i]));
        setHabits((prev) => prev.map((h) => (orderById.has(h.id) ? { ...h, order: orderById.get(h.id)! } : h)));
      },
      saveCheckIn: saveCheckInInternal,
      correctCheckIn: saveCheckInInternal,
      clearCheckIn: async (habitId, date) => {
        const id = `habit-${habitId}-${date}`;
        await repos.habitCheckIns.remove(id);
        setCheckIns((prev) => prev.filter((c) => c.id !== id));
      },
    }),
    [loading, habits, checkIns, repos, saveCheckInInternal]
  );

  return <HabitStateContext.Provider value={value}>{children}</HabitStateContext.Provider>;
}

export function useHabitState(): HabitStateValue {
  const ctx = useContext(HabitStateContext);
  if (!ctx) throw new Error('useHabitState must be used within a HabitStateProvider');
  return ctx;
}
