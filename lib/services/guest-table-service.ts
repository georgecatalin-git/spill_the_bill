import { GuestError } from '@/lib/services/guest-session-service';
import { supabase } from '@/lib/supabase';

/**
 * Everything a guest may read, always through the database functions.
 *
 * Each call sends only the session token; the server decides which table that
 * maps to. No table id ever travels from the client, so there is nothing to
 * tamper with.
 */

export type GuestTable = {
  id: string;
  name: string;
  restaurant_name: string | null;
  status: string;
};

export type GuestParticipant = {
  id: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
  joined_at: string;
};

export type GuestBill = {
  id: string;
  status: string;
  currency: string;
  total_cents: number;
  assigned_cents: number;
  remaining_cents: number;
};

export type GuestItem = {
  id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
};

export type GuestClaim = {
  bill_item_id: string;
  participant_id: string;
  quantity: number;
};

async function callGuestRpc<T>(fn: string, sessionToken: string): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn as never, {
    p_session_token: sessionToken,
  } as never);

  if (error) {
    if (error.message.includes('session has expired')) {
      throw new GuestError('Your session has expired.');
    }
    throw new GuestError('Unable to load the table. Check your connection and try again.');
  }

  return (data ?? []) as T[];
}

export async function getGuestTable(sessionToken: string) {
  const rows = await callGuestRpc<GuestTable>('get_guest_table', sessionToken);
  return rows[0] ?? null;
}

export function getGuestParticipants(sessionToken: string) {
  return callGuestRpc<GuestParticipant>('get_guest_participants', sessionToken);
}

export async function getGuestBill(sessionToken: string) {
  const rows = await callGuestRpc<GuestBill>('get_guest_bill', sessionToken);
  return rows[0] ?? null;
}

export function getGuestItems(sessionToken: string) {
  return callGuestRpc<GuestItem>('get_guest_items', sessionToken);
}

export function getGuestClaims(sessionToken: string) {
  return callGuestRpc<GuestClaim>('get_guest_claims', sessionToken);
}
