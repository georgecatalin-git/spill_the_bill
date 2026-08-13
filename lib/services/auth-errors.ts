import { AuthError as SupabaseAuthError, isAuthApiError } from '@supabase/supabase-js';

import { AuthError } from '@/lib/auth/types';
import { isSupabaseConfigured } from '@/lib/supabase';

/** Supabase error codes mapped to something a person can act on. */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please confirm your email address first.',
  user_already_exists: 'That email is already registered. Try logging in.',
  email_exists: 'That email is already registered. Try logging in.',
  weak_password: 'Please choose a stronger password of at least 6 characters.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  // The built-in Supabase mailer allows only a couple of emails per hour, so
  // this is an hour-long wait, not a moment.
  over_email_send_rate_limit:
    'The email limit for this project was reached. Please try again in about an hour.',
  // Raised when the Email provider is switched off in the Supabase dashboard.
  email_provider_disabled: 'Email sign-in is unavailable right now. Please try again later.',
  session_expired: 'Your session has expired. Please log in again.',
  refresh_token_not_found: 'Your session has expired. Please log in again.',
  validation_failed: 'Please check the details you entered.',
};

const NETWORK_MESSAGE = 'No connection. Please check your internet and try again.';
const UNAVAILABLE_MESSAGE = 'We could not reach the server. Please try again shortly.';
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

function looksLikeNetworkFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('timeout')
  );
}

/**
 * Turns anything thrown by Supabase into an `AuthError` carrying a friendly
 * message, so screens never surface raw provider errors.
 */
export function toAuthError(error: unknown) {
  if (error instanceof AuthError) return error;

  if (!isSupabaseConfigured()) {
    return new AuthError('This app is not connected to a server yet.');
  }

  if (looksLikeNetworkFailure(error)) {
    return new AuthError(NETWORK_MESSAGE);
  }

  if (isAuthApiError(error)) {
    const known = error.code ? MESSAGES[error.code] : undefined;
    if (known) return new AuthError(known);

    // 5xx means Supabase itself is having trouble, not the credentials.
    if (error.status && error.status >= 500) {
      return new AuthError(UNAVAILABLE_MESSAGE);
    }
    return new AuthError(FALLBACK_MESSAGE);
  }

  if (error instanceof SupabaseAuthError) {
    const known = error.code ? MESSAGES[error.code] : undefined;
    return new AuthError(known ?? FALLBACK_MESSAGE);
  }

  return new AuthError(FALLBACK_MESSAGE);
}
