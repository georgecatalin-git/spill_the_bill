import type { Bill, BillSummary, BillUpdate } from '@/lib/database';
import { supabase } from '@/lib/supabase';

/**
 * Admin-side bill operations.
 *
 * Everything here runs as the signed-in admin and goes through RLS, so a bill
 * belonging to another admin is simply not visible.
 */

export class BillServiceError extends Error {}

/** A bill still being worked on, as opposed to one that is closed. */
const ACTIVE_STATUSES = ['DRAFT', 'OPEN', 'FULLY_ASSIGNED'] as const;

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message ?? '');
  }
  return '';
}

function toFriendlyError(error: unknown, fallback: string) {
  if (error instanceof BillServiceError) return error;

  const message = messageOf(error);
  const lower = message.toLowerCase();

  if (lower.includes('network request failed') || lower.includes('failed to fetch')) {
    return new BillServiceError('No connection. Please check your internet and try again.');
  }

  // Messages raised by the database functions are already people-facing.
  if (
    message.includes('have not been claimed') ||
    message.includes('do not add up') ||
    message.includes('nothing on this bill') ||
    message.includes('total has not been set') ||
    message.includes('claimed more times') ||
    message.includes('Add at least one item') ||
    message.includes('total must be greater than zero') ||
    message.includes('already been selected') ||
    message.includes('Only the admin')
  ) {
    return new BillServiceError(message);
  }

  return new BillServiceError(fallback);
}

/** The table's open bill, or null when it has none. */
export async function getActiveBill(tableId: string): Promise<Bill | null> {
  const { data, error } = await supabase
    .from('bills')
    .select()
    .eq('table_id', tableId)
    .in('status', ACTIVE_STATUSES as unknown as string[])
    .maybeSingle();

  if (error) throw toFriendlyError(error, 'Could not load the bill.');
  return data;
}

export async function getBill(billId: string): Promise<Bill | null> {
  const { data, error } = await supabase.from('bills').select().eq('id', billId).maybeSingle();

  if (error) throw toFriendlyError(error, 'Could not load the bill.');
  return data;
}

export async function createBill(tableId: string, currency = 'EUR'): Promise<Bill> {
  const { data, error } = await supabase
    .from('bills')
    .insert({ table_id: tableId, currency })
    .select()
    .single();

  if (error) throw toFriendlyError(error, 'Could not create the bill.');
  return data;
}

/**
 * The single entry point screens should use.
 *
 * A table may only have one open bill — the database enforces that with a
 * partial unique index — so an existing one is loaded rather than duplicated.
 * If two devices race, the loser's insert fails and we read the winner's row.
 */
export async function getOrCreateActiveBill(tableId: string, currency = 'EUR'): Promise<Bill> {
  const existing = await getActiveBill(tableId);
  if (existing) return existing;

  try {
    return await createBill(tableId, currency);
  } catch (error) {
    if (messageOf(error).includes('bills_one_active_per_table_idx')) {
      const raced = await getActiveBill(tableId);
      if (raced) return raced;
    }
    throw error;
  }
}

export type BillTotalsInput = {
  taxCents?: number;
  serviceChargeCents?: number;
  tipCents?: number;
  /** null clears the override and returns to the computed total. */
  confirmedTotalCents?: number | null;
  currency?: string;
};

/**
 * Updates the parts of the bill the admin controls.
 *
 * `subtotal_cents` and `total_cents` are deliberately not writable here: the
 * database derives them from the items and these values.
 */
export async function updateBillTotals(billId: string, input: BillTotalsInput): Promise<Bill> {
  const patch: BillUpdate = {};

  if (input.taxCents !== undefined) patch.tax_cents = input.taxCents;
  if (input.serviceChargeCents !== undefined) patch.service_charge_cents = input.serviceChargeCents;
  if (input.tipCents !== undefined) patch.tip_cents = input.tipCents;
  if (input.confirmedTotalCents !== undefined) patch.confirmed_total_cents = input.confirmedTotalCents;
  if (input.currency !== undefined) patch.currency = input.currency;

  const { data, error } = await supabase
    .from('bills')
    .update(patch)
    .eq('id', billId)
    .select()
    .single();

  if (error) throw toFriendlyError(error, 'Could not save the bill totals.');
  return data;
}

/** Opens the bill for the table. The server checks items exist and the total is positive. */
export async function startBill(billId: string): Promise<Bill> {
  const { data, error } = await supabase.rpc('start_bill', { p_bill_id: billId });

  if (error) throw toFriendlyError(error, 'Could not start the bill.');
  return data as unknown as Bill;
}

/** Why the bill cannot be closed yet, or null when it can. */
export async function getCompletionBlocker(billId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('validate_bill_completion', { p_bill_id: billId });

  if (error) throw toFriendlyError(error, 'Could not check the bill.');

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return 'Could not check the bill.';

  return row.is_valid ? null : (row.reason ?? 'This bill cannot be closed yet.');
}

/**
 * Closes the bill.
 *
 * The server re-runs every check and refuses if anything is unclaimed or the
 * shares do not add up, so this can never close a bill that does not balance.
 */
export async function completeBill(billId: string): Promise<Bill> {
  const { data, error } = await supabase.rpc('complete_bill', { p_bill_id: billId });

  if (error) throw toFriendlyError(error, 'Could not finish the bill.');
  return data as unknown as Bill;
}

/** Subtotal, tax, tip and how much of the items has been claimed so far. */
export async function getBillSummary(billId: string): Promise<BillSummary | null> {
  const { data, error } = await supabase
    .from('bill_summaries')
    .select()
    .eq('bill_id', billId)
    .maybeSingle();

  if (error) throw toFriendlyError(error, 'Could not load the bill summary.');
  return data;
}
