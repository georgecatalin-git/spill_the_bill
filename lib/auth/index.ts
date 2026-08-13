import type { AuthService } from '@/lib/auth/types';
import { supabaseAuthService } from '@/lib/services/auth-service';

/**
 * The auth service the app runs with.
 *
 * There is deliberately no offline fallback: a stand-in that quietly "signs
 * you in" would hide a missing configuration until something further down the
 * line behaved strangely. If the environment variables are absent, sign-in
 * fails with a clear message instead.
 */
export const authService: AuthService = supabaseAuthService;

export { isSupabaseConfigured } from '@/lib/supabase';
export { AuthError } from '@/lib/auth/types';
export type { AuthService, AuthUser } from '@/lib/auth/types';
