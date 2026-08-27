import { useCallback, useEffect, useState } from 'react';

import type { AdminAccount } from '@/lib/database';
import { listAdminAccounts } from '@/lib/services/restaurant-service';
import { isSupabaseConfigured } from '@/lib/supabase';

/** Every account and the restaurant it belongs to, for the owner area. */
export function useAdminAccounts() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      setAccounts(await listAdminAccounts());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { accounts, loading, error, reload };
}
