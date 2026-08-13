import Storage from 'expo-sqlite/kv-store';
import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Where the Supabase session is kept on native.
 *
 * `expo-sqlite/kv-store` is the Expo key/value store with an AsyncStorage-shaped
 * API. The web build uses `auth-storage.web.ts` instead, because SQLite on web
 * needs a WASM asset the bundler would have to be taught about for no gain.
 */
export const authStorage: SupportedStorage = Storage;
