import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedMoney } from '@/components/ui/animated-money';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { TableSummary } from '@/lib/types';

type TableCardProps = {
  table: TableSummary;
  onPress?: () => void;
};

/**
 * One session in the list.
 *
 * The status is a pill rather than a dot and a word: at a glance down a list of
 * twenty, a filled shape is read as a colour and a dot is read as punctuation.
 * Depth and the press come from `Card`, so this behaves like every other
 * pressable surface in the app without knowing how any of it works.
 */
export function TableCard({ table, onPress }: TableCardProps) {
  const success = useThemeColor({}, 'success');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const accentSoft = useThemeColor({}, 'accentSoft');

  const isActive = table.status === 'active';

  return (
    <Card
      depth={isActive ? 2 : 1}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${table.name} at ${table.restaurant}, ${
        table.peopleCount
      } people, ${isActive ? 'active' : 'completed'}`}
      style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <ThemedText type="heading" numberOfLines={1}>
            {table.name}
          </ThemedText>
          <ThemedText type="caption" numberOfLines={1}>
            {table.restaurant}
          </ThemedText>
        </View>

        <View
          style={[
            styles.pill,
            { backgroundColor: isActive ? `${success}22` : accentSoft },
          ]}>
          <View style={[styles.dot, { backgroundColor: isActive ? success : textSecondary }]} />
          <ThemedText
            type="caption"
            style={[styles.pillLabel, { color: isActive ? success : textSecondary }]}>
            {isActive ? 'Active' : 'Closed'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.footer}>
        <ThemedText type="secondary">
          {table.peopleCount} {table.peopleCount === 1 ? 'person' : 'people'}
        </ThemedText>
        <AnimatedMoney cents={table.totalCents} currency={table.currency} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md + 2,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  titles: {
    flex: 1,
    gap: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
