import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getOnboardingCompleted, markOnboardingCompleted } from '@/lib/services/onboarding-service';
import { useAuth } from '@/providers/auth-provider';

type OnboardingContextValue = {
  /** True while the tutorial has not been shown yet and the admin has never seen it. */
  shouldAutoStart: boolean;
  /** Claims the one automatic showing, so moving between tabs cannot re-open it. */
  claimAutoStart: () => void;
  /** Records that the tutorial was finished or skipped. */
  finish: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Tracks whether the signed-in admin has been through the first-run tutorial.
 *
 * The flag lives on their profile row rather than on the device, so a second
 * phone does not replay a tutorial they have already seen. Guests never reach
 * this: they have no account, so `user` stays null and nothing is ever read.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [completed, setCompleted] = useState<boolean | null>(null);
  const [autoStartClaimed, setAutoStartClaimed] = useState(false);

  useEffect(() => {
    if (!user) {
      // Signing out clears the answer so the next admin is read fresh.
      setCompleted(null);
      setAutoStartClaimed(false);
      return;
    }

    let cancelled = false;

    getOnboardingCompleted()
      .then((value) => {
        if (!cancelled) setCompleted(value);
      })
      .catch(() => {
        // Leaving this unknown means the tutorial simply does not open. A
        // network blip is not a reason to interrupt someone mid-meal, and the
        // read is retried the next time they sign in.
        if (!cancelled) setCompleted(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const claimAutoStart = useCallback(() => setAutoStartClaimed(true), []);

  const finish = useCallback(() => {
    setCompleted(true);

    // Not awaited, and a failure is not surfaced: the admin has already left
    // the tutorial by now. If the write did not land, the tutorial offers
    // itself once more next launch, which is the harmless direction to fail.
    markOnboardingCompleted().catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      shouldAutoStart: completed === false && !autoStartClaimed,
      claimAutoStart,
      finish,
    }),
    [completed, autoStartClaimed, claimAutoStart, finish]
  );

  return <OnboardingContext value={value}>{children}</OnboardingContext>;
}

export function useOnboarding() {
  const onboarding = use(OnboardingContext);

  if (!onboarding) {
    throw new Error('useOnboarding must be used inside an OnboardingProvider');
  }
  return onboarding;
}
