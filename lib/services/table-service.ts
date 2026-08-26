import { supabase } from '@/lib/supabase';
import type { AdminTableSummary, TableParticipant, TableRow } from '@/lib/database';

/** Admin-side table operations. These go through RLS as the signed-in admin. */

export class TableServiceError extends Error {}

function toFriendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return new TableServiceError('No connection. Please check your internet and try again.');
  }
  return new TableServiceError(fallback);
}

/**
 * A table together with the name of the restaurant it belongs to.
 *
 * The name lives on `restaurants` now, so it arrives through the join rather
 * than off the table row itself.
 */
export type TableWithRestaurant = TableRow & { restaurant_name: string };

/** Creates a table for the signed-in admin. The invite code is generated server-side. */
export async function createTable(
  name: string,
  restaurantId: string,
  position: { latitude: number; longitude: number } | null
): Promise<TableRow> {
  const { data: userData } = await supabase.auth.getUser();
  const adminId = userData.user?.id;

  if (!adminId) {
    throw new TableServiceError('Please log in again to create a table.');
  }

  const { data, error } = await supabase
    .from('tables')
    .insert({
      admin_id: adminId,
      name: name.trim(),
      restaurant_id: restaurantId,
      // Where the phone said it was. The database refuses a table opened away
      // from the restaurant it names — see
      // `prevent_table_outside_restaurant_radius`, and read its comment before
      // trusting this for anything: the position is client-supplied.
      opened_lat: position?.latitude ?? null,
      opened_lng: position?.longitude ?? null,
    })
    .select()
    .single();

  if (error) {
    // The server's own refusal is already written for a person to read, and
    // "please try again" is actively wrong here — a hidden restaurant will
    // refuse every retry. Same passthrough as setParticipantSettled below.
    if (error.message.includes('no longer taking new tables')) {
      throw new TableServiceError(
        'That restaurant is no longer taking new tables. Pick another one.'
      );
    }

    // The perimeter refusals name the restaurant and the distance already, so
    // they are shown as written rather than replaced by a generic apology.
    if (
      error.message.includes('Turn on location') ||
      error.message.includes('Open the table at the restaurant you are in')
    ) {
      throw new TableServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not create the table. Please try again.');
  }
  return data;
}

/** Every table this admin owns, with people count and bill total for the cards. */
export async function listTableSummaries(): Promise<AdminTableSummary[]> {
  const { data, error } = await supabase
    .from('admin_table_summaries')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw toFriendlyError(error, 'Could not load your tables.');
  return data ?? [];
}

export async function getTable(tableId: string): Promise<TableWithRestaurant | null> {
  const { data, error } = await supabase
    .from('tables')
    .select('*, restaurants(name)')
    .eq('id', tableId)
    .maybeSingle();

  if (error) throw toFriendlyError(error, 'Could not load the table.');
  if (!data) return null;

  const { restaurants, ...table } = data;
  return { ...table, restaurant_name: restaurants?.name ?? '' };
}

export async function listTables(): Promise<TableRow[]> {
  const { data, error } = await supabase
    .from('tables')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw toFriendlyError(error, 'Could not load your tables.');
  return data ?? [];
}

/**
 * Participants of a table.
 *
 * Reads the `table_participants` view, which omits `session_token` — the guest
 * secret is not something the admin needs or should receive.
 */
export async function listParticipants(tableId: string): Promise<TableParticipant[]> {
  const { data, error } = await supabase
    .from('table_participants')
    .select()
    .eq('table_id', tableId)
    .order('joined_at');

  if (error) throw toFriendlyError(error, 'Could not load the people at this table.');
  return data ?? [];
}

/**
 * Records whether someone has handed over their share.
 *
 * Only the table's admin may call this — the server checks, not the screen.
 * Allowed on a closed bill on purpose: freezing stops the FIGURES changing,
 * and most people pay after the bill is settled, which is exactly when this
 * gets used.
 */
export async function setParticipantSettled(participantId: string, settled: boolean) {
  const { error } = await supabase.rpc('set_participant_settled', {
    p_participant_id: participantId,
    p_settled: settled,
  });

  if (error) {
    // The server's own refusal is already written for a person to read.
    if (error.message.includes('Only the table admin')) {
      throw new TableServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not record that payment.');
  }
}

/**
 * Adds somebody to the table by name alone.
 *
 * For the person who is at the table but not in the app — no phone, no code,
 * no account. They still get a share, because the host records what they
 * ordered. RLS already allows this: the admin may insert participants into
 * their own table.
 *
 * No `select()` here for the same reason as below — `participants` has
 * column-level grants that exclude `session_token`, and a bare select asks for
 * everything.
 */
export async function addParticipant(tableId: string, name: string) {
  const { error } = await supabase
    .from('participants')
    .insert({ table_id: tableId, name: name.trim(), is_admin: false });

  if (error) {
    if (error.message.includes('duplicate key')) {
      throw new TableServiceError('Somebody with that name is already at this table.');
    }
    throw toFriendlyError(error, 'Could not add that person.');
  }
}

/**
 * Adds the admin to their own table's participant list, once.
 *
 * Note the missing `.select()`: `participants` has a column-level grant that
 * excludes `session_token`, and a bare `select()` asks for every column, which
 * PostgREST then refuses. Read participants through `table_participants`.
 */
export async function ensureAdminParticipant(tableId: string, name: string) {
  const { error } = await supabase
    .from('participants')
    .insert({ table_id: tableId, name: name.trim(), is_admin: true });

  // A duplicate simply means the host is already listed.
  if (error && !error.message.includes('duplicate key')) {
    throw toFriendlyError(error, 'Could not add you to the table.');
  }
}
