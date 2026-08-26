import { useCallback, useEffect, useState } from 'react';

import type { OwnerRestaurantStat } from '@/lib/database';
import { getOwnerRestaurantStats } from '@/lib/services/restaurant-service';
import { isSupabaseConfigured } from '@/lib/supabase';

/** Per-restaurant usage figures for the owner area. */
export function useOwnerStats() {
  const [stats, setStats] = useState<OwnerRestaurantStat[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      setStats(await getOwnerRestaurantStats());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the usage figures.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { stats, loading, error, reload };
}
