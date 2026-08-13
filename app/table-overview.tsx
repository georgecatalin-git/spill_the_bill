import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillTotals } from '@/components/bill/bill-totals';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import { getActiveBill, getBillSummary } from '@/lib/services/bill-service';
import {
  getBillAssignmentSummary,
  getGuestClaims,
  getGuestTotals,
} from '@/lib/services/claim-service';
import { getBillClaimDetails, getBillParticipantTotals } from '@/lib/services/overview-service';
import { listParticipants } from '@/lib/services/table-service';
import { useGuest } from '@/providers/guest-provider';

/** One line of the receipt with everyone who took a piece of it. */
type ItemBreakdown = {
  id: string;
  name: string;
  quantity: number;
  lineTotalCents: number;
  claimants: { id: string; name: string; quantity: number; amountCents: number }[];
};

type PersonTotal = { id: string; name: string; totalCents: number };

type Overview = {
  currency: string;
  totalCents: number;
  assignedCents: number;
  remainingCents: number;
  people: PersonTotal[];
  items: ItemBreakdown[];
};

/** Who owes what at this table. Reached by the admin and by guests alike. */
export default function TableOverviewScreen() {
  const { tableId } = useLocalSearchParams<{ tableId?: string }>();
  const { session } = useGuest();
  const border = useThemeColor({}, 'border');
  const warning = useThemeColor({}, 'warning');

  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      setOverview(session ? await loadAsGuest(session.sessionToken) : await loadAsAdmin(tableId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the table.');
    } finally {
      setLoading(false);
    }
  }, [session, tableId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !overview) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader title="Table Overview" subtitle="Tap a person to see what they claimed." />

          {error && (
            <ThemedText type="secondary" style={{ color: warning }}>
              {error}
            </ThemedText>
          )}

          {!overview ? (
            <EmptyState message="Nothing to show yet" hint="The bill has not been started." />
          ) : (
            <>
              <BillTotals
                totalCents={overview.totalCents}
                assignedCents={overview.assignedCents}
                remainingCents={overview.remainingCents}
                currency={overview.currency}
              />

              <View style={styles.section}>
                <ThemedText type="label" style={styles.sectionLabel}>
                  People · {overview.people.length}
                </ThemedText>

                <View>
                  {overview.people.map((person, index) => (
                    <Pressable
                      key={person.id}
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
                  <EmptyState message="No items yet" hint="Add the receipt to get started." />
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

                        {item.claimants.length === 0 ? (
                          <ThemedText type="secondary" style={styles.unclaimed}>
                            Nobody yet
                          </ThemedText>
                        ) : (
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

/** Guests go through their session-scoped functions. */
async function loadAsGuest(sessionToken: string): Promise<Overview | null> {
  const [items, totals, summary] = await Promise.all([
    getGuestClaims(sessionToken),
    getGuestTotals(sessionToken),
    getBillAssignmentSummary(sessionToken),
  ]);

  if (!summary) return null;

  return {
    currency: summary.currency,
    totalCents: summary.billTotalCents,
    assignedCents: summary.assignedTotalCents,
    remainingCents: summary.remainingTotalCents,
    people: totals.map((total) => ({
      id: total.participant_id,
      name: total.participant_name,
      totalCents: total.total_cents,
    })),
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      lineTotalCents: item.total_price_cents,
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

  const [summary, totals, details, everyone] = await Promise.all([
    getBillSummary(bill.id),
    getBillParticipantTotals(bill.id),
    getBillClaimDetails(bill.id),
    listParticipants(tableId),
  ]);

  // Group the flat claim rows back into one entry per receipt line.
  const items = new Map<string, ItemBreakdown>();

  for (const row of details) {
    const id = row.bill_item_id ?? '';

    if (!items.has(id)) {
      items.set(id, {
        id,
        name: row.item_name ?? '',
        quantity: row.item_quantity ?? 1,
        lineTotalCents: row.total_price_cents ?? 0,
        claimants: [],
      });
    }

    items.get(id)?.claimants.push({
      id: row.participant_id ?? '',
      name: row.participant_name ?? '',
      quantity: row.claimed_quantity ?? 0,
      amountCents: row.amount_cents ?? 0,
    });
  }

  return {
    currency: bill.currency,
    totalCents: bill.total_cents,
    assignedCents: summary?.assigned_cents ?? 0,
    remainingCents: bill.total_cents - (summary?.assigned_cents ?? 0),
    // Everyone at the table, including anyone still on zero — the guest view
    // shows them too, and a missing name reads as a bug.
    people: everyone.map((person) => ({
      id: person.id ?? '',
      name: person.name ?? '',
      totalCents:
        totals.find((total) => total.participant_id === person.id)?.total_cents ?? 0,
    })),
    items: [...items.values()],
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
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
  unclaimed: { fontSize: 13, lineHeight: 18 },
  claimList: { gap: Spacing.xs },
  claimRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  claimAmount: { fontVariant: ['tabular-nums'] },
});
