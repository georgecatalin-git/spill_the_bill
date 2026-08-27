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
