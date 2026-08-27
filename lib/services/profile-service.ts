import type { Profile } from '@/lib/database';
import { supabase } from '@/lib/supabase';

/**
 * The signed-in admin's own profile row.
 *
 * This is where `role` lives, and the role is what decides whether the owner
 * area exists for this account. RLS restricts profiles to `id = auth.uid()`,
 * so this can only ever return the caller's own row.
 */

export class ProfileServiceError extends Error {}

function toFriendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return new ProfileServiceError('No connection. Please check your internet and try again.');
  }
  return new ProfileServiceError(fallback);
}

/**
 * Returns null when nobody is signed in, or when the profile row has not been
 * mirrored from auth.users yet. Callers treat null as "not an owner" — the
 * safe direction, and the database refuses owner reads regardless.
 */
export async function getProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const adminId = userData.user?.id;

  if (!adminId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select()
    .eq('id', adminId)
    .maybeSingle();

  if (error) throw toFriendlyError(error, 'Could not load your profile.');
  return data;
}

/**
 * Deletes the signed-in account: the login, the name, the email.
 *
 * The tables this account opened are NOT deleted. They belong to the
 * restaurant, and the figures behind them are what the owner area exists to
 * show — losing months of a restaurant's activity because a waiter left would
 * be the wrong thing to do to somebody who is still a customer.
 *
 * The session is dead the moment this returns, so the caller signs out rather
 * than leaving the app holding a token for an account that no longer exists.
 */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');

  if (error) {
    if (error.message.includes('owner account cannot')) {
      throw new ProfileServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not delete your account.');
  }
}

/**
 * Records the name somebody typed for themselves.
 *
 * For the customer who arrived through a scanned code: `handle_new_user` had
 * no email to infer a name from and settled for "there", which is nobody. The
 * first time they name themselves, that is who they are.
 *
 * `full_name` is one of the two columns `authenticated` may write on its own
 * profile — the rest were revoked so an account cannot promote itself or move
 * to another restaurant.
 */
export async function setMyName(name: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const id = userData.user?.id;

  if (!id) return;

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: name.trim() })
    .eq('id', id);

  // Not worth failing a table over: the name shows on the participant row
  // either way, and this only keeps the profile in step.
  if (error) console.warn('Could not save the name on the profile:', error.message);
}
