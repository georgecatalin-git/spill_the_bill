import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { currencyLabel } from '@/lib/currencies';
import { formatCents } from '@/lib/money';

type BillSummaryCardProps = {
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  tipCents: number;
  totalCents: number;
  confirmedTotalCents?: number | null;
  currency?: string;
};

/** Subtotal, the extras the admin entered, and what the bill comes to. */
export function BillSummaryCard({
  subtotalCents,
  taxCents,
  serviceChargeCents,
  tipCents,
  totalCents,
  confirmedTotalCents,
  currency,
}: BillSummaryCardProps) {
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');

  const rows = [
    { label: 'Subtotal', cents: subtotalCents, always: true },
    { label: 'Tax', cents: taxCents, always: false },
    { label: 'Service', cents: serviceChargeCents, always: false },
    { label: 'Tip', cents: tipCents, always: false },
  ].filter((row) => row.always || row.cents > 0);

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.headingRow}>
        <ThemedText type="label" style={styles.heading}>
          Bill Summary
        </ThemedText>
        <ThemedText type="secondary" style={styles.currency}>
          {currencyLabel(currency ?? 'EUR')}
        </ThemedText>
      </View>

      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <ThemedText type="secondary">{row.label}</ThemedText>
            <ThemedText style={styles.value}>{formatCents(row.cents, currency)}</ThemedText>
          </View>
        ))}
      </View>

      <View style={[styles.totalRow, { borderTopColor: border }]}>
        <ThemedText style={styles.totalLabel}>Total</ThemedText>
        <ThemedText style={styles.totalValue}>{formatCents(totalCents, currency)}</ThemedText>
      </View>

      {confirmedTotalCents !== null && confirmedTotalCents !== undefined && (
        <ThemedText type="secondary" style={styles.note}>
          Using the total you confirmed from the receipt.
        </ThemedText>
      )}
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
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    opacity: 0.6,
  },
  currency: {
    fontSize: 13,
    lineHeight: 18,
  },
  rows: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    fontVariant: ['tabular-nums'],
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
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontSize: 13,
  },
});
