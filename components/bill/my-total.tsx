import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedMoney } from '@/components/ui/animated-money';
import { Radius, Spacing } from '@/constants/theme';
import { useElevation } from '@/hooks/use-elevation';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import type { BillItem } from '@/lib/types';

type MyTotalProps = {
  totalCents: number;
  breakdown: { item: BillItem; shares: number; amountCents: number }[];
  /**
   * This person's flat slice of the tip, already folded into `totalCents`.
   * Shown as its own line so the number above is never a mystery — the item
   * lines plus this one add back up to exactly what is displayed.
   */
  tipCents?: number;
  /**
   * On an evenly split bill the share already covers everything, so there is
   * no per-item breakdown to show and nothing for the reader to tick.
   */
  evenSplit?: boolean;
  currency?: string;
};

/** The current person's running total and what makes it up, tip included. */
export function MyTotal({
  totalCents,
  breakdown,
  tipCents,
  evenSplit,
  currency,
}: MyTotalProps) {
  const accent = useThemeColor({}, 'accent');
  const accentText = useThemeColor({}, 'accentText');
  // The one card on the screen that is about the reader rather than the table,
  // so it is the one allowed to float above everything else.
  const depth = useElevation(3);

  return (
    <View style={[styles.card, { backgroundColor: accent }, depth]}>
      <View style={styles.headline}>
        <ThemedText type="label" style={[styles.label, { color: accentText }]}>
          Your Total
        </ThemedText>
        {/* Counts rather than blinks: this figure changes because somebody
            else at the table claimed something, and a number that simply
            becomes a different number gives no clue that happened. */}
        <AnimatedMoney
          cents={totalCents}
          currency={currency}
          size="moneyLarge"
          style={[styles.total, { color: accentText }]}
        />
      </View>

      {evenSplit ? (
        <ThemedText style={[styles.empty, { color: accentText }]}>
          An equal share of the whole bill.
        </ThemedText>
      ) : breakdown.length === 0 && !tipCents ? (
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

          {Boolean(tipCents) && (
            <View style={styles.line}>
              <ThemedText style={[styles.lineName, { color: accentText }]} numberOfLines={1}>
                Tip (split evenly)
              </ThemedText>
              <ThemedText style={[styles.lineAmount, { color: accentText }]}>
                {formatCents(tipCents ?? 0, currency)}
              </ThemedText>
            </View>
          )}
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
    lineHeight: 40,
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
