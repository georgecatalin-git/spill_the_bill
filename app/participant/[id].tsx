import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useRealtimeBill } from '@/hooks/use-realtime-bill';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import { getActiveBill } from '@/lib/services/bill-service';
import {
  getBillAssignmentSummary,
  getGuestClaims,
  getGuestTotals,
} from '@/lib/services/claim-service';
import { getBillClaimDetails } from '@/lib/services/overview-service';
import { listParticipants } from '@/lib/services/table-service';
import { useGuest } from '@/providers/guest-provider';

type Line = { id: string; name: string; quantity: number; amountCents: number };
type Detail = {
  /** The bill these lines came from, so the screen can follow it live. */
  billId: string;
  name: string;
  currency: string;
  totalCents: number;
  lines: Line[];
};

/** What one person at the table has claimed. Visible to everyone at that table. */
export default function ParticipantScreen() {
  const { id, tableId } = useLocalSearchParams<{ id: string; tableId?: string }>();
  const { session } = useGuest();
  const border = useThemeColor({}, 'border');
  const warning = useThemeColor({}, 'warning');

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      setDetail(
        session ? await loadAsGuest(session.sessionToken, id) : await loadAsAdmin(tableId, id)
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this person.');
    } finally {
      setLoading(false);
    }
  }, [session, tableId, id]);

  useEffect(() => {
    load();
  }, [load]);

  // What one person owes moves when anyone else claims a shared line, so this
  // screen has to follow the whole bill, not just this participant.
  useRealtimeBill(detail?.billId, load);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!detail) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.content}>
            <ScreenHeader title="Not found" />
            <EmptyState
              message={error ?? 'This person is not at the table.'}
            />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader title={detail.name} subtitle="At the table" />

          {error && (
            <ThemedText type="secondary" style={{ color: warning }}>
              {error}
            </ThemedText>
          )}

          {detail.lines.length === 0 ? (
            <EmptyState
              message="Nothing claimed yet"
              hint={`${detail.name} hasn't picked anything from the receipt.`}
            />
          ) : (
            <View>
              {detail.lines.map((line, index) => (
                <View
                  key={line.id}
                  style={[
                    styles.row,
                    index > 0 && styles.divider,
                    index > 0 && { borderTopColor: border },
                  ]}>
                  <ThemedText style={styles.name} numberOfLines={1}>
                    {line.name}
                    {line.quantity > 1 ? ` × ${line.quantity}` : ''}
                  </ThemedText>
                  <ThemedText style={styles.amount}>
                    {formatCents(line.amountCents, detail.currency)}
                  </ThemedText>
                </View>
              ))}

              <View style={[styles.totalRow, { borderTopColor: border }]}>
                <ThemedText style={styles.totalLabel}>Total</ThemedText>
                <ThemedText style={styles.totalValue}>
                  {formatCents(detail.totalCents, detail.currency)}
                </ThemedText>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

async function loadAsGuest(sessionToken: string, participantId: string): Promise<Detail | null> {
  const [items, totals, summary] = await Promise.all([
    getGuestClaims(sessionToken),
    getGuestTotals(sessionToken),
    getBillAssignmentSummary(sessionToken),
  ]);

  const person = totals.find((total) => total.participant_id === participantId);
  if (!person || !summary) return null;

  const lines: Line[] = [];

  for (const item of items) {
    const claim = item.claims.find((entry) => entry.participant_id === participantId);
    if (claim) {
      lines.push({
        id: item.id,
        name: item.name,
        quantity: claim.quantity,
        amountCents: claim.amount_cents,
      });
    }
  }

  return {
    billId: summary.billId,
    name: person.participant_name,
    currency: summary.currency,
    totalCents: person.total_cents,
    lines,
  };
}

async function loadAsAdmin(
  tableId: string | undefined,
  participantId: string
): Promise<Detail | null> {
  if (!tableId) return null;

  const bill = await getActiveBill(tableId);
  if (!bill) return null;

  const [details, everyone] = await Promise.all([
    getBillClaimDetails(bill.id),
    listParticipants(tableId),
  ]);

  const person = everyone.find((candidate) => candidate.id === participantId);
  if (!person) return null;

  // No claims is a real, ordinary state — not a missing person.
  const mine = details.filter((row) => row.participant_id === participantId);

  return {
    billId: bill.id,
    name: person.name ?? '',
    currency: bill.currency,
    totalCents: mine.reduce((sum, row) => sum + (row.amount_cents ?? 0), 0),
    lines: mine.map((row) => ({
      id: row.bill_item_id ?? '',
      name: row.item_name ?? '',
      quantity: row.claimed_quantity ?? 0,
      amountCents: row.amount_cents ?? 0,
    })),
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
    gap: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  divider: { borderTopWidth: 1 },
  name: { flex: 1 },
  amount: { fontWeight: '500', fontVariant: ['tabular-nums'] },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
  },
  totalLabel: { fontWeight: '600' },
  totalValue: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
