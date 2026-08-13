import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TableCard } from '@/components/admin/table-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
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
            <ActivityIndicator />
          ) : tables.length === 0 ? (
            <EmptyState message="No tables yet" hint="Your tables will appear here." />
          ) : (
            <>
              {active.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="label" style={styles.sectionLabel}>
                    Active · {active.length}
                  </ThemedText>
                  <View style={styles.list}>
                    {active.map((table) => (
                      <TableCard key={table.id} table={table} onPress={() => openTable(table)} />
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
                    {completed.map((table) => (
                      <TableCard key={table.id} table={table} onPress={() => openTable(table)} />
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
