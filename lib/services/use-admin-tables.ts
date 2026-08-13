import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { AdminTableSummary } from '@/lib/database';
import { listTableSummaries } from '@/lib/services/table-service';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { TableSummary } from '@/lib/types';

/** Maps a database row onto the shape `TableCard` draws. */
function toCard(row: AdminTableSummary): TableSummary {
  return {
    id: row.id ?? '',
    name: row.name ?? 'Table',
    restaurant: row.restaurant_name ?? '',
    peopleCount: row.people_count ?? 0,
    totalCents: row.total_cents ?? 0,
    currency: row.currency ?? 'EUR',
    status: row.status === 'COMPLETED' ? 'completed' : 'active',
  };
}

/**
 * Opens a table, carrying the details the table screen needs.
 *
 * The id is the important part: without it the screen falls back to local
 * placeholder data instead of the admin's real table.
 */
export function openTable(table: TableSummary) {
  router.push({
    pathname: '/table',
    params: { id: table.id, name: table.name, restaurant: table.restaurant },
  });
}

/** The signed-in admin's tables, ready for the dashboard cards. */
export function useAdminTables() {
  const [rows, setRows] = useState<AdminTableSummary[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      setRows(await listTableSummaries());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your tables.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { tables: rows.map(toCard), rawTables: rows, loading, error, reload };
}
