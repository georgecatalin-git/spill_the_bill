import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TableCard } from '@/components/admin/table-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getGreeting } from '@/lib/greeting';
import { openTable, useAdminTables } from '@/lib/services/use-admin-tables';
import { useAuth } from '@/providers/auth-provider';

export default function DashboardScreen() {
  const { user } = useAuth();
  const { tables, loading, error, reload } = useAdminTables();
  const warning = useThemeColor({}, 'warning');

  // Coming back from creating a table should show it straight away.
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={styles.greeting}>
            {getGreeting()}, {user?.name}
          </ThemedText>

          <View style={styles.section}>
            <ThemedText type="label" style={styles.sectionLabel}>
              Your Tables
            </ThemedText>

            {loading && tables.length === 0 ? (
              <ActivityIndicator />
            ) : tables.length === 0 ? (
              <EmptyState
                message="No tables yet"
                hint="Create your first table to get started."
              />
            ) : (
              <View style={styles.list}>
                {tables.map((table) => (
                  <TableCard key={table.id} table={table} onPress={() => openTable(table)} />
                ))}
              </View>
            )}

            {error && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button label="+ New Table" onPress={() => router.push('/new-table')} />
        </View>
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
    paddingBottom: Spacing.lg,
    gap: Spacing.xl,
  },
  greeting: {
    fontSize: 30,
    lineHeight: 39,
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
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.sm,
  },
});
