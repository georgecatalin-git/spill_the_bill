import type { OwnerRestaurantStat, RestaurantMatch } from '@/lib/database';
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

export async function createRestaurant(name: string, city: string): Promise<RestaurantMatch> {
  const { data, error } = await supabase
    .from('restaurants')
    .insert({ name: name.trim(), city: city.trim() })
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

/** Corrects a name or a town. Owner only — RLS refuses everyone else. */
export async function updateRestaurant(
  restaurantId: string,
  name: string,
  city: string
): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ name: name.trim(), city: city.trim() })
    .eq('id', restaurantId);

  if (error) {
    if (error.message.includes('duplicate key')) {
      throw new RestaurantServiceError(
        `${name.trim()} in ${city.trim()} is already on the list. Merge them instead.`
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

/** Takes a restaurant out of the picker without losing the tables behind it. */
export async function setRestaurantActive(
  restaurantId: string,
  isActive: boolean
): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ is_active: isActive })
    .eq('id', restaurantId);

  if (error) throw toFriendlyError(error, 'Could not update the restaurant.');
}

/**
 * Removes a restaurant and everything behind it, permanently.
 *
 * For a contract that has ended for good. `setRestaurantActive(id, false)` is
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
