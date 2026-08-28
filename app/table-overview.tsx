import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillTotals } from '@/components/bill/bill-totals';
import { EvenSplit } from '@/components/bill/even-split';
import { TipSplit } from '@/components/bill/tip-split';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnimatedMoney } from '@/components/ui/animated-money';
import { Appear } from '@/components/ui/appear';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConnectionIndicator } from '@/components/ui/connection-status';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SkeletonList } from '@/components/ui/skeleton';
import { Radius, Spacing } from '@/constants/theme';
import { useElevation } from '@/hooks/use-elevation';
import { useRealtimeBill } from '@/hooks/use-realtime-bill';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import { getBillSummary, getTableBill } from '@/lib/services/bill-service';
import { getBillItems } from '@/lib/services/bill-item-service';
import {
  getAdminParticipantId,
  getBillAssignmentSummary,
  getGuestClaims,
  getGuestEvenShares,
  getGuestSettlements,
  getGuestTotals,
  getTipShares,
} from '@/lib/services/claim-service';
import { getGuestTable } from '@/lib/services/guest-table-service';
import {
  getBillClaimDetails,
  getBillEvenShares,
  getBillParticipantTotals,
  getBillTipShares,
} from '@/lib/services/overview-service';
import {
  getTable,
  listParticipants,
  setParticipantSettled,
} from '@/lib/services/table-service';
import { useGuest } from '@/providers/guest-provider';

/** One person's hold on one receipt line, with the amount the server worked out. */
type Claimant = { id: string; name: string; quantity: number; amountCents: number };

/** One line of the receipt with everyone who took a piece of it. */
type ItemBreakdown = {
  id: string;
  name: string;
  quantity: number;
  lineTotalCents: number;
  claimedQuantity: number;
  /** Null for shareable lines: there is no unit count to run out of. */
  availableQuantity: number | null;
  assignedCents: number;
  claimants: Claimant[];
};

/**
 * `totalCents` is what this person owes altogether: their item shares plus
 * their flat slice of the tip. The same figure "Your Total" shows for the
 * reader, so a name here and "You" elsewhere are never different numbers for
 * the same person.
 */
type PersonTotal = {
  id: string;
  name: string;
  totalCents: number;
  isMe: boolean;
  /** Whether the admin has confirmed this person handed their money over. */
  settled: boolean;
};

type TipShareRow = { id: string; name: string; isMe: boolean; amountCents: number };
type EvenShareRow = { id: string; name: string; isMe: boolean; amountCents: number };

type Overview = {
  /** Which bill this picture belongs to, so it can be watched for changes. */
  billId: string;
  currency: string;
  status: string;
  totalCents: number;
  assignedCents: number;
  remainingCents: number;
  people: PersonTotal[];
  items: ItemBreakdown[];
  tipShares: TipShareRow[];
  /** Non-empty only when the bill is split evenly; then it replaces the rest. */
  evenShares: EvenShareRow[];
  splitEvenly: boolean;
};

/** The parts that do not move while the bill does: fetched once, not on every event. */
type TableContext = { tableName: string; restaurantName: string };

