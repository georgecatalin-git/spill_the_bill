import { useCallback, useEffect, useState } from 'react';

import { useRealtimeBill } from '@/hooks/use-realtime-bill';
import type { Bill, BillClaimDetail, BillItem, BillSummary, BillTipShareRow } from '@/lib/database';
import {
  adminClaimItem,
  adminUpdateClaimQuantity,
  getAdminParticipantId,
} from '@/lib/services/claim-service';
import { getBillClaimDetails, getBillTipShares } from '@/lib/services/overview-service';
import { listParticipants } from '@/lib/services/table-service';
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
      const [items, summary, blocker, details, people, meId, tipShares] = await Promise.all([
        getBillItems(bill.id),
        getBillSummary(bill.id),
        getCompletionBlocker(bill.id),
        getBillClaimDetails(bill.id),
        listParticipants(tableId),
        getAdminParticipantId(tableId),
        getBillTipShares(bill.id),
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
        })),
        myParticipantId: meId ?? '',
        tipShares,
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
  const myTipCents =
    state.tipShares.find((share) => share.participant_id === state.myParticipantId)
      ?.tip_share_cents ?? 0;

  // Items plus this admin's own flat slice of the tip — they eat at their own
  // table too, and owe the same tip share as everyone else active there.
  const myTotalCents = myItemsCents + myTipCents;

  return {
    ...state,
    connectionStatus,
    myTipCents,
    reload: () => load(),
    addItem,
    editItem,
    removeItem,
    saveTotals,
    start,
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
