import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Redirect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RestaurantRow } from '@/components/admin/restaurant-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getCurrentPosition } from '@/lib/location';
import {
  createRestaurant,
  deleteRestaurant,
  mergeRestaurants,
  setRestaurantActive,
  setRestaurantLocation,
  updateRestaurant,
} from '@/lib/services/restaurant-service';
import { useOwnerStats } from '@/lib/services/use-owner-stats';
import { isBlank } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';

export default function OwnerScreen() {
  const { role } = useAuth();
  const { stats, loading, error, reload } = useOwnerStats();
  const warning = useThemeColor({}, 'warning');
  // The keyboard covers the tab bar as well as the fields, so the avoiding
  // view has to be told how much of the bottom is already spoken for.
  const tabBarHeight = useBottomTabBarHeight();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [taxId, setTaxId] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [cityError, setCityError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    if (isBlank(name)) {
      setNameError('Please name the restaurant.');
      return;
    }

    // Two branches of a chain differ only by town, and the town is half of
    // what makes a restaurant unique — so it is not optional.
    if (isBlank(city)) {
      setCityError('Please say which town this one is in.');
      return;
    }

    setFormError(null);
    setPending(true);
    try {
      await createRestaurant(name, city, taxId);
      setName('');
      setCity('');
      setTaxId('');
      await reload();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not add the restaurant.');
    } finally {
      setPending(false);
    }
  }, [name, city, taxId, reload]);

  const runOn = useCallback(
    async (restaurantId: string, action: () => Promise<void>) => {
      setBusyId(restaurantId);
      try {
        await action();
        await reload();
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  // Hiding the tab is a convenience; this is the screen refusing to render for
  // anyone but the owner. The real boundary is `is_owner()` in Postgres.
  if (role !== 'owner') {
    return <Redirect href="/(admin)/dashboard" />;
  }

  const totals = stats.reduce(
    (sum, stat) => ({
      tables: sum.tables + stat.tables_total,
      bills: sum.bills + stat.bills_completed,
      people: sum.people + stat.participants_total,
      scans: sum.scans + stat.scans_this_month,
      scanMicros: sum.scanMicros + stat.scan_cost_micros_this_month,
    }),
    { tables: 0, bills: 0, people: 0, scans: 0, scanMicros: 0 }
  );

  // What the month has cost so far, against what it earns. Subscriptions are
  // the same price for everyone, so the sum is all this needs to be.
  const spentEur = totals.scanMicros / 1e6 / 1.08;
  const earnedEur = stats.filter((s) => s.is_active).length * 30;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={tabBarHeight}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
            <ScreenHeader title="Owner" subtitle="Where Split is actually being used." />

            <Card style={styles.totals}>
              <View style={styles.total}>
                <ThemedText style={styles.totalNumber}>{stats.length}</ThemedText>
                <ThemedText type="secondary" style={styles.totalLabel}>
                  Restaurants
                </ThemedText>
              </View>
              <View style={styles.total}>
                <ThemedText style={styles.totalNumber}>{totals.tables}</ThemedText>
                <ThemedText type="secondary" style={styles.totalLabel}>
                  Tables
                </ThemedText>
              </View>
              <View style={styles.total}>
                <ThemedText style={styles.totalNumber}>{totals.bills}</ThemedText>
                <ThemedText type="secondary" style={styles.totalLabel}>
                  Bills closed
                </ThemedText>
              </View>
              <View style={styles.total}>
                <ThemedText style={styles.totalNumber}>{totals.people}</ThemedText>
                <ThemedText type="secondary" style={styles.totalLabel}>
                  People
                </ThemedText>
              </View>
            </Card>

            <Card style={styles.spend}>
              <View style={styles.spendRow}>
                <ThemedText type="secondary" style={styles.spendLabel}>
                  Scanări luna aceasta
                </ThemedText>
                <ThemedText style={styles.spendValue}>
                  {totals.scans} ·{' '}
                  {spentEur > 0 && spentEur < 0.01
                    ? '<0,01 €'
                    : `${spentEur.toFixed(2).replace('.', ',')} €`}
                </ThemedText>
              </View>
              <ThemedText type="secondary" style={styles.spendHint}>
                {earnedEur === 0
                  ? 'Niciun restaurant activ încă.'
                  : `Din ${earnedEur} € abonamente active — ${Math.round(
                      (spentEur / earnedEur) * 100
                    )}% se duce pe citirea bonurilor.`}
              </ThemedText>
            </Card>

            {error && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
            )}

            <View style={styles.section}>
              <ThemedText type="label" style={styles.sectionLabel}>
                Per restaurant
              </ThemedText>

              {!loading && stats.length === 0 && (
                <Card>
                  <ThemedText type="secondary">
                    No restaurants yet. Add the first one below.
                  </ThemedText>
                </Card>
              )}

              {stats.map((stat) => (
                <RestaurantRow
                  key={stat.restaurant_id}
                  stat={stat}
                  mergeTargets={stats.filter((row) => row.restaurant_id !== stat.restaurant_id)}
                  busy={busyId === stat.restaurant_id}
                  onSave={(nextName, nextCity, nextTaxId, nextRadius) =>
                    runOn(stat.restaurant_id, () =>
                      updateRestaurant(
                        stat.restaurant_id,
                        nextName,
                        nextCity,
                        nextTaxId,
                        nextRadius
                      )
                    )
                  }
                  onToggleActive={() =>
                    runOn(stat.restaurant_id, () =>
                      setRestaurantActive(stat.restaurant_id, !stat.is_active)
                    )
                  }
                  onMerge={(targetId) =>
                    runOn(stat.restaurant_id, () => mergeRestaurants(stat.restaurant_id, targetId))
                  }
                  onDelete={() =>
                    runOn(stat.restaurant_id, () => deleteRestaurant(stat.restaurant_id))
                  }
                  // Pressed while standing in the restaurant: the reading is
                  // this phone's, which is the only one worth recording.
                  onCaptureLocation={() =>
                    runOn(stat.restaurant_id, async () =>
                      setRestaurantLocation(stat.restaurant_id, await getCurrentPosition())
                    )
                  }
                />
              ))}
            </View>

            <View style={styles.section}>
              <ThemedText type="label" style={styles.sectionLabel}>
                Add a restaurant
              </ThemedText>

              <Card style={styles.form}>
                <FormField
                  label="Name"
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setNameError(undefined);
                  }}
                  placeholder="Trattoria Roma"
                  autoCapitalize="words"
                  error={nameError}
                />

                <FormField
                  label="City"
                  value={city}
                  onChangeText={(text) => {
                    setCity(text);
                    setCityError(undefined);
                  }}
                  placeholder="Cluj-Napoca"
                  autoCapitalize="words"
                  error={cityError}
                />

                {/* Not required, because a place is often added before its
                    paperwork is to hand. Without it, scans here cannot be
                    checked against the receipt — the card says so. */}
                <FormField
                  label="Fiscal code (CUI)"
                  value={taxId}
                  onChangeText={setTaxId}
                  placeholder="RO12345678"
                  autoCapitalize="characters"
                />

                {formError && (
                  <ThemedText type="secondary" style={{ color: warning }}>
                    {formError}
                  </ThemedText>
                )}

                <Button
                  label={pending ? 'Adding…' : 'Add Restaurant'}
                  onPress={handleAdd}
                  disabled={pending}
                />
              </Card>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
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
  totals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  total: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  totalNumber: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
  },
  totalLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  spend: {
    gap: Spacing.xs,
  },
  spendRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  spendLabel: {
    fontSize: 14,
  },
  spendValue: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '600',
  },
  spendHint: {
    fontSize: 13,
  },
  section: {
    gap: Spacing.md,
  },
  sectionLabel: {
    opacity: 0.6,
  },
  form: {
    gap: Spacing.lg,
  },
});
