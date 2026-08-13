import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  clearGuestSession,
  createGuestSession,
  leaveTable as leaveTableRequest,
  validateGuestSession,
} from '@/lib/services/guest-session-service';
import type { GuestSession } from '@/lib/types';

type GuestContextValue = {
  session: GuestSession | null;
  /** True while the stored session is being checked on launch. */
  restoring: boolean;
  /** Set when a restored session turned out to be gone. */
  expired: boolean;
  join: (inviteCode: string, name: string) => Promise<GuestSession>;
  leave: () => Promise<void>;
  dismissExpired: () => void;
};

const GuestContext = createContext<GuestContextValue | null>(null);

/**
 * Holds the guest's session for the whole app.
 *
 * Entirely separate from `AuthProvider`: a guest has no Supabase account, only
 * a token this device stores. On launch the token is checked against the
 * server, so a guest returning to a live table skips straight back in.
 */
export function GuestProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<GuestSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    validateGuestSession()
      .then((state) => {
        if (cancelled) return;

        if (state.status === 'valid') {
          setSession(state.session);
        } else if (state.status === 'expired') {
          setExpired(true);
        }
      })
      .catch(() => {
        // Offline on launch is not a reason to throw the session away.
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const join = useCallback(async (inviteCode: string, name: string) => {
    const joined = await createGuestSession(inviteCode, name);
    setSession(joined);
    setExpired(false);
    return joined;
  }, []);

  const leave = useCallback(async () => {
    try {
      await leaveTableRequest();
    } finally {
      await clearGuestSession();
      setSession(null);
    }
  }, []);

  const dismissExpired = useCallback(() => setExpired(false), []);

  const value = useMemo(
    () => ({ session, restoring, expired, join, leave, dismissExpired }),
    [session, restoring, expired, join, leave, dismissExpired]
  );

  return <GuestContext value={value}>{children}</GuestContext>;
}

export function useGuest() {
  const guest = use(GuestContext);

  if (!guest) {
    throw new Error('useGuest must be used inside a GuestProvider');
  }
  return guest;
}
