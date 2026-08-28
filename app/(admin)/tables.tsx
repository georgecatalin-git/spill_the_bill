import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TableCard } from '@/components/admin/table-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SkeletonList } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { enterList, settle } from '@/lib/motion';
import { openTable, useAdminTables } from '@/lib/services/use-admin-tables';

export default function TablesScreen() {
  const { tables, loading, error, reload } = useAdminTables();
  const warning = useThemeColor({}, 'warning');

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const active = tables.filter((table) => table.status === 'active');
  const completed = tables.filter((table) => table.status === 'completed');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader title="Tables" />

          {loading && tables.length === 0 ? (
            // The shape of the list, not a spinner in the middle of nothing:
            // the page is already laid out when the rows arrive, so they fill
            // in rather than shove everything down.
            <SkeletonList rows={3} height={96} />
          ) : tables.length === 0 ? (
            <EmptyState
              icon="🍽"
              message="No tables yet"
              hint="A table appears here the moment somebody opens one with your Split code."
            />
          ) : (
            <>
              {active.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="label" style={styles.sectionLabel}>
                    Active · {active.length}
                  </ThemedText>
                  <View style={styles.list}>
                    {active.map((table, index) => (
                      <Animated.View key={table.id} entering={enterList(index)} layout={settle}>
                        <TableCard table={table} onPress={() => openTable(table)} />
                      </Animated.View>
                    ))}
                  </View>
                </View>
              )}

              {completed.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="label" style={styles.sectionLabel}>
                    Completed · {completed.length}
                  </ThemedText>
                  <View style={styles.list}>
                    {completed.map((table, index) => (
                      <Animated.View
                        key={table.id}
                        // Continues the count from the active list, so the two
                        // sections read as one sequence rather than restarting.
                        entering={enterList(active.length + index)}
                        layout={settle}>
                        <TableCard table={table} onPress={() => openTable(table)} />
                      </Animated.View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {error && (
            <ThemedText type="secondary" style={{ color: warning }}>
              {error}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.md,
  },
  sectionLabel: {
    opacity: 0.6,
  },
  list: {
    gap: Spacing.md,
  },
});
