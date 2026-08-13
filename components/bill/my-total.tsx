import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import type { BillItem } from '@/lib/types';

type MyTotalProps = {
  totalCents: number;
  breakdown: { item: BillItem; shares: number; amountCents: number }[];
  currency?: string;
};

/** The current person's running total and what makes it up. */
export function MyTotal({ totalCents, breakdown, currency }: MyTotalProps) {
  const accent = useThemeColor({}, 'accent');
  const accentText = useThemeColor({}, 'accentText');

  return (
    <View style={[styles.card, { backgroundColor: accent }]}>
      <View style={styles.headline}>
        <ThemedText type="label" style={[styles.label, { color: accentText }]}>
          Your Total
        </ThemedText>
        <ThemedText style={[styles.total, { color: accentText }]}>
          {formatCents(totalCents, currency)}
        </ThemedText>
      </View>

      {breakdown.length === 0 ? (
        <ThemedText style={[styles.empty, { color: accentText }]}>
          Tap + on what you had.
        </ThemedText>
      ) : (
        <View style={styles.lines}>
          {breakdown.map(({ item, shares, amountCents }) => (
            <View key={item.id} style={styles.line}>
              <ThemedText style={[styles.lineName, { color: accentText }]} numberOfLines={1}>
                {item.name}
                {shares > 1 && item.quantity > 1 ? ` × ${shares}` : ''}
              </ThemedText>
              <ThemedText style={[styles.lineAmount, { color: accentText }]}>
                {formatCents(amountCents, currency)}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  headline: {
    gap: Spacing.xs,
  },
  label: {
    opacity: 0.7,
  },
  total: {
    fontSize: 32,
    lineHeight: 42,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    opacity: 0.7,
  },
  lines: {
    gap: Spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  lineName: {
    flex: 1,
    opacity: 0.85,
  },
  lineAmount: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    opacity: 0.85,
  },
});
