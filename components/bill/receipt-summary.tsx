import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';

type ReceiptSummaryProps = {
  detectedTotalCents: number;
  itemsTotalCents: number;
  currency?: string;
};

/** Compares the receipt's printed total against the sum of the listed items. */
export function ReceiptSummary({ detectedTotalCents, itemsTotalCents, currency }: ReceiptSummaryProps) {
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');

  const matches = detectedTotalCents === itemsTotalCents;

  return (
    <View style={styles.container}>
      <View style={[styles.totalRow, { borderTopColor: border }]}>
        <ThemedText style={styles.totalLabel}>Detected total</ThemedText>
        <ThemedText style={styles.totalValue}>{formatCents(detectedTotalCents, currency)}</ThemedText>
      </View>

      {!matches && (
        <View style={styles.itemsRow}>
          <ThemedText type="secondary">Items total</ThemedText>
          <ThemedText type="secondary" style={styles.itemsValue}>
            {formatCents(itemsTotalCents, currency)}
          </ThemedText>
        </View>
      )}

      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: matches ? success : warning }]} />
        <ThemedText type="secondary" style={styles.statusLabel}>
          {matches
            ? 'Receipt looks good.'
            : "Please check the items. The totals don't match."}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  totalLabel: {
    fontWeight: '600',
  },
  totalValue: {
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 23,
    fontVariant: ['tabular-nums'],
  },
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemsValue: {
    fontVariant: ['tabular-nums'],
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    flex: 1,
  },
});
