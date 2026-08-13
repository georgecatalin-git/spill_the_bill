import { createBillItem } from '@/lib/bill';
import { toCents } from '@/lib/money';
import { mockReceiptParser } from '@/lib/receipt/mock-parser';
import type { ParsedReceipt, ReceiptParser } from '@/lib/receipt/types';
import type { BillItem } from '@/lib/types';

/**
 * The parser the app runs with.
 *
 * This is the single line to change when the real OCR/AI service is ready:
 * point it at the new implementation and nothing else has to move.
 */
const parser: ReceiptParser = mockReceiptParser;

/** Reads a receipt photo. The UI only ever calls this, never a parser directly. */
export function parseReceipt(imageUri: string) {
  return parser(imageUri);
}

/**
 * Converts a parsed receipt into the bill's own item shape.
 *
 * Parsers speak in decimal amounts, the way a receipt is printed; everything
 * past this boundary works in integer cents.
 */
export function toBillItems(receipt: ParsedReceipt): BillItem[] {
  return receipt.items.map((item) =>
    createBillItem(item.name, toCents(item.price), item.quantity)
  );
}

export type { ParsedReceipt, ParsedReceiptItem, ReceiptParser } from '@/lib/receipt/types';
