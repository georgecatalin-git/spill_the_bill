import { supabase } from '@/lib/supabase';

/**
 * The admin's first-run tutorial state, kept on their profile row.
 *
 * RLS already restricts profiles to `id = auth.uid()` for authenticated users
 * and gives anon no policy at all, so an admin can only ever reach their own
 * flag and a guest can reach none.
 */

export class OnboardingServiceError extends Error {}

/**
 * Whether this admin has finished or skipped the tutorial.
 *
 * Returns null when the answer is not knowable right now — no session, or the
 * profile row has not been mirrored yet. The caller treats that as "don't
 * decide", so a transient failure never burns the one automatic showing.
 */
export async function getOnboardingCompleted(): Promise<boolean | null> {
  const { data: userData } = await supabase.auth.getUser();
  const adminId = userData.user?.id;

  if (!adminId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', adminId)
    .maybeSingle();

  if (error) throw new OnboardingServiceError('Could not load your tutorial state.');
  return data ? data.onboarding_completed : null;
}

/** Records that the admin is done with the tutorial, whether finished or skipped. */
export async function markOnboardingCompleted(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const adminId = userData.user?.id;

  if (!adminId) {
    throw new OnboardingServiceError('Please log in again.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', adminId);

  if (error) throw new OnboardingServiceError('Could not save your tutorial state.');
}
