import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRealtimeBill } from '@/hooks/use-realtime-bill';
import {
  claimItem,
  getBillAssignmentSummary,
  getGuestClaims,
  getGuestEvenShares,
  getGuestReceiptPath,
  getGuestSettlements,
  getGuestTotals,
  getTipShares,
  updateClaimQuantity,
  type BillAssignmentSummary,
  type ClaimedBillItem,
  type EvenShare,
  type ParticipantTotal,
  type Settlement,
  type TipShare,
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
  const [tipShares, setTipShares] = useState<TipShare[]>([]);
  const [hasReceiptPhoto, setHasReceiptPhoto] = useState(false);
  const [evenShares, setEvenShares] = useState<EvenShare[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
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
      // One round of calls for the whole bill, not one per item.
      const [
        loadedItems,
        loadedTotals,
        loadedSummary,
        loadedTipShares,
        receiptPath,
        loadedEven,
        loadedSettlements,
      ] = await Promise.all([
        getGuestClaims(sessionToken),
        getGuestTotals(sessionToken),
        getBillAssignmentSummary(sessionToken),
        getTipShares(sessionToken),
        getGuestReceiptPath(sessionToken),
        getGuestEvenShares(sessionToken),
        // Read-only for a guest, and worth reading: it is how somebody knows
        // their own payment registered without having to ask.
        getGuestSettlements(sessionToken),
      ]);

      setItems(loadedItems);
      setTotals(loadedTotals);
      setSettlements(loadedSettlements);
      setSummary(loadedSummary);
      setTipShares(loadedTipShares);
      setHasReceiptPhoto(Boolean(receiptPath));
      setEvenShares(loadedEven);
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

    for (const person of people.values()) {
      person.settled = settlements.some(
        (row) => row.participant_id === person.id && row.settled
      );
    }

    return { localItems, claims, amounts, participants: [...people.values()] };
  }, [items, totals, settlements]);

  /**
   * What each person at the table owes, in the shape the cards read.
   *
   * The same arithmetic the admin's screen does, from the guest's own
   * authorised reads: `get_guest_totals` already returns everybody, including
   * anybody who has claimed nothing, and `item.claims` carries the per-person
   * amounts the database worked out. A guest sees these figures on the item
   * rows already — this only gathers them under a name.
   */
  const personTotals = useMemo(() => {
    const splitEven = evenShares.length > 0;
    const totalsByPerson: Record<
      string,
      {
        itemsCents: number;
        tipCents: number;
        totalCents: number;
        lines: {
          itemId: string;
          name: string;
          shares: number;
          amountCents: number;
          canAddMore: boolean;
        }[];
      }
    > = {};

    for (const person of view.participants) {
      if (splitEven) {
        const share =
          evenShares.find((row) => row.participant_id === person.id)?.share_cents ?? 0;
        totalsByPerson[person.id] = {
          itemsCents: share,
          tipCents: 0,
          totalCents: share,
          lines: [],
        };
        continue;
      }

      const lines = items
        .map((item) => {
          const mine = item.claims.find((entry) => entry.participant_id === person.id);
          return {
            itemId: item.id,
            name: item.name,
            shares: mine?.quantity ?? 0,
            amountCents: mine?.amount_cents ?? 0,
            // A guest changes their own selection on the receipt rows, not on
            // somebody's card. Nothing here offers a "+".
            canAddMore: false,
          };
        })
        .filter((line) => line.shares > 0);

      const itemsCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
      const tipCents =
        tipShares.find((row) => row.participant_id === person.id)?.tip_share_cents ?? 0;

      totalsByPerson[person.id] = {
        itemsCents,
        tipCents,
        totalCents: itemsCents + tipCents,
        lines,
      };
    }

    return totalsByPerson;
  }, [view.participants, items, tipShares, evenShares]);

  const me = totals.find((total) => total.is_me);
  const myTip = tipShares.find((share) => share.is_me);
  const myTipCents = myTip?.tip_share_cents ?? 0;

  // An even split answers the whole question on its own: the share already
  // covers items, tax, service and tip, so nothing is added to it.
  const splitEvenly = evenShares.length > 0;
  const myEvenShare = evenShares.find((share) => share.is_me)?.share_cents ?? 0;

  return {
    items,
    totals,
    summary,
    tipShares,
    evenShares,
    splitEvenly,
    hasReceiptPhoto,
    loading,
    error,
    connectionStatus,
    // Items plus this person's flat slice of the tip — the amount they
    // actually owe, not just what they claimed off the receipt.
    myTotalCents: splitEvenly ? myEvenShare : (me?.total_cents ?? 0) + myTipCents,
    myTipCents: splitEvenly ? 0 : myTipCents,
    myParticipantId: me?.participant_id ?? '',
    personTotals,
    ...view,
    reload: () => load(),
    claim,
    release,
    clearError: () => setError(null),
  };
}
