import { useCallback, useEffect, useState } from 'react';

import type { RestaurantMatch } from '@/lib/database';
import { getMyRestaurant } from '@/lib/services/restaurant-service';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * The restaurant the signed-in account belongs to.
 *
 * `null` with `loading` false means nobody has linked this account yet, which
 * is a real state and not an error — the owner links it when the contract is
 * signed, and until then the account cannot open a table at all.
 *
 * `enabled` is how the caller says the session is ready. A deep link opens the
 * app straight onto a screen, and asking before the stored session has been
 * restored answers 401 — which reads on screen as "not linked" rather than as
 * "too early", and is exactly the wrong thing to tell somebody.
 */
export function useMyRestaurant(enabled = true) {
  const [restaurant, setRestaurant] = useState<RestaurantMatch | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    if (!enabled) {
      // Still loading, deliberately: "no restaurant" is a claim this cannot
      // make yet.
      setLoading(true);
      return;
    }

    setError(null);
    try {
      setRestaurant(await getMyRestaurant());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your restaurant.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { restaurant, loading, error, reload };
}
