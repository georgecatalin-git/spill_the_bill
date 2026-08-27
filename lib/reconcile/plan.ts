import { splitCents } from '@/lib/money';
import type { DecisionId, ReconGroup } from '@/lib/reconcile/reconcile';

/**
 * Turning answered groups into the writes that carry them out.
 *
 * Kept pure and separate from the service that runs it for one reason: this is
 * where a claim gets lost if anything is wrong, and a function that only
 * returns a list of writes can be run against a real table's rows and read
 * before a single one is sent. The service does no thinking; it executes.
 */

export type Answer = { group: ReconGroup; decision: DecisionId };

export type ItemWrite =
  | { action: 'create'; name: string; quantity: number; unitPriceCents: number }
  | { action: 'update'; id: string; name: string; quantity: number; unitPriceCents: number }
  | { action: 'delete'; id: string };

export type ApplyPlan = {
  items: ItemWrite[];
  /** Absolute values for the bill's own fields, or null when none were routed. */
  bill: { serviceChargeCents?: number; tipCents?: number } | null;
  /**
   * Units the receipt does not charge for that stayed anyway, because a guest
   * had claimed them. Nothing is silently taken off a person; the difference
   * shows on the totals instead.
   */
  keptClaimedSurplus: number;
};

/** One row as it will stand once a group is settled. A null id is a row to create. */
type Slot = { id: string | null; quantity: number; claimed: number };

/**
 * Makes a group's rows say what the receipt says, without losing a claim.
 *
 * The order matters. Surplus units are shed from whichever rows have the most
 * unclaimed units first, so what disappears is what nobody had taken. A
 * shortfall is added in the shape the tab already has: rows of one stay rows of
 * one — that is what keeps each drink claimable on its own, and a shareable
 * line is a different thing from a counted one.
 *
 * Prices come last, and from the receipt's line *total* rather than its unit
 * price, because the total is what is printed and the division is where cents
 * go missing. When every row holds a single unit the total is split by largest
 * remainder and lands exactly; otherwise it is a rounded unit price, and the
 * few cents left over are what `confirmed_total_cents` is for.
 */
function settleOnReceipt(group: ReconGroup, into: ItemWrite[]) {
  // An ambiguous group is the one shape that cannot be settled by adjusting
  // rows. Its receipt side holds two different products — a white and a red
  // against one typed "vin" — so there is no single name or price to adopt.
  // The vague row goes and each printed line becomes its own, which is why the
  // matcher only offers this when nothing has been claimed on it.
  if (group.kind === 'ambiguous') {
    for (const line of group.tab) into.push({ action: 'delete', id: line.id });
    for (const line of group.receipt) {
      into.push({
        action: 'create',
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      });
    }
    return 0;
  }

  // The printed name wins: it is what will be on the paper in everyone's hand
  // when somebody asks what a line was.
  const name = group.receipt[0]?.name ?? group.tab[0]?.name ?? '';

  const slots: Slot[] = group.tab
    .map((line) => ({
      id: line.id,
      quantity: line.quantity,
      claimed: Math.min(line.claimedUnits ?? 0, line.quantity),
    }))
    .sort((a, b) => b.quantity - b.claimed - (a.quantity - a.claimed));

  const held = () => slots.reduce((sum, slot) => sum + slot.quantity, 0);

  let surplus = held() - group.receiptQuantity;
  for (const slot of slots) {
    if (surplus <= 0) break;
    const spare = Math.min(surplus, slot.quantity - slot.claimed);
    slot.quantity -= spare;
    surplus -= spare;
  }

  // Anything still surplus is claimed, and shedding it would rewrite somebody's
  // share. It stays, and the caller is told how much stayed.
  const keptClaimedSurplus = Math.max(0, surplus);

  const singleUnitRows = group.tab.every((line) => line.quantity === 1);
  const shortfall = group.receiptQuantity - held();

  if (shortfall > 0) {
    const counted = slots.find((slot) => slot.quantity > 0);

    if (singleUnitRows || !counted) {
      // Rows of one are a table that ticks drinks individually, and each of
      // those has to stay claimable on its own. More of them is the only shape
      // that keeps that true.
      for (let i = 0; i < shortfall; i++) slots.push({ id: null, quantity: 1, claimed: 0 });
    } else {
      // A row that already counts should just count higher. Five beers turning
      // out to be fifteen is one row reading fifteen, not a row of five beside
      // a row of ten — the reader is checking a number against the paper, and
      // two numbers to add up is the thing that made this worth writing.
      counted.quantity += shortfall;
    }
  }

  const live = slots.filter((slot) => slot.quantity > 0);
  const units = live.reduce((sum, slot) => sum + slot.quantity, 0);

  const prices = new Map<Slot, number>();
  if (units > 0 && live.every((slot) => slot.quantity === 1)) {
    const shares = splitCents(
      group.receiptTotalCents,
      Object.fromEntries(live.map((_, index) => [String(index), 1]))
    );
    live.forEach((slot, index) => prices.set(slot, shares[String(index)] ?? 0));
  } else {
    const unit = units > 0 ? Math.round(group.receiptTotalCents / units) : 0;
    for (const slot of live) prices.set(slot, unit);
  }

  for (const slot of slots) {
    if (slot.quantity === 0) {
      if (slot.id) into.push({ action: 'delete', id: slot.id });
      continue;
    }

    const unitPriceCents = prices.get(slot) ?? 0;
    if (slot.id) into.push({ action: 'update', id: slot.id, name, quantity: slot.quantity, unitPriceCents });
    else into.push({ action: 'create', name, quantity: slot.quantity, unitPriceCents });
  }

  return keptClaimedSurplus;
}

