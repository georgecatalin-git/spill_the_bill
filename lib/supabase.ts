import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from '@/lib/auth-storage';
import type { Database } from '@/lib/database/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * True when both environment variables are present.
 *
 * The app falls back to the mock auth service when they are missing, so the
 * project still runs for anyone who has not set up a Supabase project yet.
 */
export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

/**
 * Supabase client for this app.
 *
 * Sessions are persisted through the platform's store (see `auth-storage`):
 * `expo-sqlite/kv-store` on native, `localStorage` on web. URL session
 * detection is off because this is a native app, not a browser.
 */
export const supabase = createClient<Database>(supabaseUrl ?? '', supabasePublishableKey ?? '', {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase refreshes tokens on a timer, which native platforms suspend in the
// background. Tie the timer to the foreground so it does not fire while asleep.
if (Platform.OS !== 'web' && isSupabaseConfigured()) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
