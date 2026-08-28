import type { BillItem } from '@/lib/types';

/** Returns null unless the text is a whole quantity of at least one. */
export function parseQuantity(text: string) {
  const value = Number(text.trim());

  if (!text.trim() || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

export function createBillItem(
  name: string,
  unitPriceCents: number,
  quantity = 1,
  kind?: string
): BillItem {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    unitPriceCents,
    quantity,
    kind,
  };
}
