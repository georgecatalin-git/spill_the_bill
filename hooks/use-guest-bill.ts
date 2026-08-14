import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRealtimeBill } from '@/hooks/use-realtime-bill';
import {
  claimItem,
  getBillAssignmentSummary,
  getGuestClaims,
  getGuestTotals,
  updateClaimQuantity,
  type BillAssignmentSummary,
  type ClaimedBillItem,
  type ParticipantTotal,
} from '@/lib/services/claim-service';
import type { BillItem, ClaimMap, Participant } from '@/lib/types';

/**
 * The guest's view of the shared receipt.
 *
 * Supabase stays authoritative: after every claim the whole state is reloaded,
 * so the numbers on screen are the ones the database worked out rather than a
 * local guess that could drift.
 */
export function useGuestBill(sessionToken: string | undefined) {
  const [items, setItems] = useState<ClaimedBillItem[]>([]);
  const [totals, setTotals] = useState<ParticipantTotal[]>([]);
  const [summary, setSummary] = useState<BillAssignmentSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionToken));
  const [error, setError] = useState<string | null>(null);

  /**
   * `keepError` matters: the reload that follows a failed claim must not wipe
   * the message explaining why it failed.
   */
  const load = useCallback(async (keepError = false) => {
    if (!sessionToken) return;

    if (!keepError) setError(null);

    try {
      // Three calls for the whole bill, not one per item.
      const [loadedItems, loadedTotals, loadedSummary] = await Promise.all([
        getGuestClaims(sessionToken),
        getGuestTotals(sessionToken),
        getBillAssignmentSummary(sessionToken),
      ]);

      setItems(loadedItems);
      setTotals(loadedTotals);
      setSummary(loadedSummary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the bill.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    load();
  }, [load]);

  // The bill id arrives with the first summary; before that there is nothing
  // to subscribe to. `keepError` is on, because a background reload must not
  // wipe the reason a claim was just refused.
  const { connectionStatus } = useRealtimeBill(summary?.billId, () => load(true));

  const mutate = useCallback(
    async (action: () => Promise<void>) => {
      if (!sessionToken) return;

      setError(null);
      let failed = false;

      try {
        await action();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Something went wrong.');
        failed = true;
      } finally {
        // Reload either way: a rejected claim still means the screen was stale.
        await load(failed);
      }
    },
    [sessionToken, load]
  );

  const claim = useCallback(
    (billItemId: string) => mutate(() => claimItem(sessionToken as string, billItemId, 1)),
    [mutate, sessionToken]
  );

  const release = useCallback(
    (billItemId: string) => {
      const held = items.find((item) => item.id === billItemId)?.my_quantity ?? 0;
      return mutate(() =>
        updateClaimQuantity(sessionToken as string, billItemId, Math.max(0, held - 1))
      );
    },
    [mutate, sessionToken, items]
  );

  /** Shapes the server data for the row components, which are shared with the admin views. */
  const view = useMemo(() => {
    const localItems: BillItem[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity,
    }));

    const claims: ClaimMap = {};
    const amounts: Record<string, Record<string, number>> = {};
    const people = new Map<string, Participant>();

    for (const item of items) {
      claims[item.id] = {};
      amounts[item.id] = {};

      for (const entry of item.claims) {
        claims[item.id][entry.participant_id] = entry.quantity;
        amounts[item.id][entry.participant_id] = entry.amount_cents;
        people.set(entry.participant_id, {
          id: entry.participant_id,
          name: entry.participant_name,
        });
      }
    }

    // Everyone at the table, so people who have not picked anything still show.
    for (const total of totals) {
      if (!people.has(total.participant_id)) {
        people.set(total.participant_id, {
          id: total.participant_id,
          name: total.participant_name,
        });
      }
    }

    return { localItems, claims, amounts, participants: [...people.values()] };
  }, [items, totals]);

  const me = totals.find((total) => total.is_me);

  return {
    items,
    totals,
    summary,
    loading,
    error,
    connectionStatus,
    myTotalCents: me?.total_cents ?? 0,
    myParticipantId: me?.participant_id ?? '',
    ...view,
    reload: () => load(),
    claim,
    release,
    clearError: () => setError(null),
  };
}
