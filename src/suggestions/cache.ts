import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailySuggestion } from './types';

const DAILY_SUGGESTIONS_KEY = '@sortme/dailySuggestionsCache';
const CAREER_INSIGHTS_KEY = '@sortme/careerInsightsCache';
const CAREER_INSIGHTS_STALE_AFTER_DAYS = 7;

interface DailySuggestionsCache {
  date: string; // YYYY-MM-DD this was computed for
  suggestions: DailySuggestion[];
}

export async function readDailySuggestionsCache(today: string): Promise<DailySuggestion[] | null> {
  const raw = await AsyncStorage.getItem(DAILY_SUGGESTIONS_KEY);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw) as DailySuggestionsCache;
    return cache.date === today ? cache.suggestions : null;
  } catch {
    return null;
  }
}

export async function writeDailySuggestionsCache(today: string, suggestions: DailySuggestion[]): Promise<void> {
  const cache: DailySuggestionsCache = { date: today, suggestions };
  await AsyncStorage.setItem(DAILY_SUGGESTIONS_KEY, JSON.stringify(cache));
}

interface CareerInsightsCache<T> {
  cachedAtMs: number;
  data: T;
}

export async function readCareerInsightsCache<T>(nowMs: number): Promise<T | null> {
  const raw = await AsyncStorage.getItem(CAREER_INSIGHTS_KEY);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw) as CareerInsightsCache<T>;
    const ageDays = (nowMs - cache.cachedAtMs) / (24 * 60 * 60 * 1000);
    return ageDays < CAREER_INSIGHTS_STALE_AFTER_DAYS ? cache.data : null;
  } catch {
    return null;
  }
}

export async function writeCareerInsightsCache<T>(nowMs: number, data: T): Promise<void> {
  const cache: CareerInsightsCache<T> = { cachedAtMs: nowMs, data };
  await AsyncStorage.setItem(CAREER_INSIGHTS_KEY, JSON.stringify(cache));
}
