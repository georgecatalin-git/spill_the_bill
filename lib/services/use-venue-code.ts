import { useEffect, useRef, useState } from 'react';

import type { RestaurantMatch } from '@/lib/database';
import { getVenueByCode } from '@/lib/services/restaurant-service';
import { isSupabaseConfigured } from '@/lib/supabase';

/** The codes are eight characters; asking before that is asking for nothing. */
const CODE_LENGTH = 8;

/**
 * The restaurant behind the code printed on the table.
 *
 * Looked up as it is typed so the person sees the name before they commit —
 * "Italien · Brașov" under the box is the difference between a code that
 * worked and a code that will fail after they have named their table.
 *
 * The reply is dropped unless it still matches what is in the box, so a slow
 * early request cannot land after a fast later one.
 *
 * `enabled` is how the caller says the session is ready. A scanned sticker
 * opens the app straight onto this screen; asking before the stored session
 * has been restored answers 401, which would be shown as "that code does not
 * open a table here" — an accusation, for a code that is perfectly good.
 */
export function useVenueCode(code: string, enabled = true) {
  const [venue, setVenue] = useState<RestaurantMatch | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(code);

  const trimmed = code.trim();

  useEffect(() => {
    latest.current = code;

    if (!isSupabaseConfigured() || trimmed.length < CODE_LENGTH) {
      setVenue(null);
      setChecking(false);
      return;
    }

    if (!enabled) {
      // Checking, not failing: the code has not been judged yet.
      setChecking(true);
      return;
    }

    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const found = await getVenueByCode(trimmed);
        if (latest.current !== code) return;
        setVenue(found);
        setError(null);
      } catch (caught) {
        if (latest.current !== code) return;
        setVenue(null);
        setError(caught instanceof Error ? caught.message : 'Could not check that code.');
      } finally {
        if (latest.current === code) setChecking(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [code, trimmed, enabled]);

  return { venue, checking, error, tooShort: trimmed.length < CODE_LENGTH };
}
