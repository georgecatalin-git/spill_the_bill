import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedMoney } from '@/components/ui/animated-money';
import { Radius, Spacing } from '@/constants/theme';
import { useElevation } from '@/hooks/use-elevation';
import { useThemeColor } from '@/hooks/use-theme-color';

type BillTotalsProps = {
  totalCents: number;
  assignedCents: number;
  remainingCents: number;
  /**
   * The tip, so the remainder can say what it actually is. Once every item is
   * claimed, "Remaining" is not money anyone still has to pick off the
   * receipt — it is the tip and any tax, which reads as an unexplained debt
   * unless it is named.
   */
  tipCents?: number;
  /** Whether every item has been claimed, which is what changes the meaning. */
  fullyAssigned?: boolean;
  currency?: string;
};

/**
 * Names the leftover honestly.
 *
 * Only claims the remainder is the tip when the numbers actually say so —
 * calling tax "Tip remaining" would trade one confusing label for a wrong one.
 */
function remainingLabel(remainingCents: number, tipCents: number, fullyAssigned: boolean) {
  if (!fullyAssigned || remainingCents <= 0) return 'Remaining';
  if (tipCents <= 0) return 'Tax remaining';

  return remainingCents === tipCents ? 'Tip remaining' : 'Tax & tip remaining';
}

/** Bill total, and how much of it is spoken for. */
export function BillTotals({
  totalCents,
  assignedCents,
  remainingCents,
  tipCents = 0,
  fullyAssigned = false,
  currency,
}: BillTotalsProps) {
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');

  const settled = remainingCents === 0;
  const depth = useElevation(1);

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }, depth]}>
      <View style={styles.headline}>
        <ThemedText type="label" style={styles.label}>
          Bill Total
        </ThemedText>
        <AnimatedMoney cents={totalCents} currency={currency} style={styles.total} />
      </View>

      <View style={[styles.split, { borderTopColor: border }]}>
        <View style={styles.column}>
          <ThemedText type="secondary" style={styles.columnLabel}>
            Assigned
          </ThemedText>
          <AnimatedMoney cents={assignedCents} currency={currency} style={styles.columnValue} />
        </View>

        <View style={[styles.column, styles.columnRight]}>
          <ThemedText type="secondary" style={styles.columnLabel}>
            {remainingLabel(remainingCents, tipCents, fullyAssigned)}
          </ThemedText>
          {/* Green once nothing is outstanding — the one place on this card
              where colour is carrying meaning rather than decoration. */}
          <AnimatedMoney
            cents={remainingCents}
            currency={currency}
            style={[styles.columnValue, { color: settled ? success : warning }]}
          />
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
    fontSize: 30,
    lineHeight: 38,
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
    lineHeight: 22,
  },
});
