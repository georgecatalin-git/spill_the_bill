import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { AuthError, authService, type AuthUser } from '@/lib/auth';
import type { ProfileRole } from '@/lib/database';
import { getProfile } from '@/lib/services/profile-service';

type AuthContextValue = {
  user: AuthUser | null;
  /**
   * What this account is allowed to be. Read from the profile row, and
   * `admin` until proven otherwise — a failed read must never hand out the
   * owner area. The database refuses owner reads regardless of this value.
   */
  role: ProfileRole;
  /** True while the stored session is being restored on launch. */
  restoring: boolean;
  pending: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the signed-in admin for the whole app.
 *
 * On launch it restores any stored session, then follows the auth provider for
 * sign-ins, sign-outs and token refreshes. Guests never touch any of this.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<ProfileRole>('admin');
  const [restoring, setRestoring] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    authService.getCurrentUser().then((restored) => {
      if (cancelled) return;

      setUser(restored);
      setRestoring(false);
    });

    // Covers sign-out from another screen, expired sessions and refreshes.
    const unsubscribe = authService.onAuthStateChange((next) => {
      if (!cancelled) setUser(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // The role lives on the profile row, not in the auth session, so it is
  // fetched separately whenever the signed-in account changes.
  useEffect(() => {
    if (!user) {
      setRole('admin');
      return;
    }

    let cancelled = false;

    getProfile()
      .then((profile) => {
        if (!cancelled) setRole(profile?.role === 'owner' ? 'owner' : 'admin');
      })
      .catch(() => {
        // Staying an admin is the harmless direction to fail.
        if (!cancelled) setRole('admin');
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const run = useCallback(async (action: () => Promise<AuthUser>) => {
    setPending(true);
    setError(null);

    try {
      setUser(await action());
      return true;
    } catch (caught) {
      setError(
        caught instanceof AuthError ? caught.message : 'Something went wrong. Please try again.'
      );
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const signIn = useCallback(
    (email: string, password: string) => run(() => authService.signIn(email, password)),
    [run]
  );

  const signUp = useCallback(
    (name: string, email: string, password: string) =>
      run(() => authService.signUp(name, email, password)),
    [run]
  );

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
    } finally {
      // Even if the provider call fails, this device should end up signed out.
      setUser(null);
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    setPending(true);
    setError(null);

    try {
      await authService.resetPassword(email);
      return true;
    } catch (caught) {
      setError(
        caught instanceof AuthError ? caught.message : 'Something went wrong. Please try again.'
      );
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      user,
      role,
      restoring,
      pending,
      error,
      signIn,
      signUp,
      signOut,
      resetPassword,
      clearError,
    }),
    [user, role, restoring, pending, error, signIn, signUp, signOut, resetPassword, clearError]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const auth = use(AuthContext);

  if (!auth) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return auth;
}
