import { useCallback, useEffect, useState } from 'react';

import type { Restaurant } from '@/lib/database';
import { listActiveRestaurants } from '@/lib/services/restaurant-service';
import { isSupabaseConfigured } from '@/lib/supabase';

/** The restaurants an admin may start a table at. */
export function useRestaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      setRestaurants(await listActiveRestaurants());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the restaurants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { restaurants, loading, error, reload };
}
