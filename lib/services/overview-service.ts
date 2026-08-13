import type { BillClaimDetail, BillParticipantTotal } from '@/lib/database';
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
