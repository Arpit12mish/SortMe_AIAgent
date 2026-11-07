import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { EnergyLevel, EveningReview, MorningCheckIn } from '../checkins/types';
import { todayLocalDate } from '../checkins/checkinEngine';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';
import { generateId } from '../utils/id';

interface CheckInValue {
  loading: boolean;
  morningCheckIns: MorningCheckIn[];
  eveningReviews: EveningReview[];
  saveMorningCheckIn: (input: {
    availableMinutes?: number;
    energyLevel: EnergyLevel;
    mood?: string;
    notes?: string;
  }) => Promise<MorningCheckIn>;
  saveEveningReview: (input: {
    completedTaskIds: string[];
    unfinishedTaskIds: string[];
    deferredTaskIds: string[];
    notes?: string;
  }) => Promise<EveningReview>;
}

const CheckInContext = createContext<CheckInValue | null>(null);

export function CheckInProvider({
  children,
  repositories,
}: {
  children: React.ReactNode;
  repositories?: AppRepositories;
}) {
  const repos = useMemo(() => repositories ?? createAsyncStorageRepositories(), [repositories]);
  const [loading, setLoading] = useState(true);
  const [morningCheckIns, setMorningCheckIns] = useState<MorningCheckIn[]>([]);
  const [eveningReviews, setEveningReviews] = useState<EveningReview[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [morning, evening] = await Promise.all([repos.checkIns.listMorning(), repos.checkIns.listEvening()]);
      if (!cancelled) {
        setMorningCheckIns(morning);
        setEveningReviews(evening);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const value = useMemo<CheckInValue>(
    () => ({
      loading,
      morningCheckIns,
      eveningReviews,
      saveMorningCheckIn: async (input) => {
        const checkIn: MorningCheckIn = {
          id: generateId('morning'),
          date: todayLocalDate(),
          availableMinutes: input.availableMinutes,
          energyLevel: input.energyLevel,
          mood: input.mood,
          notes: input.notes,
          createdAt: new Date().toISOString(),
        };
        await repos.checkIns.saveMorning(checkIn);
        setMorningCheckIns((prev) => [...prev, checkIn]);
        return checkIn;
      },
      saveEveningReview: async (input) => {
        const review: EveningReview = {
          id: generateId('evening'),
          date: todayLocalDate(),
          ...input,
          createdAt: new Date().toISOString(),
        };
        await repos.checkIns.saveEvening(review);
        setEveningReviews((prev) => [...prev, review]);
        return review;
      },
    }),
    [loading, morningCheckIns, eveningReviews, repos]
  );

  return <CheckInContext.Provider value={value}>{children}</CheckInContext.Provider>;
}

export function useCheckIns(): CheckInValue {
  const ctx = useContext(CheckInContext);
  if (!ctx) throw new Error('useCheckIns must be used within a CheckInProvider');
  return ctx;
}
