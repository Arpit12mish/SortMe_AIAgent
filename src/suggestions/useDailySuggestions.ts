import { useCallback, useEffect, useRef, useState } from 'react';
import { todayLocalDate } from '../checkins/checkinEngine';
import { usePrepState } from '../state/PrepStateContext';
import { readDailySuggestionsCache, writeDailySuggestionsCache } from './cache';
import { buildDailySuggestions } from './dailySuggestionsEngine';
import type { DailySuggestion } from './types';

/** Computes the daily digest at most once per calendar day (cached in
 * AsyncStorage), so reopening the app the same day never re-triggers the
 * Gmail/Gemini calls inside buildDailySuggestions. `refresh()` bypasses the
 * cache for an explicit manual recompute. */
export function useDailySuggestions() {
  const { interviews, studyQuestions, questionAttempts, notes } = usePrepState();
  const [suggestions, setSuggestions] = useState<DailySuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const startedRef = useRef(false);

  const compute = useCallback(async () => {
    const today = todayLocalDate();
    const result = await buildDailySuggestions({
      interviews,
      studyQuestions,
      questionAttempts,
      notes,
      today,
      nowMs: Date.now(),
    });
    await writeDailySuggestionsCache(today, result);
    setSuggestions(result);
  }, [interviews, studyQuestions, questionAttempts, notes]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const cached = await readDailySuggestionsCache(todayLocalDate());
      if (cached) {
        setSuggestions(cached);
        setLoading(false);
        return;
      }
      await compute();
      setLoading(false);
    })();
  }, [compute]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await compute();
    } finally {
      setLoading(false);
    }
  }, [compute]);

  return { suggestions, loading, refresh };
}
