import type { BillItem } from '@/lib/database';
import { supabase } from '@/lib/supabase';

/**
 * Items on a bill.
 *
 * `total_price_cents` is never sent from here — a database trigger sets it to
 * quantity × unit price, so the line total cannot disagree with its parts.
 */

export class BillItemError extends Error {}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message ?? '');
  }
  return '';
}

function toFriendlyError(error: unknown, fallback: string) {
  const message = messageOf(error);
  const lower = message.toLowerCase();

  if (message.includes('already been selected')) {
    return new BillItemError('This item has already been selected by one or more guests.');
  }
  if (lower.includes('network request failed') || lower.includes('failed to fetch')) {
    return new BillItemError('No connection. Please check your internet and try again.');
  }
  if (lower.includes('violates check constraint')) {
    return new BillItemError('Please check the name, quantity and price.');
  }

  return new BillItemError(fallback);
}

export type BillItemInput = {
  name: string;
  quantity: number;
  unitPriceCents: number;
};

/** Mirrors the database constraints, so bad input never leaves the device. */
function validate(input: BillItemInput) {
  if (input.name.trim().length === 0) {
    throw new BillItemError('Please enter an item name.');
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new BillItemError('Quantity must be a whole number of at least one.');
  }
  if (!Number.isInteger(input.unitPriceCents) || input.unitPriceCents < 0) {
    throw new BillItemError('Please enter a valid price.');
  }
}

export async function getBillItems(billId: string): Promise<BillItem[]> {
  const { data, error } = await supabase
    .from('bill_items')
    .select()
    .eq('bill_id', billId)
    .order('created_at');

  if (error) throw toFriendlyError(error, 'Could not load the items.');
  return data ?? [];
}

export async function createBillItem(billId: string, input: BillItemInput): Promise<BillItem> {
  validate(input);

  const { data, error } = await supabase
    .from('bill_items')
    .insert({
      bill_id: billId,
      name: input.name.trim(),
      quantity: input.quantity,
      unit_price_cents: input.unitPriceCents,
      // Required by the schema; the trigger immediately replaces it.
      total_price_cents: input.quantity * input.unitPriceCents,
    })
    .select()
    .single();

  if (error) throw toFriendlyError(error, 'Could not add the item.');
  return data;
}

export async function updateBillItem(itemId: string, input: BillItemInput): Promise<BillItem> {
  validate(input);

  const { data, error } = await supabase
    .from('bill_items')
    .update({
      name: input.name.trim(),
      quantity: input.quantity,
      unit_price_cents: input.unitPriceCents,
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw toFriendlyError(error, 'Could not save the item.');
  return data;
}

/** Refused by the database when a guest has already claimed the item. */
export async function deleteBillItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('bill_items').delete().eq('id', itemId);

  if (error) throw toFriendlyError(error, 'Could not remove the item.');
}

export async function clearBillItems(billId: string): Promise<void> {
  const { error } = await supabase.from('bill_items').delete().eq('bill_id', billId);

  if (error) throw toFriendlyError(error, 'Could not clear the items.');
}
