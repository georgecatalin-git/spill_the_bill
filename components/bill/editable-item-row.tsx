import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import { lineTotalCents } from '@/lib/split';
import type { BillItem } from '@/lib/types';

type EditableItemRowProps = {
  item: BillItem;
  currency?: string;
  onEdit: () => void;
  onRemove: () => void;
};

/** Detected item with explicit edit and delete actions. */
export function EditableItemRow({ item, currency, onEdit, onRemove }: EditableItemRowProps) {
  const textSecondary = useThemeColor({}, 'textSecondary');
  const surface = useThemeColor({}, 'surface');

  return (
    <View style={styles.row}>
      <View style={styles.details}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {item.name}
        </ThemedText>
        <ThemedText style={styles.price}>
          {item.quantity > 1
            ? `${item.quantity} × ${formatCents(item.unitPriceCents, currency)} = ${formatCents(lineTotalCents(item), currency)}`
            : formatCents(item.unitPriceCents, currency)}
        </ThemedText>
      </View>

      <Pressable
        onPress={onEdit}
        hitSlop={8}
        style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
        <ThemedText type="secondary" style={styles.editLabel}>
          Edit
        </ThemedText>
      </Pressable>

      <Pressable
        onPress={onRemove}
        hitSlop={8}
        style={({ pressed }) => [
          styles.remove,
          { backgroundColor: surface },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.removeGlyph, { color: textSecondary }]}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  details: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '500',
  },
  price: {
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.5,
  },
  edit: {
    paddingHorizontal: Spacing.xs,
  },
  editLabel: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  remove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeGlyph: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '500',
  },
});
