/** One line detected on a receipt. `price` is the price of a single unit. */
export type ParsedReceiptItem = {
  name: string;
  quantity: number;
  price: number;
};

export type ParsedReceipt = {
  items: ParsedReceiptItem[];
  /** The total printed on the receipt, read separately from the line items. */
  total: number;
  /** ISO 4217 code, e.g. "EUR". */
  currency: string;
};

/**
 * Turns a photo of a receipt into structured data.
 *
 * The mock implementation is used today; a real OCR/AI service can be dropped
 * in later as long as it satisfies this signature. It is async on purpose, so
 * the UI already handles waiting and failure.
 */
/**
 * `tableId` is passed only so the server can attribute the scan's cost to the
 * right restaurant. The parser never uses it to decide anything.
 */
export type ReceiptParser = (
  imageUri: string,
  tableId?: string
) => Promise<ParsedReceipt>;
