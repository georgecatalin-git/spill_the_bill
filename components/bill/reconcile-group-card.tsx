import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import type { DecisionId, ReconGroup } from '@/lib/reconcile';

/**
 * One thing the receipt and the tab have to say to each other.
 *
 * Both sides are always shown, even where they agree, because the question the
 * reader is answering is "is the paper right?" and that cannot be answered from
 * one column. The decision is a row of chips rather than a switch: several of
 * these have three answers, and a switch would have to invent a default for the
 * third.
 */

const DECISION_LABELS: Record<DecisionId, string> = {
  keep: 'Agreed',
  take_receipt: 'Use the receipt',
  keep_tab: 'Keep the tab',
  add_to_bill: 'Add to the bill',
  remove_from_bill: 'Remove it',
  keep_on_bill: 'Keep it',
  route_to_service: 'Service charge',
  route_to_tip: 'Tip',
  match_by_hand: 'Not decided',
  ignore: 'Leave it out',
};

function headline(group: ReconGroup) {
  switch (group.kind) {
    case 'agreed':
      return 'Matches';
    case 'price_differs':
      return 'Priced differently';
    case 'quantity_differs':
      return group.missingUnits > 0
        ? `${group.missingUnits} more on the receipt`
        : `${group.surplusUnits} fewer on the receipt`;
    case 'only_on_receipt':
      return 'Only on the receipt';
    case 'only_on_tab':
      return 'Only on the tab';
    case 'ambiguous':
      return 'Which one was it?';
    case 'not_an_item':
      return group.charge === 'service'
        ? 'A service charge'
        : group.charge === 'tip'
          ? 'A tip'
          : group.charge === 'packaging'
            ? 'A deposit'
            : group.charge === 'discount'
              ? 'A discount'
              : 'Part of the totals';
  }
}

function side(quantity: number, totalCents: number, currency?: string) {
  if (quantity === 0) return '—';
  return `${quantity} × ${formatCents(Math.round(totalCents / quantity), currency)} = ${formatCents(totalCents, currency)}`;
}

type ReconcileGroupCardProps = {
  group: ReconGroup;
  decision: DecisionId;
  currency?: string;
  onDecide: (decision: DecisionId) => void;
};

export function ReconcileGroupCard({
  group,
  decision,
  currency,
  onDecide,
}: ReconcileGroupCardProps) {
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const accent = useThemeColor({}, 'accent');
  const accentText = useThemeColor({}, 'accentText');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');

  // The same stripe the item rows use: green once there is nothing left to
  // answer, amber while there is. It reads across a table without anybody
  // parsing a number, which is the moment it is needed.
  const undecided = decision === 'match_by_hand';
  const stripe = !group.needsAnswer ? success : undecided ? warning : accent;

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <View style={[styles.stripe, { backgroundColor: stripe }]} />

      <View style={styles.body}>
        <View style={styles.heading}>
          <ThemedText style={styles.name} numberOfLines={2}>
            {group.label}
          </ThemedText>
          <ThemedText type="secondary" style={styles.headline}>
            {headline(group)}
          </ThemedText>
        </View>

        <View style={styles.sides}>
          <View style={styles.sideRow}>
            <ThemedText type="secondary" style={styles.sideLabel}>
              Tab
            </ThemedText>
            <ThemedText style={styles.sideValue}>
              {side(group.tabQuantity, group.tabTotalCents, currency)}
            </ThemedText>
          </View>
          <View style={styles.sideRow}>
            <ThemedText type="secondary" style={styles.sideLabel}>
              Receipt
            </ThemedText>
            <ThemedText style={styles.sideValue}>
              {side(group.receiptQuantity, group.receiptTotalCents, currency)}
            </ThemedText>
          </View>
        </View>

        {group.claimedUnits > 0 && (
          <ThemedText type="secondary" style={styles.note}>
            {group.claimedUnits === 1
              ? 'One of these is already claimed.'
              : `${group.claimedUnits} of these are already claimed.`}
          </ThemedText>
        )}

        {group.note && (
          <ThemedText type="secondary" style={styles.note}>
            {group.note}
          </ThemedText>
        )}

        {group.decisions.length > 1 && (
          <View style={styles.choices}>
            {group.decisions
              .filter((option) => option !== 'match_by_hand')
              .map((option) => {
                const chosen = option === decision;
                return (
                  <Pressable
                    key={option}
                    onPress={() => onDecide(option)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: chosen ? accent : border,
                        backgroundColor: chosen ? accent : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText
                      style={[styles.chipLabel, chosen ? { color: accentText } : undefined]}>
                      {DECISION_LABELS[option]}
                    </ThemedText>
                  </Pressable>
                );
              })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stripe: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  heading: {
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  headline: {
    fontSize: 13,
    lineHeight: 18,
  },
  sides: {
    gap: 2,
  },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  sideLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  sideValue: {
    fontVariant: ['tabular-nums'],
    fontSize: 14,
    lineHeight: 19,
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