/** Who owes what at this table. Reached by the admin and by guests alike. */
export default function TableOverviewScreen() {
  const { tableId } = useLocalSearchParams<{ tableId?: string }>();
  const { session } = useGuest();
  const border = useThemeColor({}, 'border');
  const warning = useThemeColor({}, 'warning');
  const accent = useThemeColor({}, 'accent');
  const accentText = useThemeColor({}, 'accentText');
  const success = useThemeColor({}, 'success');
  // The one card about the reader rather than the table, so the one allowed to
  // float above the rest — the same rule the bill screen follows.
  const myTotalDepth = useElevation(3);

  const [context, setContext] = useState<TableContext | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Which person's payment is being recorded, so their button can't be double-tapped. */
  const [settling, setSettling] = useState<string | null>(null);

  // The table name and which participant this device is do not change while
  // people claim things, so they are read once rather than on every event.
  const hasContext = useRef(false);

  useEffect(() => {
    hasContext.current = false;
    setContext(null);
  }, [session, tableId]);

  const load = useCallback(async () => {
    setError(null);

    try {
      const [loadedContext, loadedOverview] = await Promise.all([
        hasContext.current
          ? null
          : session
            ? guestContext(session.sessionToken)
            : adminContext(tableId),
        session ? loadAsGuest(session.sessionToken) : loadAsAdmin(tableId),
      ]);

      if (loadedContext) {
        hasContext.current = true;
        setContext(loadedContext);
      }
      setOverview(loadedOverview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load this bill.');
    } finally {
      setLoading(false);
    }
  }, [session, tableId]);

  useEffect(() => {
    load();
  }, [load]);

  // Same bill, same channel: the guest reading this screen and the admin
  // reading it are watching the one topic, and each re-reads through their own
  // authorised path.
  const { connectionStatus } = useRealtimeBill(overview?.billId, load);

  /**
   * Records a payment, then reloads from the server rather than flipping the
   * row locally — the database stays the one that says who has paid, and
   * everyone else's screen hears about it on the same channel.
   */
  const toggleSettled = useCallback(
    async (participantId: string, currentlySettled: boolean) => {
      setSettling(participantId);
      setError(null);

      try {
        await setParticipantSettled(participantId, !currentlySettled);
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not record that payment.');
      } finally {
        setSettling(null);
      }
    },
    [load]
  );

  // Biggest share first, so "who owes most" reads off the top. Sorting is
  // stable, so people on the same amount keep their joining order instead of
  // shuffling every time someone claims something.
  const people = useMemo(
    () => (overview ? [...overview.people].sort((a, b) => b.totalCents - a.totalCents) : []),
    [overview]
  );

  const me = people.find((person) => person.isMe);
  const isAdmin = !session;

  // "Everything is claimed" is the server's call, not a comparison made here.
  // Remaining now counts only unclaimed items, so it does reach zero — but the
  // status is still the one thing that decides, rather than a second definition
  // of settled living in the screen.
  const settled = overview?.status === 'FULLY_ASSIGNED';

  if (loading && !overview) {
    return (
      <ThemedView style={styles.container}>
        {/* The overview's own shape: the personal total, then the totals
            block, then the people. Laid out before the figures arrive so
            nothing shifts under a thumb already reaching for it. */}
        <SafeAreaView style={styles.loading} edges={['bottom']}>
          <SkeletonList rows={1} height={96} />
          <SkeletonList rows={1} height={140} />
          <SkeletonList rows={4} height={56} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title={context?.tableName || 'Table Overview'}
            subtitle={context?.restaurantName || 'Tap a person to see what they claimed.'}
          />

          <View style={styles.statusRow}>
            <ConnectionIndicator status={connectionStatus} />
            {overview && (
              <ThemedText type="secondary" style={styles.statusLabel}>
                {statusLabel(overview.status)}
              </ThemedText>
            )}
          </View>

          {error && (
            <View style={styles.errorBlock}>
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
              <Button label="Retry" variant="secondary" onPress={load} />
            </View>
          )}

          {!overview ? (
            <EmptyState
              icon="⏳"
              message="Nothing to show yet"
              hint="The bill has not been started."
            />
          ) : (
            <>
              {me && (
                <View style={[styles.myTotal, { backgroundColor: accent }, myTotalDepth]}>
                  <ThemedText type="label" style={[styles.myTotalLabel, { color: accentText }]}>
                    Your Total
                  </ThemedText>
                  <AnimatedMoney
                    cents={me.totalCents}
                    currency={overview.currency}
                    size="moneyLarge"
                    style={[styles.myTotalValue, { color: accentText }]}
                  />
                </View>
              )}

              <View style={styles.totalsBlock}>
                <BillTotals
                  totalCents={overview.totalCents}
                  assignedCents={overview.assignedCents}
                  remainingCents={overview.remainingCents}
                  // The tip shares already sum to the bill's tip, so naming
                  // the remainder costs no extra read.
                  tipCents={overview.tipShares.reduce((sum, s) => sum + s.amountCents, 0)}
                  fullyAssigned={settled}
                  currency={overview.currency}
                />

                {/* Spelled out, not just the green figure above: colour alone
                    is not something everyone can read. */}
                {settled && (
                  <ThemedText type="secondary" style={[styles.settled, { color: success }]}>
                    {/* The figure above names what is left, so repeating it
                        here would only add a second, vaguer version of it. */}
                    {overview.splitEvenly
                      ? 'The whole bill is divided evenly. Nothing left to claim.'
                      : 'Every item has been claimed.'}
                  </ThemedText>
                )}
              </View>

              <View style={styles.section}>
                <ThemedText type="label" style={styles.sectionLabel}>
                  People · {people.length}
                </ThemedText>

                <View>
                  {people.map((person, index) => (
                    // Sorted biggest share first, so the order changes as
                    // people claim. Arriving in sequence rather than as a slab
                    // makes that reorder legible instead of startling.
                    <Appear
                      key={person.id}
                      index={index}
                      style={[
                        styles.personRow,
                        index > 0 && styles.divider,
                        index > 0 && { borderTopColor: border },
                      ]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${person.name}${person.isMe ? ', you' : ''}, ${formatCents(person.totalCents, overview.currency)}${person.settled ? ', paid' : ''}. See what they claimed.`}
                        onPress={() =>
                          router.push({
                            pathname: '/participant/[id]',
                            params: { id: person.id, tableId },
                          })
                        }
                        style={({ pressed }) => [styles.personMain, pressed && styles.pressed]}>
                        <Avatar name={person.name} size={36} />
                        <ThemedText style={styles.personName} numberOfLines={1}>
                          {person.name}
                          {person.isMe ? ' (You)' : ''}
                        </ThemedText>
                        {/* Counts when it moves, and strikes through once paid:
                            a settled amount is history, not something owed. */}
                        <AnimatedMoney
                          cents={person.totalCents}
                          currency={overview.currency}
                          settled={person.settled}
                          style={styles.amount}
                        />
                      </Pressable>

                      {isAdmin ? (
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: person.settled }}
                          accessibilityLabel={
                            person.settled
                              ? `Mark ${person.name} as not paid`
                              : `Mark ${person.name} as paid`
                          }
                          disabled={settling === person.id}
                          onPress={() => toggleSettled(person.id, person.settled)}
                          style={({ pressed }) => [
                            styles.settleButton,
                            {
                              borderColor: person.settled ? success : border,
                              backgroundColor: person.settled ? success : 'transparent',
                            },
                            pressed && styles.pressed,
                          ]}>
                          <ThemedText
                            style={[
                              styles.settleMark,
                              { color: person.settled ? accentText : border },
                            ]}>
                            ✓
                          </ThemedText>
                        </Pressable>
                      ) : (
                        // Guests see the state but cannot change it — only the
                        // person the money reaches gets to say it arrived.
                        person.settled && (
                          <ThemedText type="secondary" style={[styles.paidLabel, { color: success }]}>
                            Paid
                          </ThemedText>
                        )
                      )}
                    </Appear>
                  ))}
                </View>
              </View>

              <EvenSplit shares={overview.evenShares} currency={overview.currency} />

              <TipSplit shares={overview.tipShares} currency={overview.currency} />

              <View style={styles.section}>
                <ThemedText type="label" style={styles.sectionLabel}>
                  Items · {overview.items.length}
                </ThemedText>

                {overview.items.length === 0 ? (
                  <EmptyState
                    icon="🧾"
                    message="No items yet"
                    hint={
                      isAdmin
                        ? 'Add items to start the bill.'
                        : 'Waiting for the admin to add items.'
                    }
                  />
                ) : (
                  <View style={styles.itemList}>
                    {overview.items.map((item) => (
                      <View key={item.id} style={[styles.itemCard, { borderColor: border }]}>
                        <View style={styles.itemHeader}>
                          <ThemedText style={styles.itemName}>
                            {item.name}
                            {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                          </ThemedText>
                          <ThemedText style={styles.amount}>
                            {formatCents(item.lineTotalCents, overview.currency)}
                          </ThemedText>
                        </View>

                        {/* Claim counts mean nothing on an evenly split bill —
                            the receipt is there to be read, not ticked. */}
                        {!overview.splitEvenly && (
                          <ThemedText type="secondary" style={styles.availability}>
                            {availabilityLabel(item, overview.currency)}
                          </ThemedText>
                        )}

                        {item.claimants.length > 0 && (
                          <View style={styles.claimList}>
                            {item.claimants.map((claimant) => (
                              <View key={claimant.id} style={styles.claimRow}>
                                <ThemedText type="secondary">
                                  {claimant.name}
                                  {item.quantity > 1 ? ` × ${claimant.quantity}` : ''}
                                </ThemedText>
                                <ThemedText type="secondary" style={styles.claimAmount}>
                                  {formatCents(claimant.amountCents, overview.currency)}
                                </ThemedText>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <Button label="Refresh" variant="secondary" onPress={load} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Reads as a sentence rather than a database enum. */
function statusLabel(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'Not started';
    case 'OPEN':
      return 'Open';
    case 'FULLY_ASSIGNED':
      return 'Fully assigned';
    case 'COMPLETED':
      return 'Bill completed';
    default:
      return '';
  }
}

/**
 * How much of a line is spoken for.
 *
 * Units and money are different things and the line says both: "3 of 4
 * claimed" counts drinks, the amount next to it is what those three cost.
 */
function availabilityLabel(item: ItemBreakdown, currency: string) {
  if (item.claimedQuantity === 0) {
    return item.availableQuantity === null
      ? 'Not selected yet'
      : `Not selected yet · ${item.availableQuantity} available`;
  }

  const assigned = formatCents(item.assignedCents, currency);

  if (item.availableQuantity === null) {
    return `Shared by ${item.claimants.length} · ${assigned} assigned`;
  }

  const counted = `${item.claimedQuantity} of ${item.quantity} claimed`;

  return item.availableQuantity === 0
    ? `${counted} · fully assigned · ${assigned}`
    : `${counted} · ${item.availableQuantity} available · ${assigned} assigned`;
}

// ---------------------------------------------------------------------------
// Reads
//
// Every figure below comes from the server already worked out. Quantities are
// counted here because a count is not money; amounts are only ever summed,
// never divided, so the largest-remainder split stays where it belongs.
// ---------------------------------------------------------------------------

async function guestContext(sessionToken: string): Promise<TableContext> {
  const table = await getGuestTable(sessionToken);

  return { tableName: table?.name ?? '', restaurantName: table?.restaurant_name ?? '' };
}

async function adminContext(tableId: string | undefined): Promise<TableContext> {
  if (!tableId) return { tableName: '', restaurantName: '' };

  const table = await getTable(tableId);

  return { tableName: table?.name ?? '', restaurantName: table?.restaurant_name ?? '' };
}

/** Guests go through their session-scoped functions. */
async function loadAsGuest(sessionToken: string): Promise<Overview | null> {
  const [items, totals, summary, tipShares, settlements, evenShares] = await Promise.all([
    getGuestClaims(sessionToken),
    getGuestTotals(sessionToken),
    getBillAssignmentSummary(sessionToken),
    getTipShares(sessionToken),
    getGuestSettlements(sessionToken),
    getGuestEvenShares(sessionToken),
  ]);

  if (!summary) return null;

  const tipByPerson = new Map(tipShares.map((share) => [share.participant_id, share.tip_share_cents]));
  const settledByPerson = new Map(settlements.map((row) => [row.participant_id, row.settled]));

  // An even share already covers items, tax, service and tip, so it replaces
  // the per-item figure rather than being added to it.
  const evenByPerson = new Map(evenShares.map((share) => [share.participant_id, share.share_cents]));
  const splitEvenly = evenShares.length > 0;

  return {
    billId: summary.billId,
    currency: summary.currency,
    status: summary.status,
    totalCents: summary.billTotalCents,
    assignedCents: summary.assignedTotalCents,
    remainingCents: summary.remainingTotalCents,
    // Whatever the mode, this list and "Your Total" must never disagree about
    // what the same person owes.
    people: totals.map((total) => ({
      id: total.participant_id,
      name: total.participant_name,
      totalCents: splitEvenly
        ? (evenByPerson.get(total.participant_id) ?? 0)
        : total.total_cents + (tipByPerson.get(total.participant_id) ?? 0),
      isMe: total.is_me,
      settled: settledByPerson.get(total.participant_id) ?? false,
    })),
    tipShares: splitEvenly
      ? []
      : tipShares.map((share) => ({
          id: share.participant_id,
          name: share.participant_name,
          isMe: share.is_me,
          amountCents: share.tip_share_cents,
        })),
    evenShares: evenShares.map((share) => ({
      id: share.participant_id,
      name: share.participant_name,
      isMe: share.is_me,
      amountCents: share.share_cents,
    })),
    splitEvenly,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      lineTotalCents: item.total_price_cents,
      claimedQuantity: item.claimed_quantity,
      availableQuantity: item.available_quantity,
      assignedCents: item.claims.reduce((sum, claim) => sum + claim.amount_cents, 0),
      claimants: item.claims.map((claim) => ({
        id: claim.participant_id,
        name: claim.participant_name,
        quantity: claim.quantity,
        amountCents: claim.amount_cents,
      })),
    })),
  };
}

/** The admin reads the same picture through RLS on their own table. */
async function loadAsAdmin(tableId: string | undefined): Promise<Overview | null> {
  if (!tableId) return null;

  // Open or closed: a settled table still has figures worth reading, and the
  // guests are still reading them.
  const bill = await getTableBill(tableId);
  if (!bill) return null;

  const [summary, totals, details, lines, everyone, meId, tipShares, evenShares] =
    await Promise.all([
      getBillSummary(bill.id),
      getBillParticipantTotals(bill.id),
      getBillClaimDetails(bill.id),
      // `bill_claim_details` only holds lines somebody claimed. The receipt is
      // read separately so an untouched item still appears, which is exactly the
      // thing a guest needs to see.
      getBillItems(bill.id),
      listParticipants(tableId),
      getAdminParticipantId(tableId),
      getBillTipShares(bill.id),
      getBillEvenShares(bill.id),
    ]);

  const tipByPerson = new Map(tipShares.map((share) => [share.participant_id, share.tip_share_cents]));
  const evenByPerson = new Map(evenShares.map((share) => [share.participant_id, share.share_cents]));
  const splitEvenly = bill.split_mode === 'EVENLY';

  const claimsByItem = new Map<string, Claimant[]>();

  for (const row of details) {
    const itemId = row.bill_item_id ?? '';
    const claimants = claimsByItem.get(itemId) ?? [];

    claimants.push({
      id: row.participant_id ?? '',
      name: row.participant_name ?? '',
      quantity: row.claimed_quantity ?? 0,
      amountCents: row.amount_cents ?? 0,
    });
    claimsByItem.set(itemId, claimants);
  }

  const assignedCents = summary?.assigned_cents ?? 0;

  return {
    billId: bill.id,
    currency: bill.currency,
    status: bill.status,
    totalCents: bill.total_cents,
    assignedCents,
    // The database's own figure, not `total - assigned`. Those differ by the
    // tip, which is split by headcount and was never outstanding — computing it
    // here announced "Remaining 139.40" on a bill where every item had an owner.
    remainingCents: summary?.remaining_cents ?? 0,
    // Everyone at the table, including anyone still on zero — the guest view
    // shows them too, and a missing name reads as a bug. Items plus tip, same
    // as the guest side, so the two never disagree.
    people: everyone.map((person) => {
      const itemsCents = totals.find((total) => total.participant_id === person.id)?.total_cents ?? 0;
      return {
        id: person.id ?? '',
        name: person.name ?? '',
        totalCents: splitEvenly
          ? (evenByPerson.get(person.id ?? '') ?? 0)
          : itemsCents + (tipByPerson.get(person.id ?? '') ?? 0),
        isMe: Boolean(meId) && person.id === meId,
        settled: person.settled_at !== null,
      };
    }),
    evenShares: evenShares.map((share) => ({
      id: share.participant_id ?? '',
      name: share.name ?? '',
      isMe: share.participant_id === meId,
      amountCents: share.share_cents ?? 0,
    })),
    splitEvenly,
    tipShares: (splitEvenly ? [] : tipShares).map((share) => ({
      id: share.participant_id ?? '',
      name: share.name ?? '',
      isMe: share.participant_id === meId,
      amountCents: share.tip_share_cents ?? 0,
    })),
    items: lines.map((line) => {
      const claimants = claimsByItem.get(line.id) ?? [];
      const claimedQuantity = claimants.reduce((sum, claimant) => sum + claimant.quantity, 0);

      return {
        id: line.id,
        name: line.name,
        quantity: line.quantity,
        lineTotalCents: line.total_price_cents,
        claimedQuantity,
        // Same rule the database uses: only unit based lines can run out.
        availableQuantity: line.quantity > 1 ? line.quantity - claimedQuantity : null,
        assignedCents: claimants.reduce((sum, claimant) => sum + claimant.amountCents, 0),
        claimants,
      };
    }),
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  loading: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    gap: Spacing.lg,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  statusLabel: { fontSize: 13, lineHeight: 18 },
  errorBlock: { gap: Spacing.md },
  myTotal: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  myTotalLabel: { opacity: 0.7 },
  myTotalValue: {
    fontSize: 32,
    lineHeight: 42,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  totalsBlock: { gap: Spacing.sm },
  settled: { fontSize: 13, lineHeight: 18 },
  section: { gap: Spacing.md },
  sectionLabel: { opacity: 0.6 },
  divider: { borderTopWidth: 1 },
  pressed: { opacity: 0.6 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  personMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  personName: { flex: 1, fontWeight: '500' },
  settleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settleMark: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  paidLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  itemName: { fontWeight: '500' },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  itemList: { gap: Spacing.md },
  itemCard: { borderWidth: 1, borderRadius: 18, padding: Spacing.md, gap: Spacing.sm },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  availability: { fontSize: 13, lineHeight: 18 },
  claimList: { gap: Spacing.xs },
  claimRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  claimAmount: { fontVariant: ['tabular-nums'] },
});
