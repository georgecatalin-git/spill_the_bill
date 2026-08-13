import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import {
  isUnitLimited,
  itemSplit,
  lineTotalCents,
  remainingShares,
  sharesFor,
  totalShares,
} from '@/lib/split';
import type { BillItem, ClaimMap, Participant } from '@/lib/types';

type ReceiptItemRowProps = {
  item: BillItem;
  claims: ClaimMap;
  participants: Participant[];
  currentParticipantId: string;
  currency?: string;
  /**
   * Per-person amounts worked out by the server. When present these are shown
   * instead of recomputing locally, so the screen can never disagree with the
   * database about who owes what.
   */
  amounts?: Record<string, number>;
  /** Claims are frozen once the bill is completed. */
  locked?: boolean;
  onClaim: () => void;
  onRelease: () => void;
};

/** One receipt line, with the controls for claiming a share of it. */
export function ReceiptItemRow({
  item,
  claims,
  participants,
  currentParticipantId,
  currency,
  amounts,
  locked,
  onClaim,
  onRelease,
}: ReceiptItemRowProps) {
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const accent = useThemeColor({}, 'accent');
  const accentText = useThemeColor({}, 'accentText');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const split = amounts ?? itemSplit(item, claims);
  const claimants = participants.filter((participant) => sharesFor(claims, item.id, participant.id) > 0);
  const myShares = sharesFor(claims, item.id, currentParticipantId);
  const left = remainingShares(item, claims);
  const claimable = left === null || left > 0;

  const unitLimited = isUnitLimited(item);
  const claimed = totalShares(claims, item.id);

  return (
    <View style={[styles.row, { borderColor: border }]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <ThemedText style={styles.name}>{item.name}</ThemedText>
          <ThemedText type="secondary" style={styles.price}>
            {formatCents(item.unitPriceCents, currency)}
            {item.quantity > 1 ? ` × ${item.quantity}` : ''}
          </ThemedText>
        </View>

        <View style={styles.trailing}>
          <ThemedText style={styles.lineTotal}>
            {formatCents(lineTotalCents(item), currency)}
          </ThemedText>

          {myShares === 0 ? (
            <Pressable
              onPress={onClaim}
              disabled={!claimable || locked}
              style={[
                styles.addButton,
                { backgroundColor: accent },
                (!claimable || locked) && styles.disabled,
              ]}>
              <Text style={[styles.addLabel, { color: accentText }]}>+ Add</Text>
            </Pressable>
          ) : (
            <View style={styles.stepper}>
              <Pressable
                onPress={onRelease}
                disabled={locked}
                hitSlop={6}
                style={[
                  styles.stepButton,
                  { backgroundColor: surface, borderColor: border },
                  locked && styles.disabled,
                ]}>
                <Text style={[styles.stepGlyph, { color: textSecondary }]}>−</Text>
              </Pressable>

              <ThemedText style={styles.myShares}>{myShares}</ThemedText>

              <Pressable
                onPress={onClaim}
                disabled={!claimable || locked}
                hitSlop={6}
                style={[
                  styles.stepButton,
                  { backgroundColor: accent, borderColor: accent },
                  (!claimable || locked) && styles.disabled,
                ]}>
                <Text style={[styles.stepGlyph, { color: accentText }]}>+</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {claimants.length > 0 && (
        <View style={styles.claimants}>
          <ThemedText type="secondary" style={styles.claimSummary}>
            {unitLimited
              ? `${claimed} of ${item.quantity} claimed`
              : `Shared by ${claimants.length}`}
          </ThemedText>

          <View style={styles.chips}>
            {claimants.map((participant) => {
              const shares = sharesFor(claims, item.id, participant.id);
              const isMe = participant.id === currentParticipantId;

              return (
                <View
                  key={participant.id}
                  style={[
                    styles.chip,
                    { backgroundColor: surface, borderColor: isMe ? accent : border },
                  ]}>
                  <ThemedText style={styles.chipName}>
                    {isMe ? 'You' : participant.name}
                    {unitLimited && shares > 1 ? ` × ${shares}` : ''}
                  </ThemedText>
                  <ThemedText type="secondary" style={styles.chipAmount}>
                    {formatCents(split[participant.id] ?? 0, currency)}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {unitLimited && left === 0 && claimants.length === 0 && (
        <ThemedText type="secondary">All units claimed</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
  },
  price: {
    fontSize: 14,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  lineTotal: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  addButton: {
    borderRadius: Radius.pill,
    paddingVertical: 9,
    paddingHorizontal: Spacing.md,
  },
  addLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: {
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '600',
  },
  myShares: {
    minWidth: 12,
    textAlign: 'center',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  disabled: {
    opacity: 0.25,
  },
  claimants: {
    gap: Spacing.sm,
  },
  claimSummary: {
    fontSize: 13,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  chipName: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipAmount: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});
