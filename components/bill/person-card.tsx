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
 */

type PersonCardProps = {
  person: Participant;
  isMe: boolean;
  /** Their whole share: items plus their slice of the tip. */
  totalCents: number;
  /** The tip part of it, shown so the figure can be checked rather than trusted. */
  tipCents: number;
  currency?: string;
  /** False once the bill is closed — a settled bill is a record, not a form. */
  canEdit: boolean;
  busy?: boolean;
  onAdd: () => void;
  onToggleSettled: () => void;
};

export function PersonCard({
  person,
  isMe,
  totalCents,
  tipCents,
  currency,
  canEdit,
  busy,
  onAdd,
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
