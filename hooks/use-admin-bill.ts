import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRealtimeBill } from '@/hooks/use-realtime-bill';
import type {
  Bill,
  BillClaimDetail,
  BillEvenShareRow,
  BillItem,
  BillSummary,
  BillTipShareRow,
  SplitMode,
} from '@/lib/database';
import {
  adminClaimItem,
  adminUpdateClaimQuantity,
  getAdminParticipantId,
  splitRemainingEvenly,
  assignItemTo,
} from '@/lib/services/claim-service';
import {
  getBillClaimDetails,
  getBillEvenShares,
  getBillTipShares,
} from '@/lib/services/overview-service';
import { listParticipants, setParticipantSettled } from '@/lib/services/table-service';
import type { ClaimMap, Participant } from '@/lib/types';
import {
  createBillItem,
  deleteBillItem,
  getBillItems,
  updateBillItem,
  type BillItemInput,
} from '@/lib/services/bill-item-service';
import {
  completeBill as completeBillRequest,
  getBillSummary,
  getCompletionBlocker,
  getOrCreateActiveBill,
  setBillSplitMode,
  startBill as startBillRequest,
  updateBillTotals,
  type BillTotalsInput,
} from '@/lib/services/bill-service';

type State = {
  bill: Bill | null;
  items: BillItem[];
  summary: BillSummary | null;
  loading: boolean;
  error: string | null;
  /** Why the bill cannot be closed yet, or null when it can. */
  blocker: string | null;
  /** Who claimed what, so the admin can pick their own items too. */
  claims: ClaimMap;
  amounts: Record<string, Record<string, number>>;
  participants: Participant[];
  myParticipantId: string;
  /** Everyone's flat slice of the tip, split by headcount. */
  tipShares: BillTipShareRow[];
  /** Everyone's share when the whole bill is divided evenly. Empty otherwise. */
  evenShares: BillEvenShareRow[];
};

/**
 * The admin's live bill for one table.
 *
 * Supabase stays the source of truth: every mutation is followed by a reload
 * of the affected data, so the totals on screen are the ones the database
 * computed rather than a guess made here.
 */
