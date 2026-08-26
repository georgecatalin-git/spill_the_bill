import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { FormField } from '@/components/ui/form-field';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { createTable, ensureAdminParticipant } from '@/lib/services/table-service';
import { useRestaurants } from '@/lib/services/use-restaurants';
import { isBlank } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';

export default function NewTableScreen() {
  const { user, role } = useAuth();
  const warning = useThemeColor({}, 'warning');
  const { restaurants, loading, error: restaurantsError } = useRestaurants();

  const [name, setName] = useState('');
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [restaurantError, setRestaurantError] = useState<string>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const restaurantOptions: DropdownOption[] = restaurants.map((restaurant) => ({
    value: restaurant.id,
    label: restaurant.name,
    hint: restaurant.city,
  }));

  async function handleCreate() {
    if (isBlank(name)) {
      setError('Please name your table.');
      return;
    }

    if (!restaurantId) {
      setRestaurantError('Please choose the restaurant.');
      return;
    }

    const hostName = user?.name ?? 'The host';
    const restaurantName = restaurants.find((row) => row.id === restaurantId)?.name ?? '';
    setSubmitError(null);
    setPending(true);
    try {
      const table = await createTable(name, restaurantId);
      await ensureAdminParticipant(table.id, hostName);

      router.replace({
        pathname: '/table',
        params: {
          id: table.id,
          code: table.invite_code,
          name: table.name,
          restaurant: restaurantName,
        },
      });
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Could not create the table.');
    } finally {
      setPending(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ScrollView
            contentContainerStyle={styles.form}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <ScreenHeader
              title="New Table"
              subtitle="Name your table and pick where you are."
            />

            <FormField
              label="Table name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(undefined);
              }}
              placeholder="Friday Dinner"
              autoCapitalize="words"
              autoFocus
              error={error}
            />

            <View style={styles.field}>
              <ThemedText type="label" style={styles.fieldLabel}>
                Restaurant
              </ThemedText>

              {loading ? (
                <ThemedText type="secondary" style={styles.hint}>
                  Loading restaurants…
                </ThemedText>
              ) : restaurants.length === 0 ? (
                <ThemedText type="secondary" style={styles.hint}>
                  {role === 'owner'
                    ? 'No restaurants yet. Add one from the Owner tab first.'
                    : 'No restaurants available yet. Ask the owner to add yours.'}
                </ThemedText>
              ) : (
                // The town is shown as the hint, because two branches of a
                // chain are told apart by nothing else.
                <Dropdown
                  value={restaurantId ?? ''}
                  options={restaurantOptions}
                  onChange={(id) => {
                    setRestaurantId(id);
                    setRestaurantError(undefined);
                  }}
                  placeholder="Where are you?"
                />
              )}

              {(restaurantError ?? restaurantsError) && (
                <ThemedText type="secondary" style={[styles.hint, { color: warning }]}>
                  {restaurantError ?? restaurantsError}
                </ThemedText>
              )}
            </View>

            {submitError && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {submitError}
              </ThemedText>
            )}
          </ScrollView>

          <Button
            label={pending ? 'Creating table…' : 'Create Table'}
            onPress={handleCreate}
            disabled={pending}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
  form: {
    gap: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  field: {
    gap: Spacing.sm,
  },
  fieldLabel: {
    opacity: 0.6,
  },
  hint: {
    fontSize: 13,
  },
});
