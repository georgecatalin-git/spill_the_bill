import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';

type BillTotalsProps = {
  totalCents: number;
  assignedCents: number;
  remainingCents: number;
  currency?: string;
};

/** Bill total, and how much of it is spoken for. */
export function BillTotals({
  totalCents,
  assignedCents,
  remainingCents,
  currency,
}: BillTotalsProps) {
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');

  const settled = remainingCents === 0;

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.headline}>
        <ThemedText type="label" style={styles.label}>
          Bill Total
        </ThemedText>
        <ThemedText style={styles.total}>{formatCents(totalCents, currency)}</ThemedText>
      </View>

      <View style={[styles.split, { borderTopColor: border }]}>
        <View style={styles.column}>
          <ThemedText type="secondary" style={styles.columnLabel}>
            Assigned
          </ThemedText>
          <ThemedText style={styles.columnValue}>
            {formatCents(assignedCents, currency)}
          </ThemedText>
        </View>

        <View style={[styles.column, styles.columnRight]}>
          <ThemedText type="secondary" style={styles.columnLabel}>
            Remaining
          </ThemedText>
          <ThemedText style={[styles.columnValue, { color: settled ? success : warning }]}>
            {formatCents(remainingCents, currency)}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  headline: {
    gap: Spacing.xs,
  },
  label: {
    opacity: 0.6,
  },
  total: {
    fontSize: 32,
    lineHeight: 42,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  split: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  column: {
    flex: 1,
    gap: 2,
  },
  columnRight: {
    alignItems: 'flex-end',
  },
  columnLabel: {
    fontSize: 13,
  },
  columnValue: {
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
