import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Appear } from '@/components/ui/appear';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { updateMyRestaurantDetails } from '@/lib/services/restaurant-service';
import { useMyRestaurant } from '@/lib/services/use-my-restaurant';
import { isBlank } from '@/lib/validation';
import { keyboardBehavior } from '@/lib/keyboard';

/**
 * The restaurant's own screen: how much it is being used, the code its
 * customers scan, and the details it may correct itself.
 *
 * Everything here is found *by* the account — `my_restaurant()` looks the row
 * up from `auth.uid()` — so there is no restaurant id the app sends and none a
 * client could tamper with. An account that administers nothing never sees
 * this tab.
 */
export default function RestaurantScreen() {
  const { restaurant, loading, error, reload } = useMyRestaurant();
  const warning = useThemeColor({}, 'warning');
  const success = useThemeColor({}, 'success');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEditing = useCallback(() => {
    if (!restaurant) return;
    setName(restaurant.name);
    setCity(restaurant.city);
    setAddress(restaurant.address ?? '');
    setFormError(null);
    setEditing(true);
  }, [restaurant]);

  async function save() {
    if (isBlank(name) || isBlank(city)) {
      setFormError('The name and the town are both needed.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      await updateMyRestaurantDetails(name, city, address);
      await reload();
      setEditing(false);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not save the restaurant.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={keyboardBehavior}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
            <ScreenHeader
              title={restaurant?.name ?? 'Restaurant'}
              subtitle={restaurant ? [restaurant.city, restaurant.address].filter(Boolean).join(' · ') : undefined}
            />

            {error && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
            )}

            {restaurant && (
              <>
                {/* The figures are what a restaurant opens this screen for, so
                    they arrive first and sit above everything else. */}
                <Appear index={1}>
                <Card depth={2} style={styles.figures}>
                  <View style={styles.figure}>
                    <ThemedText style={styles.number}>{restaurant.splits_active}</ThemedText>
                    <ThemedText type="secondary" style={styles.label}>
                      Open now
                    </ThemedText>
                  </View>
                  <View style={styles.figure}>
                    <ThemedText style={styles.number}>{restaurant.splits_this_month}</ThemedText>
                    <ThemedText type="secondary" style={styles.label}>
                      This month
                    </ThemedText>
                  </View>
                  <View style={styles.figure}>
                    <ThemedText style={styles.number}>{restaurant.guests_this_month}</ThemedText>
                    <ThemedText type="secondary" style={styles.label}>
                      Guests
                    </ThemedText>
                  </View>
                  <View style={styles.figure}>
                    <ThemedText style={styles.number}>{restaurant.bills_completed}</ThemedText>
                    <ThemedText type="secondary" style={styles.label}>
                      Bills closed
                    </ThemedText>
                  </View>
                </Card>
                </Appear>

                {/* Only ACTIVE serves customers, and the code is dead until it
                    is — worth saying here rather than leaving somebody to
                    wonder why nothing scans. */}
                {restaurant.status !== 'ACTIVE' && (
                  <Card>
                    <ThemedText type="secondary" style={{ color: warning }}>
                      This restaurant is {restaurant.status.toLowerCase()}. Split is not
                      available to your customers until it is active.
                    </ThemedText>
                  </Card>
                )}

                <Appear index={2} style={styles.section}>
                  <ThemedText type="label" style={styles.sectionLabel}>
                    Your Split code
                  </ThemedText>

                  <Card style={styles.codeCard}>
                    <ThemedText style={styles.code}>{restaurant.venue_code}</ThemedText>
                    <ThemedText type="secondary" style={styles.hint}>
                      One code for the whole restaurant. Print it as many times as you
                      like — the door, every table, the menu. A guest enters it, names
                      their table, and starts a split.
                    </ThemedText>
                    <ThemedText type="secondary" style={[styles.hint, { color: textSecondary }]}>
                      It never changes on its own. Ask Split for a new one if it turns up
                      somewhere it should not.
                    </ThemedText>
                  </Card>
                </Appear>

                <Appear index={3} style={styles.section}>
                  <ThemedText type="label" style={styles.sectionLabel}>
                    Details
                  </ThemedText>

                  {editing ? (
                    <Card style={styles.form}>
                      <FormField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
                      <FormField label="Town" value={city} onChangeText={setCity} autoCapitalize="words" />
                      <FormField
                        label="Address"
                        value={address}
                        onChangeText={setAddress}
                        placeholder="Str. Republicii 5"
                        autoCapitalize="words"
                      />

                      {formError && (
                        <ThemedText type="secondary" style={{ color: warning }}>
                          {formError}
                        </ThemedText>
                      )}

                      <View style={styles.actions}>
                        <View style={styles.action}>
                          <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} />
                        </View>
                        <View style={styles.action}>
                          <Button label={saving ? 'Saving…' : 'Save'} onPress={() => void save()} disabled={saving} />
                        </View>
                      </View>
                    </Card>
                  ) : (
                    <Card style={styles.form}>
                      <View style={styles.row}>
                        <ThemedText type="secondary">Status</ThemedText>
                        <ThemedText style={{ color: restaurant.status === 'ACTIVE' ? success : warning }}>
                          {restaurant.status}
                        </ThemedText>
                      </View>

                      {/* Read-only on purpose: every scanned receipt is checked
                          against this, so a restaurant that could change it
                          could start accepting another company's bills. */}
                      <View style={styles.row}>
                        <ThemedText type="secondary">Fiscal code</ThemedText>
                        <ThemedText>{restaurant.tax_id ?? '—'}</ThemedText>
                      </View>

                      <ThemedText type="secondary" style={styles.hint}>
                        The fiscal code and the status are held by Split — the first is
                        what every scanned receipt is checked against. Ask us to change
                        either.
                      </ThemedText>

                      <Button label="Edit name and address" variant="secondary" onPress={startEditing} />
                    </Card>
                  )}
                </Appear>
              </>
            )}
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
  figures: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  figure: { flex: 1, alignItems: 'center', gap: 2 },
  number: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  label: { fontSize: 12, textAlign: 'center' },
  section: { gap: Spacing.md },
  sectionLabel: { opacity: 0.6 },
  codeCard: { gap: Spacing.sm, alignItems: 'center' },
  code: { fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: 4 },
  hint: { fontSize: 13, textAlign: 'center' },
  form: { gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: Spacing.md },
  action: { flex: 1 },
});
