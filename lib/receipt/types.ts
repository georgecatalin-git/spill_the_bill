/** One line detected on a receipt. `price` is the price of a single unit. */
export type ParsedReceiptItem = {
  name: string;
  quantity: number;
  price: number;
  /**
   * The everyday word for what this is — "bere", "gin", "apa" — as opposed to
   * what it is called on the paper.
   *
   * A receipt prints brands and the person who typed the tab during the meal
   * wrote a category, so the two share no words at all: "bere" and "URSUS" have
   * nothing in common to match on. The model reading the photo already knows
   * which is which, and this is the only place that knowledge costs nothing.
   * Empty when it could not tell — a guess here would attach somebody's beers
   * to somebody else's gin.
   */
  kind?: string;
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
 * `tableId` is required and is passed only so the server can attribute the
 * scan's cost to the right restaurant. The parser never uses it to decide
 * anything, but the server refuses a scan without one — an unattributed scan
 * is money spent that no restaurant's figures ever show.
 */
export type ReceiptParser = (
  imageUri: string,
  tableId: string
) => Promise<ParsedReceipt>;
