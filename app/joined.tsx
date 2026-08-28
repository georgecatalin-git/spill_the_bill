import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Appear } from '@/components/ui/appear';
import { Card } from '@/components/ui/card';
import { SuccessCheck } from '@/components/ui/success-check';
import { Spacing } from '@/constants/theme';
import { useRealtimeTable } from '@/hooks/use-realtime-bill';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  getGuestParticipants,
  getGuestTable,
  type GuestTable,
} from '@/lib/services/guest-table-service';
import { useGuest } from '@/providers/guest-provider';

/**
 * Guest view straight after joining.
 *
 * Waits here until the admin opens the bill. The table topic pushes both
 * arrivals and the status change, so the wait ends on its own; Refresh stays
 * for anyone who would rather not trust that.
 */
export default function JoinedScreen() {
  const { session, leave } = useGuest();
  const success = useThemeColor({}, 'success');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const warning = useThemeColor({}, 'warning');

  const [table, setTable] = useState<GuestTable | null>(null);
  const [peopleCount, setPeopleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;

    setError(null);
    try {
      const [loadedTable, people] = await Promise.all([
        getGuestTable(session.sessionToken),
        getGuestParticipants(session.sessionToken),
      ]);

      setTable(loadedTable);
      setPeopleCount(people.filter((person) => person.is_active).length);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the table.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  // Live from here: people arriving, and the table status turning over the
  // moment the admin opens the bill.
  useRealtimeTable(session?.tableId, load);

  const tableName = table?.name ?? session?.guestName ?? 'the table';
  const ready = (table?.status ?? 'WAITING_FOR_GUESTS') !== 'WAITING_FOR_GUESTS';
  const people = peopleCount;

  function confirmLeave() {
    Alert.alert('Leave this table?', 'You can join again using the invitation link.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leave();
          router.replace('/');
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.body}>
          <Appear style={styles.headline} lift={14}>
            {/* Drawn rather than shown, once, with the success haptic: this is
                the moment somebody finds out they are actually at the table,
                and it is the only place in the guest flow worth a flourish. */}
            <View style={styles.mark}>
              <SuccessCheck size={56} />
            </View>

            <ThemedText type="title" style={styles.title}>
              {ready ? 'Your bill is ready' : "You're in!"}
            </ThemedText>
            <ThemedText type="secondary" style={styles.lead}>
              {ready ? 'The receipt is shared with the table.' : `You're now part of ${tableName}.`}
            </ThemedText>
          </Appear>

          <Appear index={1}>
          <Card depth={2} style={styles.card}>
            <View style={styles.row}>
              <ThemedText type="secondary">People at the table</ThemedText>
              <ThemedText style={styles.count}>{loading ? '—' : people}</ThemedText>
            </View>

            <View style={styles.status}>
              <View style={[styles.dot, { backgroundColor: ready ? success : textSecondary }]} />
              <ThemedText type="secondary">
                {ready ? 'The receipt is shared' : 'Waiting for the bill…'}
              </ThemedText>
            </View>
          </Card>
          </Appear>

          {error && (
            <ThemedText type="secondary" style={{ color: warning }}>
              {error}
            </ThemedText>
          )}
        </View>

        <View style={styles.actions}>
          <Button
            label={ready ? 'See the bill' : 'Waiting for the bill…'}
            disabled={!ready}
            onPress={() => router.replace('/bill')}
          />
          <Button label="Refresh" variant="secondary" onPress={load} />
          <Button label="Leave Table" variant="secondary" onPress={confirmLeave} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  mark: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  lead: {
    textAlign: 'center',
  },
  headline: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    textAlign: 'center',
  },
  card: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  count: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  actions: {
    gap: Spacing.sm,
  },
});
