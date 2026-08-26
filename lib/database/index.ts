import type { Database, Tables, TablesInsert, TablesUpdate } from '@/lib/database/types';

/**
 * Readable names for the database rows.
 *
 * These describe what Supabase stores. The app's own in-memory shapes live in
 * `lib/types.ts`; keeping them apart means the UI is not forced to change
 * whenever a column does.
 */

export type Profile = Tables<'profiles'>;
export type Restaurant = Tables<'restaurants'>;
export type TableRow = Tables<'tables'>;
export type Participant = Tables<'participants'>;
export type Bill = Tables<'bills'>;
export type BillItem = Tables<'bill_items'>;
export type ItemClaim = Tables<'item_claims'>;

/** Participants without the guest secret — the safe way to read them. */
export type TableParticipant = Tables<'table_participants'>;

/** Derived reads: totals are computed by the database, never stored. */
export type BillItemAssignment = Tables<'bill_item_assignments'>;
export type ItemClaimShare = Tables<'item_claim_shares'>;
export type ParticipantTotal = Tables<'participant_totals'>;
export type BillParticipantTotal = Tables<'bill_participant_totals'>;
export type BillSummary = Tables<'bill_summaries'>;
export type AdminTableSummary = Tables<'admin_table_summaries'>;
export type BillClaimDetail = Tables<'bill_claim_details'>;
export type BillTipShareRow = Tables<'bill_tip_shares'>;
export type BillEvenShareRow = Tables<'bill_even_shares'>;

/** An admin account and the restaurants it may open tables at. Owner only. */
export type AdminAccount =
  Database['public']['Functions']['owner_list_admins']['Returns'][number];

/** Per-restaurant usage counts, owner only. Deliberately carries no money. */
export type OwnerRestaurantStat =
  Database['public']['Functions']['owner_restaurant_stats']['Returns'][number];

/** Who a signed-in account is. `owner` is the application owner; everyone else is an admin. */
export type ProfileRole = 'admin' | 'owner';

/** How a bill is divided: by what each person claimed, or straight down the middle. */
export type SplitMode = 'BY_ITEM' | 'EVENLY';

export type TableStatus =
  | 'WAITING_FOR_GUESTS'
  | 'BILL_IN_PROGRESS'
  | 'FULLY_ASSIGNED'
  | 'COMPLETED';

export type BillStatus = 'DRAFT' | 'OPEN' | 'FULLY_ASSIGNED' | 'COMPLETED';

export type ProfileInsert = TablesInsert<'profiles'>;
export type RestaurantInsert = TablesInsert<'restaurants'>;
export type TableInsert = TablesInsert<'tables'>;
export type ParticipantInsert = TablesInsert<'participants'>;
export type BillInsert = TablesInsert<'bills'>;
export type BillItemInsert = TablesInsert<'bill_items'>;
export type ItemClaimInsert = TablesInsert<'item_claims'>;

export type RestaurantUpdate = TablesUpdate<'restaurants'>;
export type TableUpdate = TablesUpdate<'tables'>;
export type BillUpdate = TablesUpdate<'bills'>;
export type BillItemUpdate = TablesUpdate<'bill_items'>;
export type ItemClaimUpdate = TablesUpdate<'item_claims'>;

export type { Database, Json } from '@/lib/database/types';
