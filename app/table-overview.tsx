import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillTotals } from '@/components/bill/bill-totals';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConnectionIndicator } from '@/components/ui/connection-status';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Radius, Spacing } from '@/constants/theme';
import { useRealtimeBill } from '@/hooks/use-realtime-bill';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import { getActiveBill, getBillSummary } from '@/lib/services/bill-service';
import { getBillItems } from '@/lib/services/bill-item-service';
import {
  getAdminParticipantId,
  getBillAssignmentSummary,
  getGuestClaims,
  getGuestTotals,
} from '@/lib/services/claim-service';
import { getGuestTable } from '@/lib/services/guest-table-service';
import { getBillClaimDetails, getBillParticipantTotals } from '@/lib/services/overview-service';
import { getTable, listParticipants } from '@/lib/services/table-service';
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

type PersonTotal = { id: string; name: string; totalCents: number; isMe: boolean };

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

  const [context, setContext] = useState<TableContext | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  // Guests claim ITEMS, so what they can ever cover is the subtotal — remaining
  // still holds the tax, service and tip nobody picks off a receipt. Reading it
  // as `remaining === 0` would never come true on a bill carrying any tax, and
  // would be a second definition of a thing the database already decides.
  const settled = overview?.status === 'FULLY_ASSIGNED';

  if (loading && !overview) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator />
          <ThemedText type="secondary">Loading the bill…</ThemedText>
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
            <EmptyState message="Nothing to show yet" hint="The bill has not been started." />
          ) : (
            <>
              {me && (
                <View style={[styles.myTotal, { backgroundColor: accent }]}>
                  <ThemedText type="label" style={[styles.myTotalLabel, { color: accentText }]}>
                    Your Total
                  </ThemedText>
                  <ThemedText style={[styles.myTotalValue, { color: accentText }]}>
                    {formatCents(me.totalCents, overview.currency)}
                  </ThemedText>
                </View>
              )}

              <View style={styles.totalsBlock}>
                <BillTotals
                  totalCents={overview.totalCents}
                  assignedCents={overview.assignedCents}
                  remainingCents={overview.remainingCents}
                  currency={overview.currency}
                />

                {/* Spelled out, not just the green figure above: colour alone
                    is not something everyone can read. */}
                {settled && (
                  <ThemedText type="secondary" style={[styles.settled, { color: success }]}>
                    Every item has been claimed.
                    {overview.remainingCents > 0
                      ? ` What is left is tax, service and tip, which nobody picks off the receipt.`
                      : ''}
                  </ThemedText>
                )}
              </View>

              <View style={styles.section}>
                <ThemedText type="label" style={styles.sectionLabel}>
                  People · {people.length}
                </ThemedText>

                <View>
                  {people.map((person, index) => (
                    <Pressable
                      key={person.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${person.name}${person.isMe ? ', you' : ''}, ${formatCents(person.totalCents, overview.currency)}. See what they claimed.`}
                      onPress={() =>
                        router.push({
                          pathname: '/participant/[id]',
                          params: { id: person.id, tableId },
                        })
                      }
                      style={({ pressed }) => [
                        styles.personRow,
                        index > 0 && styles.divider,
                        index > 0 && { borderTopColor: border },
                        pressed && styles.pressed,
                      ]}>
                      <Avatar name={person.name} size={36} />
                      <ThemedText style={styles.personName} numberOfLines={1}>
                        {person.name}
                        {person.isMe ? ' (You)' : ''}
                      </ThemedText>
                      <ThemedText style={styles.amount}>
                        {formatCents(person.totalCents, overview.currency)}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <ThemedText type="label" style={styles.sectionLabel}>
                  Items · {overview.items.length}
                </ThemedText>

                {overview.items.length === 0 ? (
                  <EmptyState
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

                        <ThemedText type="secondary" style={styles.availability}>
                          {availabilityLabel(item, overview.currency)}
                        </ThemedText>

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
  const [items, totals, summary] = await Promise.all([
    getGuestClaims(sessionToken),
    getGuestTotals(sessionToken),
    getBillAssignmentSummary(sessionToken),
  ]);

  if (!summary) return null;

  return {
    billId: summary.billId,
    currency: summary.currency,
    status: summary.status,
    totalCents: summary.billTotalCents,
    assignedCents: summary.assignedTotalCents,
    remainingCents: summary.remainingTotalCents,
    people: totals.map((total) => ({
      id: total.participant_id,
      name: total.participant_name,
      totalCents: total.total_cents,
      isMe: total.is_me,
    })),
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

  const bill = await getActiveBill(tableId);
  if (!bill) return null;

  const [summary, totals, details, lines, everyone, meId] = await Promise.all([
    getBillSummary(bill.id),
    getBillParticipantTotals(bill.id),
    getBillClaimDetails(bill.id),
    // `bill_claim_details` only holds lines somebody claimed. The receipt is
    // read separately so an untouched item still appears, which is exactly the
    // thing a guest needs to see.
    getBillItems(bill.id),
    listParticipants(tableId),
    getAdminParticipantId(tableId),
  ]);

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
    remainingCents: bill.total_cents - assignedCents,
    // Everyone at the table, including anyone still on zero — the guest view
    // shows them too, and a missing name reads as a bug.
    people: everyone.map((person) => ({
      id: person.id ?? '',
      name: person.name ?? '',
      totalCents: totals.find((total) => total.participant_id === person.id)?.total_cents ?? 0,
      isMe: Boolean(meId) && person.id === meId,
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
    paddingVertical: Spacing.sm,
  },
  personName: { flex: 1, fontWeight: '500' },
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