export function useAdminBill(tableId: string | undefined) {
  const [state, setState] = useState<State>({
    bill: null,
    items: [],
    summary: null,
    loading: Boolean(tableId),
    error: null,
    blocker: 'There is nothing on this bill yet.',
    claims: {},
    amounts: {},
    participants: [],
    myParticipantId: '',
    tipShares: [],
    evenShares: [],
  });

  /**
   * `silent` is for reloads nobody asked for — the ones realtime triggers.
   * They must not raise the spinner over a screen that is already showing
   * figures, nor wipe the message explaining why the last action failed.
   */
  const load = useCallback(async (silent = false) => {
    if (!tableId) return;

    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const bill = await getOrCreateActiveBill(tableId);
      const [items, summary, blocker, details, people, meId, tipShares, evenShares] =
        await Promise.all([
          getBillItems(bill.id),
          getBillSummary(bill.id),
          getCompletionBlocker(bill.id),
          getBillClaimDetails(bill.id),
          listParticipants(tableId),
          getAdminParticipantId(tableId),
          getBillTipShares(bill.id),
          getBillEvenShares(bill.id),
        ]);

      setState((current) => ({
        bill,
        items,
        summary,
        loading: false,
        error: silent ? current.error : null,
        blocker,
        ...shapeClaims(details),
        participants: people.map((person) => ({
          id: person.id ?? '',
          name: person.name ?? '',
          isAdmin: person.is_admin ?? false,
          settled: Boolean(person.settled_at),
        })),
        myParticipantId: meId ?? '',
        tipShares,
        evenShares,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load the bill.',
      }));
    }
  }, [tableId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live from here on. The bill id only exists after the first load, which is
  // the right order anyway: realtime says what changed, it never says what the
  // state is, so there has to be a state to update.
  const { connectionStatus } = useRealtimeBill(state.bill?.id, () => load(true));

  /** Runs a mutation, then reloads so the totals come back from the server. */
  const mutate = useCallback(
    async (action: (billId: string) => Promise<unknown>) => {
      if (!state.bill) return false;

      try {
        await action(state.bill.id);
        await load();
        return true;
      } catch (error) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : 'Something went wrong.',
        }));
        return false;
      }
    },
    [state.bill, load]
  );

  const addItem = useCallback(
    (input: BillItemInput) => mutate((billId) => createBillItem(billId, input)),
    [mutate]
  );

  /**
   * Adds an item already on somebody's share.
   *
   * The two halves exist separately — `createBillItem` and the host's claim —
   * but a waiter taking an order does one thing, not two: "a beer for
   * George" is a single act, and splitting it across two screens is how the
   * order gets written down and then forgotten.
   *
   * Reloads once at the end rather than after each half, so the table does not
   * flicker through a state where the beer exists and belongs to nobody.
   */
  const addItemFor = useCallback(
    async (input: BillItemInput, participantId: string) => {
      if (!state.bill) return false;

      try {
        const item = await createBillItem(state.bill.id, input);
        await assignItemTo(item.id, participantId, input.quantity);
        await load();
        return true;
      } catch (error) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : 'Something went wrong.',
        }));
        return false;
      }
    },
    [state.bill, load]
  );

  const editItem = useCallback(
    (itemId: string, input: BillItemInput) => mutate(() => updateBillItem(itemId, input)),
    [mutate]
  );

  const removeItem = useCallback(
    (itemId: string) => mutate(() => deleteBillItem(itemId)),
    [mutate]
  );

  const saveTotals = useCallback(
    (input: BillTotalsInput) => mutate((billId) => updateBillTotals(billId, input)),
    [mutate]
  );

  const start = useCallback(() => mutate((billId) => startBillRequest(billId)), [mutate]);

  const setSplitMode = useCallback(
    (mode: SplitMode) => mutate((billId) => setBillSplitMode(billId, mode)),
    [mutate]
  );

  const finish = useCallback(() => mutate((billId) => completeBillRequest(billId)), [mutate]);

  const claim = useCallback(
    (billItemId: string) => mutate(() => adminClaimItem(billItemId, 1)),
    [mutate]
  );

  const release = useCallback(
    (billItemId: string) => {
      const held = state.claims[billItemId]?.[state.myParticipantId] ?? 0;
      return mutate(() => adminUpdateClaimQuantity(billItemId, Math.max(0, held - 1)));
    },
    [mutate, state.claims, state.myParticipantId]
  );

  const clearError = useCallback(
    () => setState((current) => ({ ...current, error: null })),
    []
  );

  // What the admin personally owes — they eat at their own table too.
  const myBreakdown = state.items
    .map((item) => ({
      item: {
        id: item.id,
        name: item.name,
        unitPriceCents: item.unit_price_cents,
        quantity: item.quantity,
      },
      shares: state.claims[item.id]?.[state.myParticipantId] ?? 0,
      amountCents: state.amounts[item.id]?.[state.myParticipantId] ?? 0,
    }))
    .filter((entry) => entry.shares > 0);

  const myItemsCents = myBreakdown.reduce((sum, entry) => sum + entry.amountCents, 0);
  const rawTipCents =
    state.tipShares.find((share) => share.participant_id === state.myParticipantId)
      ?.tip_share_cents ?? 0;

  // An even split already covers items, tax, service and tip, so it replaces
  // the per-item arithmetic rather than adding to it.
  const splitEvenly = state.bill?.split_mode === 'EVENLY';
  const myEvenShare =
    state.evenShares.find((share) => share.participant_id === state.myParticipantId)
      ?.share_cents ?? 0;

  const myTipCents = splitEvenly ? 0 : rawTipCents;

  // The admin eats at their own table too, and owes the same share as anyone
  // else active there.
  const myTotalCents = splitEvenly ? myEvenShare : myItemsCents + myTipCents;

  /**
   * What each person at the table owes, the same arithmetic the admin's own
   * total uses, done for everybody.
   *
   * Read from `amounts`, which is `item_claim_shares` — the database's own
   * largest-remainder answer — rather than recomputed here. Somebody who has
   * claimed nothing is still in this map at zero: `bill_participant_totals`
   * inner-joins the shares and drops them entirely, and a person missing from
   * the list is a person nobody remembers to collect from.
   */
  const personTotals = useMemo(() => {
    const totals: Record<string, { itemsCents: number; tipCents: number; totalCents: number }> = {};

    for (const person of state.participants) {
      // An even split already covers items, tax, service and tip, so it
      // replaces this arithmetic rather than adding to it.
      if (splitEvenly) {
        const share =
          state.evenShares.find((row) => row.participant_id === person.id)?.share_cents ?? 0;
        totals[person.id] = { itemsCents: share, tipCents: 0, totalCents: share };
        continue;
      }

      const itemsCents = state.items.reduce(
        (sum, item) => sum + (state.amounts[item.id]?.[person.id] ?? 0),
        0
      );
      const tipCents =
        state.tipShares.find((row) => row.participant_id === person.id)?.tip_share_cents ?? 0;

      totals[person.id] = { itemsCents, tipCents, totalCents: itemsCents + tipCents };
    }

    return totals;
  }, [state.participants, state.items, state.amounts, state.tipShares, state.evenShares, splitEvenly]);

  /**
   * Records that somebody has paid, then reloads rather than flipping the row
   * here — the database stays the one that says who has settled, and everyone
   * else's screen hears about it on the same channel.
   */
  const setSettled = useCallback(
    async (participantId: string, settled: boolean) => {
      await setParticipantSettled(participantId, settled);
      await load();
    },
    [load]
  );

  /**
   * Everyone still at the table shares what nobody claimed. The set is not a
   * choice in the UI on purpose: the case this exists for is "we have no idea",
   * and asking who was drinking re-opens the argument it is meant to end.
   */
  const splitRestOfItem = useCallback(
    async (billItemId: string) => {
      const ids = state.participants.map((p) => p.id);
      await splitRemainingEvenly(billItemId, ids);
      await load();
    },
    [state.participants, load]
  );

  /**
   * One more of this item on that person's share. Tapping is how a host works
   * through a round — "another beer for Bogdan" — so it adds rather than sets.
   */
  const assignOne = useCallback(
    async (billItemId: string, participantId: string) => {
      const held = state.claims[billItemId]?.[participantId] ?? 0;
      await assignItemTo(billItemId, participantId, held + 1);
      await load();
    },
    [state.claims, load]
  );

  return {
    ...state,
    connectionStatus,
    splitEvenly,
    splitRestOfItem,
    assignOne,
    personTotals,
    setSettled,
    myTipCents,
    reload: () => load(),
    addItem,
    addItemFor,
    editItem,
    removeItem,
    saveTotals,
    start,
    setSplitMode,
    finish,
    claim,
    release,
    clearError,
    myBreakdown,
    myTotalCents,
  };
}

/** Turns the flat claim rows into the maps the receipt rows read. */
function shapeClaims(details: BillClaimDetail[]) {
  const claims: ClaimMap = {};
  const amounts: Record<string, Record<string, number>> = {};

  for (const row of details) {
    const itemId = row.bill_item_id ?? '';
    const personId = row.participant_id ?? '';

    claims[itemId] ??= {};
    amounts[itemId] ??= {};
    claims[itemId][personId] = row.claimed_quantity ?? 0;
    amounts[itemId][personId] = row.amount_cents ?? 0;
  }

  return { claims, amounts };
}
