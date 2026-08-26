import { useCallback, useEffect, useRef, useState } from 'react';

import type { RestaurantMatch } from '@/lib/database';
import { searchRestaurants } from '@/lib/services/restaurant-service';
import { isSupabaseConfigured } from '@/lib/supabase';

/** Below this the server returns nothing, so there is no point asking. */
const MIN_QUERY = 3;

/**
 * Restaurants matching what the admin is typing.
 *
 * Debounced, because this fires per keystroke and the answer for "ita" is
 * worthless once "ital" has been typed. The reply is dropped unless it belongs
 * to the query still in the box — otherwise a slow early request can land
 * after a fast later one and overwrite the right answer with a stale one.
 */
export function useRestaurantSearch(query: string) {
  const [matches, setMatches] = useState<RestaurantMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(query);

  useEffect(() => {
    latest.current = query;

    if (!isSupabaseConfigured() || query.trim().length < MIN_QUERY) {
      setMatches([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchRestaurants(query);
        if (latest.current !== query) return;
        setMatches(found);
        setError(null);
      } catch (caught) {
        if (latest.current !== query) return;
        setMatches([]);
        setError(caught instanceof Error ? caught.message : 'Could not search.');
      } finally {
        if (latest.current === query) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const clear = useCallback(() => setMatches([]), []);

  return { matches, searching, error, clear, tooShort: query.trim().length < MIN_QUERY };
}
