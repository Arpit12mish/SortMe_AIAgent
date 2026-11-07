import type { ISODate, ISODateTime } from '../planning/types';

export type EnergyLevel = 'low' | 'normal' | 'high';

export interface MorningCheckIn {
  id: string;
  date: ISODate;
  availableMinutes?: number;
  energyLevel: EnergyLevel;
  mood?: string;
  notes?: string;
  createdAt: ISODateTime;
}

export interface EveningReview {
  id: string;
  date: ISODate;
  completedTaskIds: string[];
  unfinishedTaskIds: string[];
  deferredTaskIds: string[];
  notes?: string;
  createdAt: ISODateTime;
}
