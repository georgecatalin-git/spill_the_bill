/** Shared domain types for both the admin and guest sides of a table. */

export type Participant = {
  id: string;
  name: string;
  /** True for the person who created the table. */
  isAdmin?: boolean;
  /** True once the admin has recorded that this person handed their money over. */
  settled?: boolean;
};

export type TableStatus = 'active' | 'completed';

/** A table as it appears in the admin's list of tables. */
export type TableSummary = {
  id: string;
  name: string;
  restaurant: string;
  peopleCount: number;
  totalCents: number;
  /** Currency of this table's bill, so the card does not assume euros. */
  currency: string;
  status: TableStatus;
};

export type BillItem = {
  id: string;
  name: string;
  /** Price of a single unit, in integer cents. */
  unitPriceCents: number;
  quantity: number;
  /**
   * What the scanner said a line is — "bere" for a URSUS.
   *
   * Carried from the scan to the reconciliation screen and used only there, to
   * link a printed brand to a category somebody typed. Never stored: the bill
   * keeps names and numbers.
   */
  kind?: string;
};

/** How many shares each participant has claimed, per item: claims[itemId][participantId]. */
export type ClaimMap = Record<string, Record<string, number>>;

/**
 * A guest's local credentials for one table.
 *
 * This is NOT a Supabase Auth session — guests have no account. The token is
 * the only thing that proves which participant this device is.
 */
export type GuestSession = {
  participantId: string;
  tableId: string;
  guestName: string;
  sessionToken: string;
};
