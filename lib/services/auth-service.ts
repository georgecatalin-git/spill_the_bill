import type { Session, User } from '@supabase/supabase-js';

import { AuthError, type AuthService, type AuthUser } from '@/lib/auth/types';
import { toAuthError } from '@/lib/services/auth-errors';
import { supabase } from '@/lib/supabase';

/**
 * Supabase-backed authentication, for admins only.
 *
 * Guests never pass through here — they join a table with a name and no
 * account, which is what keeps the invitation flow frictionless.
 */

/** Falls back to the email handle so the dashboard always has something to greet. */
function toAuthUser(user: User): AuthUser {
  const name =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email?.split('@')[0] ||
    'there';

  return {
    id: user.id,
    name,
    email: user.email ?? '',
    isGuest: Boolean((user as { is_anonymous?: boolean }).is_anonymous),
  };
}

export async function signUpAdmin(name: string, email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (error) throw error;
    if (!data.user) {
      throw new AuthError('We could not create your account. Please try again.');
    }

    // With email confirmation switched on, Supabase returns a user but no
    // session. Say so rather than dropping the admin on an empty dashboard.
    if (!data.session) {
      throw new AuthError('Check your inbox to confirm your email, then log in.');
    }

    return toAuthUser(data.user);
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function signInAdmin(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) throw error;
    return toAuthUser(data.user);
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function signOutAdmin() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    throw toAuthError(error);
  }
}

/** The admin from the stored session, or null when nobody is signed in. */
export async function getCurrentAdmin() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    return data.session?.user ? toAuthUser(data.session.user) : null;
  } catch {
    // A broken or expired stored session is not worth an error screen on
    // launch; treat it as signed out.
    return null;
  }
}

export async function resetAdminPassword(email: string) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) throw error;
  } catch (error) {
    throw toAuthError(error);
  }
}

/**
 * A session for somebody who has nothing: no app until a minute ago, no
 * account, no intention of making one.
 *
 * This is the customer who sat down, scanned the sticker on the table and
 * wants to split a bill. Asking them to sign up first would lose most of them
 * at the one moment the app has to work, so they get a real Supabase user with
 * no email and no password instead. Everything downstream is unchanged: RLS
 * sees an ordinary `auth.uid()`, and they see their own table and nothing else.
 *
 * `full_name` starts as whatever `handle_new_user` could infer — "there" — and
 * is replaced the moment they type a name.
 *
 * Requires Anonymous sign-ins to be enabled on the Supabase project; without
 * it the API refuses with `anonymous_provider_disabled`, and the message says
 * so rather than blaming the person.
 */
export async function signInAnonymously(): Promise<AuthUser> {
  try {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) throw error;
    if (!data.user) {
      throw new AuthError('Could not start a session. Please try again.');
    }

    return toAuthUser(data.user);
  } catch (caught) {
    const code = (caught as { code?: string })?.code;

    if (code === 'anonymous_provider_disabled') {
      throw new AuthError(
        'Guest sessions are switched off on this server. Enable anonymous sign-ins in Supabase.'
      );
    }
    throw toAuthError(caught);
  }
}

/** Keeps the app in step with sign-ins, sign-outs and token refreshes. */
export function onAdminAuthStateChange(listener: (user: AuthUser | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
    listener(session?.user ? toAuthUser(session.user) : null);
  });

  return () => data.subscription.unsubscribe();
}

export const supabaseAuthService: AuthService = {
  signIn: signInAdmin,
  signUp: signUpAdmin,
  signOut: signOutAdmin,
  signInAnonymously,
  getCurrentUser: getCurrentAdmin,
  resetPassword: resetAdminPassword,
  onAuthStateChange: onAdminAuthStateChange,
};
