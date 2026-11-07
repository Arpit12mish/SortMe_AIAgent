import { useCallback, useEffect, useRef, useState } from 'react';
import { getCareerInsights } from '../ai/api';
import type { CareerInsight } from '../ai/types';
import { readCareerInsightsCache, writeCareerInsightsCache } from './cache';

/** Same cache-and-refresh shape as useDailySuggestions, but keyed by a
 * stored timestamp with a 7-day staleness check instead of same-day
 * equality -- this is a weekly, not daily, signal. */
export function useCareerInsights() {
  const [insights, setInsights] = useState<CareerInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const startedRef = useRef(false);

  const compute = useCallback(async () => {
    const response = await getCareerInsights();
    await writeCareerInsightsCache(Date.now(), response.insights);
    setInsights(response.insights);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const cached = await readCareerInsightsCache<CareerInsight[]>(Date.now());
      if (cached) {
        setInsights(cached);
        setLoading(false);
        return;
      }
      try {
        await compute();
      } finally {
        setLoading(false);
      }
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

  return { insights, loading, refresh };
}