/**
 * Gives a matched group's rows the name the receipt printed.
 *
 * Only ever a rename — quantity and price are untouched, because this runs on
 * groups where those already agree. A row that is already named right is left
 * alone rather than written for nothing.
 */
function renameToPrinted(group: ReconGroup, into: ItemWrite[]) {
  const name = group.receipt[0]?.name;
  if (!name) return;

  for (const line of group.tab) {
    if (line.name === name) continue;
    into.push({
      action: 'update',
      id: line.id,
      name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    });
  }
}

export function planReconciliation(answers: Answer[]): ApplyPlan {
  const items: ItemWrite[] = [];
  let serviceCents = 0;
  let tipCents = 0;
  let routedService = false;
  let routedTip = false;
  let keptClaimedSurplus = 0;

  for (const { group, decision } of answers) {
    switch (decision) {
      case 'take_receipt':
        keptClaimedSurplus += settleOnReceipt(group, items);
        break;

      case 'add_to_bill':
        for (const line of group.receipt) {
          items.push({
            action: 'create',
            name: line.name,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
          });
        }
        break;

      case 'remove_from_bill':
        for (const line of group.tab) items.push({ action: 'delete', id: line.id });
        break;

      case 'route_to_service':
        serviceCents += group.receiptTotalCents;
        routedService = true;
        break;

      case 'route_to_tip':
        tipCents += group.receiptTotalCents;
        routedTip = true;
        break;

      // The figures agree; the names still may not. A row typed "pornstar"
      // against a line printed "PORN STAR MARTINI" is the same drink at the
      // same price, and the printed name is the one that will be on the paper
      // in somebody's hand when they ask what a line was — so the row adopts
      // it. Nothing else about the row moves, which is why this stays a
      // decision that asks the reader nothing.
      case 'keep':
        renameToPrinted(group, items);
        break;

      // 'keep_tab' and 'keep_on_bill' are a person saying the receipt is not
      // right about this group, so its name is not adopted either. 'ignore'
      // has no tab row to touch. 'match_by_hand' never reaches here — the
      // screen will not apply while one is still unanswered.
      default:
        break;
    }
  }

  return {
    items,
    bill:
      routedService || routedTip
        ? {
            ...(routedService ? { serviceChargeCents: serviceCents } : {}),
            ...(routedTip ? { tipCents } : {}),
          }
        : null,
    keptClaimedSurplus,
  };
}
