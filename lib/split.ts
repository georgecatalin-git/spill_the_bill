import { splitCents } from '@/lib/money';
import type { BillItem, ClaimMap } from '@/lib/types';

/**
 * Display-side helpers for the receipt rows.
 *
 * The authoritative version of all of this lives in the database, which is what
 * every screen actually shows. These exist so a row can work out how many units
 * are left before enabling its "+", without a round trip per tap.
 *
 * The two kinds of line behave differently:
 *   quantity > 1  -> unit based. Units are counted out and cannot be
 *                    over-claimed.
 *   quantity = 1  -> shareable. Any number of people may claim it and the price
 *                    is divided between them.
 */

export function isUnitLimited(item: BillItem) {
  return item.quantity > 1;
}

export function lineTotalCents(item: BillItem) {
  return item.unitPriceCents * item.quantity;
}

export function billTotalCents(items: BillItem[]) {
  return items.reduce((total, item) => total + lineTotalCents(item), 0);
}

export function totalShares(claims: ClaimMap, itemId: string) {
  return Object.values(claims[itemId] ?? {}).reduce((sum, count) => sum + count, 0);
}

export function sharesFor(claims: ClaimMap, itemId: string, participantId: string) {
  return (claims[itemId] ?? {})[participantId] ?? 0;
}

/** Units still up for grabs, or null when the item can be shared without limit. */
export function remainingShares(item: BillItem, claims: ClaimMap) {
  if (!isUnitLimited(item)) return null;
  return Math.max(0, item.quantity - totalShares(claims, item.id));
}

/**
 * Fallback split for a row that was not given server amounts.
 *
 * Mirrors the database's largest-remainder method so the two never disagree.
 */
export function itemSplit(item: BillItem, claims: ClaimMap) {
  const shares = claims[item.id] ?? {};
  const claimed = totalShares(claims, item.id);

  if (claimed === 0) return {};

  const assignable = isUnitLimited(item)
    ? Math.min(claimed, item.quantity) * item.unitPriceCents
    : lineTotalCents(item);

  return splitCents(assignable, shares);
}
