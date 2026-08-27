import { useCallback, useEffect, useState } from 'react';

import type { MyRestaurant } from '@/lib/database';
import { getAdministeredRestaurant } from '@/lib/services/restaurant-service';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * The restaurant this account administers, if any.
 *
 * `null` once loading is done is a real state and not an error: most accounts
 * administer nothing. It is what decides whether the app shows somebody the
 * restaurant's own screens or just their own tables.
 */
export function useMyRestaurant() {
  const [restaurant, setRestaurant] = useState<MyRestaurant | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      setRestaurant(await getAdministeredRestaurant());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your restaurant.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { restaurant, loading, error, reload };
}
