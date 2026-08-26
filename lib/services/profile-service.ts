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
