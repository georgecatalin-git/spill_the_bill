import type {
  AdminAccount,
  MyRestaurant,
  OwnerRestaurantStat,
  RestaurantMatch,
  RestaurantStatus,
} from '@/lib/database';
import { supabase } from '@/lib/supabase';

/**
 * The curated list of places Split is sold into, and how much each one uses it.
 *
 * There is no longer a list to read. An admin types the name of the place they
 * are in and `search_restaurants` answers; the table itself is no longer
 * readable in one piece, so signing up no longer hands anybody the customer
 * list. Writing it, and reading the usage figures, is the owner's alone.
 */

export class RestaurantServiceError extends Error {}

/**
 * An empty fiscal code is stored as null rather than as "".
 *
 * A restaurant with no code cannot be active — the database says so with a
 * check constraint — because there would be nothing for a scanned receipt to
 * be compared against, and every scan there would be refused.
 */
function toTaxId(value: string): string | null {
  return value.trim() || null;
}

function toFriendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return new RestaurantServiceError('No connection. Please check your internet and try again.');
  }
  return new RestaurantServiceError(fallback);
}

/**
 * Restaurants whose name starts with what the admin typed.
 *
 * Spelling is free — case, diacritics, punctuation and "SRL" are all folded by
 * `normalise_business_name` — but the name has to be right. Fewer than three
 * usable characters returns nothing rather than everything, which is the whole
 * difference between a search box and a list.
 *
 * A place the owner has not entered is simply not found, and without a
 * restaurant there is no table.
 */
export async function searchRestaurants(query: string): Promise<RestaurantMatch[]> {
  const { data, error } = await supabase.rpc('search_restaurants', { p_query: query });

  if (error) throw toFriendlyError(error, 'Could not search the restaurants.');
  return data ?? [];
}

export async function createRestaurant(
  name: string,
  city: string,
  taxId: string
): Promise<RestaurantMatch> {
  const { data, error } = await supabase
    .from('restaurants')
    .insert({ name: name.trim(), city: city.trim(), tax_id: toTaxId(taxId) })
    .select('id, name, city')
    .single();

  if (error) {
    // Uniqueness is the name AND the city, so this fires only when the same
    // place in the same town is already listed — a chain's other branches are
    // fine. Capitalisation and stray spaces do not make a new one.
    if (error.message.includes('duplicate key')) {
      throw new RestaurantServiceError(
        `${name.trim()} in ${city.trim()} is already on the list.`
      );
    }
    throw toFriendlyError(error, 'Could not add the restaurant.');
  }
  return data;
}

/** Corrects a name, a town or the fiscal code. Owner only — RLS refuses everyone else. */
export async function updateRestaurant(
  restaurantId: string,
  name: string,
  city: string,
  taxId: string
): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ name: name.trim(), city: city.trim(), tax_id: toTaxId(taxId) })
    .eq('id', restaurantId);

  if (error) {
    if (error.message.includes('duplicate key')) {
      throw new RestaurantServiceError(
        `${name.trim()} in ${city.trim()} is already on the list. Merge them instead.`
      );
    }
    if (error.message.includes('restaurants_active_needs_tax_id')) {
      throw new RestaurantServiceError(
        'An active restaurant needs its fiscal code — it is what a scanned receipt is checked against.'
      );
    }
    throw toFriendlyError(error, 'Could not save the restaurant.');
  }
}

/**
 * Folds one restaurant into another: the tables move across, the empty row
 * goes. For the duplicates the old free-text field left behind, where renaming
 * alone only collides with the unique index.
 */
export async function mergeRestaurants(sourceId: string, targetId: string): Promise<void> {
  const { error } = await supabase.rpc('owner_merge_restaurants', {
    p_source: sourceId,
    p_target: targetId,
  });

  if (error) {
    // The server's refusals are already written for a person to read.
    if (error.message.includes('Only the owner') || error.message.includes('Pick a different')) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not merge the restaurants.');
  }
}

/**
 * Moves a restaurant through its life with Split: PENDING while it is only a
 * prospect, ACTIVE once the contract is signed, SUSPENDED or INACTIVE after.
 *
 * `is_active` is generated from this in the database, so it cannot be written
 * directly and the two can never disagree. Only ACTIVE serves customers, and
 * only a restaurant whose fiscal code is on file may become ACTIVE.
 */
export async function setRestaurantStatus(
  restaurantId: string,
  status: RestaurantStatus
): Promise<void> {
  const { error } = await supabase.rpc('owner_set_restaurant_status', {
    p_restaurant_id: restaurantId,
    p_status: status,
  });

  if (error) {
    // The server writes both of these for a person to read.
    if (error.message.includes('fiscal code') || error.message.includes('Only the owner')) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not update the restaurant.');
  }
}

/**
 * Removes a restaurant and everything behind it, permanently.
 *
 * For a contract that has ended for good. `setRestaurantStatus(id, 'INACTIVE')` is
 * the gentler option and keeps the history, which is usually what a place
 * going quiet actually calls for.
 */
export async function deleteRestaurant(restaurantId: string): Promise<void> {
  const { error } = await supabase.rpc('owner_delete_restaurant', {
    p_restaurant_id: restaurantId,
  });

  if (error) {
    if (error.message.includes('Only the owner') || error.message.includes('no longer exists')) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not delete the restaurant.');
  }
}

