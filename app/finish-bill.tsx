import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import {
  completeBill,
  getActiveBill,
  getCompletionBlocker,
} from '@/lib/services/bill-service';
import { getBillParticipantTotals } from '@/lib/services/overview-service';

type Share = { id: string; name: string; totalCents: number };

/** Admin view: the last check before closing the bill. */
export default function FinishBillScreen() {
  const { tableId } = useLocalSearchParams<{ tableId?: string }>();
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');

  const [billId, setBillId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('EUR');
  const [billTotalCents, setBillTotalCents] = useState(0);
  const [shares, setShares] = useState<Share[]>([]);
  const [blocker, setBlocker] = useState<string | null>('Loading…');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tableId) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const bill = await getActiveBill(tableId);
      if (!bill) {
        setBlocker('There is no open bill at this table.');
        return;
      }

      const [totals, reason] = await Promise.all([
        getBillParticipantTotals(bill.id),
        getCompletionBlocker(bill.id),
      ]);

      setBillId(bill.id);
      setCurrency(bill.currency);
      setBillTotalCents(bill.total_cents);
      setBlocker(reason);
      setShares(
        totals
          .filter((total) => (total.total_cents ?? 0) > 0)
          .map((total) => ({
            id: total.participant_id ?? '',
            name: total.name ?? '',
            totalCents: total.total_cents ?? 0,
          }))
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the bill.');
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFinish() {
    if (!billId) return;

    setError(null);
    try {
      await completeBill(billId);
      router.dismissTo({ pathname: '/bill', params: { tableId: tableId as string } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not finish the bill.');
      await load();
    }
  }

  const sharesSum = shares.reduce((sum, share) => sum + share.totalCents, 0);

  if (loading) {
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
          <ScreenHeader title="Finish Bill" subtitle="Everyone's share" />

          {shares.length === 0 ? (
            <EmptyState icon="🫱" message="Nobody has claimed anything yet." />
          ) : (
            <View>
              {shares.map((share, index) => (
                <View
                  key={share.id}
                  style={[
                    styles.row,
                    index > 0 && styles.divider,
                    index > 0 && { borderTopColor: border },
                  ]}>
                  <Avatar name={share.name} size={36} />
                  <ThemedText style={styles.name} numberOfLines={1}>
                    {share.name}
                  </ThemedText>
                  <ThemedText style={styles.amount}>
                    {formatCents(share.totalCents, currency)}
                  </ThemedText>
                </View>
              ))}

              <View style={[styles.totalRow, { borderTopColor: border }]}>
                <ThemedText style={styles.totalLabel}>Total</ThemedText>
                <ThemedText style={styles.totalValue}>
                  {formatCents(sharesSum, currency)}
                </ThemedText>
              </View>
            </View>
          )}

          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: blocker ? warning : success }]} />
            <ThemedText type="secondary" style={styles.statusLabel}>
              {blocker ?? `Shares match the bill total of ${formatCents(billTotalCents, currency)}.`}
            </ThemedText>
          </View>

          {error && (
            <ThemedText type="secondary" style={{ color: warning }}>
              {error}
            </ThemedText>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Finish Bill" onPress={handleFinish} disabled={blocker !== null} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  divider: { borderTopWidth: 1 },
  name: { flex: 1, fontWeight: '500' },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
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
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { flex: 1 },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
  },
});
