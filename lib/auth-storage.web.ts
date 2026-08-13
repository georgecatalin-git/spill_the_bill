import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * On web, leaving this undefined lets supabase-js fall back to `localStorage`,
 * which is the right store for a browser and keeps SQLite out of the bundle.
 */
export const authStorage: SupportedStorage | undefined = undefined;
