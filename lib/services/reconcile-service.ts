import type { Answer, TabLine } from '@/lib/reconcile';
import { planReconciliation } from '@/lib/reconcile';
import {
  createBillItem,
  deleteBillItem,
  getBillItems,
  updateBillItem,
} from '@/lib/services/bill-item-service';
import { updateBillTotals } from '@/lib/services/bill-service';
import { getBillClaimDetails } from '@/lib/services/overview-service';

/**
 * Carrying out what a person decided on the reconciliation screen.
 *
 * The matcher proposes, `planReconciliation` works out the writes, and this
 * sends them. Nothing here decides anything, on purpose: the deciding is the
 * part that can lose somebody's claim, and it belongs where it can be run
 * against a real table's rows and read before a single write goes out.
 *
 * Every write is an ordinary item write, so Postgres recomputes the totals
 * exactly as it does when an item is typed by hand.
 */

export class ReconcileError extends Error {}

export type { Answer } from '@/lib/reconcile';

/**
 * The bill's own items, with how many units of each are already spoken for.
 *
 * The claim count is what stops the screen proposing to delete a row somebody
 * has ticked. It is advisory — the database refuses that outright — but a
 * refusal after the fact is a worse way to learn it than not being offered.
 */
export async function getTabLines(billId: string): Promise<TabLine[]> {
  const [items, claims] = await Promise.all([
    getBillItems(billId),
    getBillClaimDetails(billId),
  ]);

  const claimed = new Map<string, number>();
  for (const claim of claims) {
    const id = String(claim.bill_item_id ?? '');
    if (!id) continue;
    claimed.set(id, (claimed.get(id) ?? 0) + Number(claim.claimed_quantity ?? 0));
  }

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
    claimedUnits: claimed.get(item.id) ?? 0,
  }));
}

/**
 * Applies every answered group.
 *
 * Sequential on purpose. These are writes to the same bill and each one makes
 * Postgres recompute its totals; firing them together would only race the
 * triggers against each other for no gain a person could perceive.
 *
 * Deletions go first. A row being removed and a row being added can be the
 * same drink at the same price, and doing the adds first would briefly show a
 * table twice as long as it should be.
 *
 * A group whose figures agree can still produce a write: the row takes on the
 * name the receipt printed, so what a guest reads matches the paper.
 */
export async function applyReconciliation(billId: string, answers: Answer[]) {
  const plan = planReconciliation(answers);

  const order = { delete: 0, update: 1, create: 2 } as const;
  const writes = [...plan.items].sort((a, b) => order[a.action] - order[b.action]);

  for (const write of writes) {
    if (write.action === 'delete') {
      await deleteBillItem(write.id);
    } else if (write.action === 'update') {
      await updateBillItem(write.id, {
        name: write.name,
        quantity: write.quantity,
        unitPriceCents: write.unitPriceCents,
      });
    } else {
      await createBillItem(billId, {
        name: write.name,
        quantity: write.quantity,
        unitPriceCents: write.unitPriceCents,
      });
    }
  }

  if (plan.bill) await updateBillTotals(billId, plan.bill);
}
