import { createBillItem } from '@/lib/bill';
import { toCents } from '@/lib/money';
import { claudeReceiptParser } from '@/lib/receipt/claude-parser';
import type { ParsedReceipt, ReceiptParser } from '@/lib/receipt/types';
import type { BillItem } from '@/lib/types';

/**
 * The parser the app runs with.
 *
 * Reads the photo through the `parse-receipt` Edge Function, which is where the
 * Anthropic key lives. `mock-parser.ts` is still in the tree and still returns
 * the same four invented lines — swap it back in here only to work on the
 * review screens without spending API calls, and never leave it in.
 */
const parser: ReceiptParser = claudeReceiptParser;

/**
 * Reads a receipt photo. The UI only ever calls this, never a parser directly.
 *
 * `tableId` is what lets the server bill the scan to a restaurant, and it is
 * not optional: the Edge Function refuses a scan it cannot attribute, because
 * an unattributed one is spending that never reaches anybody's figures.
 */
export function parseReceipt(imageUri: string, tableId: string) {
  return parser(imageUri, tableId);
}

/**
 * Converts a parsed receipt into the bill's own item shape.
 *
 * Parsers speak in decimal amounts, the way a receipt is printed; everything
 * past this boundary works in integer cents.
 */
export function toBillItems(receipt: ParsedReceipt): BillItem[] {
  return receipt.items.map((item) =>
    createBillItem(item.name, toCents(item.price), item.quantity, item.kind)
  );
}

export type { ParsedReceipt, ParsedReceiptItem, ReceiptParser } from '@/lib/receipt/types';
