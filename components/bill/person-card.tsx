import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import type { Participant } from '@/lib/types';

/**
 * One person at the table, with what they owe and a way to add to it.
 *
 * The reason this exists rather than a single item list: a table orders in
 * rounds, and the person who knows what they had is the person who had it.
 * Putting the "Add" next to a name turns "who wants to claim the pizza" into
 * "Bogdan, three beers and a diavola", which is the sentence people actually
 * say. Nothing new is written to reach it — the item is created and put on that
 * person in the one action the host already had.
 *
 * Somebody who has ordered nothing still gets a card, at zero. A person missing
 * from the list is a person nobody remembers to collect from.
 *
 * What they have ordered is listed underneath, each line with a "+": a table
 * orders the same things again all evening, and the second beer should cost one
 * tap rather than a form.
 */

/** One item on somebody's card: what it is, how many of it is theirs. */
export type PersonLine = {
  itemId: string;
  name: string;
  shares: number;
  amountCents: number;
  canAddMore: boolean;
};

type PersonCardProps = {
  person: Participant;
  isMe: boolean;
  /** Their whole share: items plus their slice of the tip. */
  totalCents: number;
  /** The tip part of it, shown so the figure can be checked rather than trusted. */
  tipCents: number;
  /** What they have ordered so far. Empty on an evenly split bill. */
  lines: PersonLine[];
  currency?: string;
  /** False once the bill is closed — a settled bill is a record, not a form. */
  canEdit: boolean;
  busy?: boolean;
  /** Which line is mid-write, so its "+" can stop taking taps. */
  addingTo?: string | null;
  onAdd: () => void;
  onAddOneMore: (itemId: string) => void;
  onToggleSettled: () => void;
};

export function PersonCard({
  person,
  isMe,
  totalCents,
  tipCents,
  lines,
  currency,
  canEdit,
  busy,
  addingTo,
  onAdd,
  onAddOneMore,
  onToggleSettled,
}: PersonCardProps) {
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const success = useThemeColor({}, 'success');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const settled = person.settled === true;

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: settled ? success : border }]}>
      <View style={styles.header}>
        <Avatar name={person.name} size={36} />

        <View style={styles.identity}>
          <ThemedText style={styles.name} numberOfLines={1}>
            {person.name}
            {isMe ? ' (You)' : ''}
          </ThemedText>

          {settled ? (
            // Paid means paid: nothing is owed any more, and the tip went with
            // it. The figure stays on screen because "how much did Ana give
            // you?" is asked long after the money changed hands.
            <ThemedText type="secondary" style={styles.detail}>
              Paid {formatCents(totalCents, currency)}
              {tipCents > 0 ? ', tip included' : ''}
            </ThemedText>
          ) : tipCents > 0 ? (
            <ThemedText type="secondary" style={styles.detail}>
              Includes {formatCents(tipCents, currency)} tip
            </ThemedText>
          ) : null}
        </View>

        <ThemedText style={[styles.amount, settled && { color: success }]}>
          {formatCents(settled ? 0 : totalCents, currency)}
        </ThemedText>
      </View>

      {lines.length > 0 && (
        <View style={[styles.lines, { borderTopColor: border }]}>
          {lines.map((line) => (
            <View key={line.itemId} style={styles.line}>
              <ThemedText style={styles.lineName} numberOfLines={1}>
                {line.shares > 1 ? `${line.shares} × ` : ''}
                {line.name}
              </ThemedText>

              <ThemedText type="secondary" style={styles.lineAmount}>
                {formatCents(line.amountCents, currency)}
              </ThemedText>

              {/* One tap for the next round. Offered only where widening the
                  line cannot change what anybody else owes. */}
              {canEdit && line.canAddMore && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`One more ${line.name} for ${person.name}`}
                  disabled={addingTo === line.itemId}
                  onPress={() => onAddOneMore(line.itemId)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.plus,
                    { borderColor: border },
                    pressed && styles.pressed,
                  ]}>
                  {addingTo === line.itemId ? (
                    <ActivityIndicator size="small" color={textSecondary} />
                  ) : (
                    <ThemedText style={styles.plusGlyph}>+</ThemedText>
                  )}
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {canEdit && (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add an item for ${person.name}`}
            onPress={onAdd}
            style={({ pressed }) => [
              styles.action,
              { borderColor: border },
              pressed && styles.pressed,
            ]}>
            <ThemedText style={styles.actionLabel}>Add item</ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: settled }}
            accessibilityLabel={
              settled ? `Mark ${person.name} as not paid` : `Mark ${person.name} as paid`
            }
            disabled={busy}
            onPress={onToggleSettled}
            style={({ pressed }) => [
              styles.action,
              {
                borderColor: settled ? success : border,
                backgroundColor: settled ? success : 'transparent',
              },
              pressed && !busy && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator size="small" color={settled ? '#fff' : textSecondary} />
            ) : (
              <ThemedText style={[styles.actionLabel, settled && styles.settledLabel]}>
                {settled ? 'Paid' : 'Mark paid'}
              </ThemedText>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  detail: {
    fontSize: 13,
    lineHeight: 18,
  },
  amount: {
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
  lines: {
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 30,
  },
  lineName: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  lineAmount: {
    fontSize: 14,
    lineHeight: 19,
    fontVariant: ['tabular-nums'],
  },
  plus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusGlyph: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  actionLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  settledLabel: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.6,
  },
});
