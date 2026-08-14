import { supabase } from '@/lib/supabase';

/**
 * Guest item claims.
 *
 * Every call sends only the session token. The server derives which
 * participant that is and which table they may touch, so no participant id,
 * table id or bill id is ever accepted from the client.
 */

export class ClaimError extends Error {}

/** One person's hold on one item. */
export type GuestClaim = {
  participant_id: string;
  participant_name: string;
  quantity: number;
  amount_cents: number;
};

/** A receipt line together with who has taken what. */
export type ClaimedBillItem = {
  id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  claimed_quantity: number;
  /** Null for shareable lines, which have no unit count to run out of. */
  available_quantity: number | null;
  is_shared: boolean;
  can_claim_more: boolean;
  my_quantity: number;
  my_amount_cents: number;
  claims: GuestClaim[];
};

export type ParticipantTotal = {
  participant_id: string;
  participant_name: string;
  is_me: boolean;
  total_cents: number;
};

export type BillAssignmentSummary = {
  billId: string;
  currency: string;
  status: string;
  billTotalCents: number;
  assignedTotalCents: number;
  remainingTotalCents: number;
  percentageAssigned: number;
};

/**
 * One person's flat slice of the tip.
 *
 * Unlike item shares, which are proportional to what someone claimed, this is
 * the same amount for everyone — the tip split by headcount, not by order.
 */
export type TipShare = {
  participant_id: string;
  participant_name: string;
  is_me: boolean;
  tip_share_cents: number;
};

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message ?? '');
  }
  return '';
}

/**
 * Turns a database error into something worth showing a guest.
 *
 * Messages raised by the claim functions are already written for people
 * ("Only 2 Coca Cola remaining."), so they pass through unchanged.
 */
function toClaimError(error: unknown, fallback: string) {
  if (error instanceof ClaimError) return error;

  const message = messageOf(error);
  const lower = message.toLowerCase();

  if (lower.includes('network request failed') || lower.includes('failed to fetch')) {
    return new ClaimError('Unable to update your selection. Check your connection and try again.');
  }

  if (
    message.includes('remaining.') ||
    message.includes('left.') ||
    message.includes('session has expired') ||
    message.includes('no longer accepting selections') ||
    message.includes('not on this bill') ||
    message.includes('left this table') ||
    message.includes('choose at least one') ||
    message.includes('valid quantity')
  ) {
    return new ClaimError(message);
  }

  return new ClaimError(fallback);
}

export async function getGuestClaims(sessionToken: string): Promise<ClaimedBillItem[]> {
  const { data, error } = await supabase.rpc('get_guest_items_with_claims', {
    p_session_token: sessionToken,
  });

  if (error) throw toClaimError(error, 'Unable to load the bill.');
  return (data ?? []) as unknown as ClaimedBillItem[];
}

export async function getGuestTotals(sessionToken: string): Promise<ParticipantTotal[]> {
  const { data, error } = await supabase.rpc('get_guest_totals', {
    p_session_token: sessionToken,
  });

  if (error) throw toClaimError(error, 'Unable to load the totals.');
  return (data ?? []) as unknown as ParticipantTotal[];
}

export async function getBillAssignmentSummary(
  sessionToken: string
): Promise<BillAssignmentSummary | null> {
  const { data, error } = await supabase.rpc('get_bill_assignment_summary', {
    p_session_token: sessionToken,
  });

  if (error) throw toClaimError(error, 'Unable to load the bill summary.');

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    billId: String(row.bill_id),
    currency: String(row.currency),
    status: String(row.status),
    billTotalCents: Number(row.bill_total_cents),
    assignedTotalCents: Number(row.assigned_total_cents),
    remainingTotalCents: Number(row.remaining_total_cents),
    percentageAssigned: Number(row.percentage_assigned),
  };
}

/** Everyone's flat share of the tip — same list shape as `getGuestTotals`. */
export async function getTipShares(sessionToken: string): Promise<TipShare[]> {
  const { data, error } = await supabase.rpc('get_guest_tip_shares', {
    p_session_token: sessionToken,
  });

  if (error) throw toClaimError(error, 'Unable to load the tip.');
  return (data ?? []) as unknown as TipShare[];
}

/** Takes one more of an item. The server refuses if none are left. */
export async function claimItem(sessionToken: string, billItemId: string, quantity = 1) {
  const { error } = await supabase.rpc('claim_item', {
    p_session_token: sessionToken,
    p_bill_item_id: billItemId,
    p_quantity: quantity,
  });

  if (error) throw toClaimError(error, 'Unable to add that to your selection.');
}

/** Sets an exact quantity. Zero removes the claim. */
export async function updateClaimQuantity(
  sessionToken: string,
  billItemId: string,
  quantity: number
) {
  const { error } = await supabase.rpc('update_item_claim', {
    p_session_token: sessionToken,
    p_bill_item_id: billItemId,
    p_quantity: quantity,
  });

  if (error) throw toClaimError(error, 'Unable to update your selection.');
}

export async function removeClaim(sessionToken: string, billItemId: string) {
  const { error } = await supabase.rpc('remove_item_claim', {
    p_session_token: sessionToken,
    p_bill_item_id: billItemId,
  });

  if (error) throw toClaimError(error, 'Unable to remove your selection.');
}

/**
 * The admin claims through their Supabase session rather than a guest token.
 *
 * They are a participant at their own table like anyone else; only the way
 * the server identifies them differs.
 */
export async function adminClaimItem(billItemId: string, quantity = 1) {
  const { error } = await supabase.rpc('admin_claim_item', {
    p_bill_item_id: billItemId,
    p_quantity: quantity,
  });

  if (error) throw toClaimError(error, 'Unable to add that to your selection.');
}

export async function adminUpdateClaimQuantity(billItemId: string, quantity: number) {
  const { error } = await supabase.rpc('admin_update_item_claim', {
    p_bill_item_id: billItemId,
    p_quantity: quantity,
  });

  if (error) throw toClaimError(error, 'Unable to update your selection.');
}

/** Which participant row the signed-in admin is at this table. */
export async function getAdminParticipantId(tableId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_admin_participant_id', {
    p_table_id: tableId,
  });

  if (error) throw toClaimError(error, 'Unable to identify you at this table.');
  return (data as string | null) ?? null;
}
