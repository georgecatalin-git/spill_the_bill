import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import type { TableSummary } from '@/lib/types';

type TableCardProps = {
  table: TableSummary;
  onPress?: () => void;
};

export function TableCard({ table, onPress }: TableCardProps) {
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const isActive = table.status === 'active';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: surface, borderColor: border },
        pressed && styles.pressed,
      ]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <ThemedText style={styles.name} numberOfLines={1}>
            {table.name}
          </ThemedText>
          <ThemedText type="secondary" style={styles.restaurant} numberOfLines={1}>
            {table.restaurant}
          </ThemedText>
        </View>

        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: isActive ? success : textSecondary }]} />
          <ThemedText type="secondary" style={styles.statusLabel}>
            {isActive ? 'Active' : 'Completed'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.footer}>
        <ThemedText type="secondary">
          {table.peopleCount} {table.peopleCount === 1 ? 'person' : 'people'}
        </ThemedText>
        <ThemedText style={styles.total}>{formatCents(table.totalCents, table.currency)}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
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
    fontSize: 17,
    fontWeight: '600',
  },
  restaurant: {
    fontSize: 14,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  total: {
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