/**
 * Per-restaurant usage counts.
 *
 * Owner only — the function refuses anyone else, so hiding the screen is a
 * convenience rather than the protection.
 */
export async function getOwnerRestaurantStats(): Promise<OwnerRestaurantStat[]> {
  const { data, error } = await supabase.rpc('owner_restaurant_stats');

  if (error) {
    if (error.message.includes('Only the owner')) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not load the usage figures.');
  }
  return data ?? [];
}

/**
 * Every account. Owner only.
 *
 * `profiles` is restricted to `id = auth.uid()`, so there is no query the
 * owner could write that would see anybody else — hence the definer function.
 */
export async function listAdminAccounts(): Promise<AdminAccount[]> {
  const { data, error } = await supabase.rpc('owner_list_admins');

  if (error) {
    if (error.message.includes('Only the owner')) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not load the accounts.');
  }
  return data ?? [];
}

/**
 * Removes somebody else's account. Owner only.
 *
 * The tables they opened stay with the restaurant — `tables.admin_id` is
 * `set null`, deliberately, because that history is the restaurant's and not
 * the waiter's. Nobody can act on those tables afterwards, which is correct:
 * the person who could is gone.
 */
export async function deleteAdminAccount(adminId: string): Promise<void> {
  const { error } = await supabase.rpc('owner_delete_admin', { p_admin_id: adminId });

  if (error) {
    // The server's refusals are already written for a person to read.
    if (
      error.message.includes('Only the owner') ||
      error.message.includes('your own account') ||
      error.message.includes('owner account cannot')
    ) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not delete the account.');
  }
}

/**
 * The restaurant a scanned or typed code belongs to.
 *
 * `restaurants` is not readable by a customer, so the app cannot name the place
 * without asking the server. This answers only that, and only for a code
 * somebody already holds.
 */
export async function getVenueByCode(code: string): Promise<RestaurantMatch | null> {
  // The same function `create_table_at_venue` asks. There used to be a second
  // one answering the same question for the picker, and two definitions of
  // "which restaurant is this code" is exactly how a picker and the thing that
  // enforces it end up disagreeing.
  const { data, error } = await supabase.rpc('resolve_venue_code', { p_code: code });

  if (error) throw toFriendlyError(error, 'Could not check that code.');

  const match = data?.[0];
  return match
    ? { id: match.restaurant_id, name: match.restaurant_name, city: match.city }
    : null;
}

/**
 * Issues a new code for a restaurant. Owner only.
 *
 * Every sticker already printed stops working, which is the whole point: a
 * code that turned up somewhere it should not can be retired, and the id it
 * would otherwise have been could never change.
 */
export async function rotateVenueCode(restaurantId: string): Promise<string> {
  const { data, error } = await supabase.rpc('owner_rotate_venue_code', {
    p_restaurant_id: restaurantId,
  });

  if (error) {
    if (error.message.includes('Only the owner') || error.message.includes('no longer exists')) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not issue a new code.');
  }
  return data as string;
}

/**
 * Sets the one account that administers a restaurant, or clears it with null.
 *
 * A property of the restaurant, not of the account — which is why it lives on
 * the restaurant's card and not in the account list. The owner is the only one
 * who may write it, and the server refuses a guest session identity.
 */
export async function setRestaurantAdmin(
  restaurantId: string,
  adminId: string | null
): Promise<void> {
  const { error } = await supabase.rpc('owner_set_restaurant_admin', {
    p_restaurant_id: restaurantId,
    // The generator types every argument as non-null; a SQL parameter always
    // accepts NULL, and here it means "no admin".
    p_admin_id: adminId as string,
  });

  if (error) {
    if (
      error.message.includes('Only the owner') ||
      error.message.includes('real account') ||
      error.message.includes('no longer exists')
    ) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not set the administrator.');
  }
}

/**
 * The restaurant this account administers, or null when it administers none.
 *
 * The row is found *by* the caller inside `my_restaurant()`, so there is no
 * restaurant id the app could send — and therefore none it could get wrong or
 * a client could tamper with.
 */
export async function getAdministeredRestaurant(): Promise<MyRestaurant | null> {
  const { data, error } = await supabase.rpc('my_restaurant');

  if (error) throw toFriendlyError(error, 'Could not load your restaurant.');
  return data?.[0] ?? null;
}

/**
 * Lets a restaurant correct its own name, town and address.
 *
 * Never the fiscal code and never the status: the first is what every scanned
 * receipt is checked against, the second is what says they are a paying
 * customer. Both stay with the platform owner.
 */
export async function updateMyRestaurantDetails(
  name: string,
  city: string,
  address: string
): Promise<void> {
  const { error } = await supabase.rpc('restaurant_admin_update_details', {
    p_name: name,
    p_city: city,
    p_address: address,
  });

  if (error) {
    if (
      error.message.includes('does not administer') ||
      error.message.includes('Please name') ||
      error.message.includes('Please say') ||
      error.message.includes('already exists')
    ) {
      throw new RestaurantServiceError(error.message);
    }
    throw toFriendlyError(error, 'Could not save the restaurant.');
  }
}
