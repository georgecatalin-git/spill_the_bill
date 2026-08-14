import type {
  BillClaimDetail,
  BillEvenShareRow,
  BillParticipantTotal,
  BillTipShareRow,
} from '@/lib/database';
import { supabase } from '@/lib/supabase';

/**
 * The admin's view of who owes what.
 *
 * Guests read the same picture through their own RPCs; this side goes through
 * RLS as the signed-in admin, so only their own tables are visible.
 */

export class OverviewError extends Error {}

function toFriendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return new OverviewError('No connection. Please check your internet and try again.');
  }
  return new OverviewError(fallback);
}

export async function getBillClaimDetails(billId: string): Promise<BillClaimDetail[]> {
  const { data, error } = await supabase
    .from('bill_claim_details')
    .select()
    .eq('bill_id', billId)
    .order('item_created_at');

  if (error) throw toFriendlyError(error, 'Could not load who claimed what.');
  return data ?? [];
}

export async function getBillParticipantTotals(billId: string): Promise<BillParticipantTotal[]> {
  const { data, error } = await supabase
    .from('bill_participant_totals')
    .select()
    .eq('bill_id', billId);

  if (error) throw toFriendlyError(error, 'Could not load the totals.');
  return data ?? [];
}

/**
 * Everyone's share when the bill is split evenly.
 *
 * Comes back empty on a bill that is split by item, so a caller can read it
 * unconditionally and get nothing rather than a misleading number.
 */
export async function getBillEvenShares(billId: string): Promise<BillEvenShareRow[]> {
  const { data, error } = await supabase
    .from('bill_even_shares')
    .select()
    .eq('bill_id', billId)
    .order('name');

  if (error) throw toFriendlyError(error, 'Could not load the even split.');
  return data ?? [];
}

/**
 * Everyone's flat share of the tip, read through the admin's own RLS.
 *
 * The list only ever holds participants who are currently active at the
 * table — someone who left is not still owed a slice of tonight's tip.
 */
export async function getBillTipShares(billId: string): Promise<BillTipShareRow[]> {
  const { data, error } = await supabase
    .from('bill_tip_shares')
    .select()
    .eq('bill_id', billId)
    .order('name');

  if (error) throw toFriendlyError(error, 'Could not load the tip split.');
  return data ?? [];
}
