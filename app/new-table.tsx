import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { RestaurantMatch } from '@/lib/database';
import { createTable, ensureAdminParticipant } from '@/lib/services/table-service';
import { useRestaurantSearch } from '@/lib/services/use-restaurant-search';
import { isBlank } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';

export default function NewTableScreen() {
  const { user } = useAuth();
  const warning = useThemeColor({}, 'warning');
  const border = useThemeColor({}, 'border');

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<RestaurantMatch | null>(null);
  const [error, setError] = useState<string>();
  const [restaurantError, setRestaurantError] = useState<string>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { matches, searching, error: searchError, tooShort } = useRestaurantSearch(query);

  function pick(match: RestaurantMatch) {
    setChosen(match);
    // The box shows what was picked, so the list has nothing left to offer.
    setQuery(match.name);
    setRestaurantError(undefined);
  }

  async function handleCreate() {
    if (isBlank(name)) {
      setError('Please name your table.');
      return;
    }

    if (!chosen) {
      setRestaurantError('Type the restaurant you are in and pick it from the list.');
      return;
    }

    const hostName = user?.name ?? 'The host';
    setSubmitError(null);
    setPending(true);
    try {
      const table = await createTable(name, chosen.id);
      await ensureAdminParticipant(table.id, hostName);

      router.replace({
        pathname: '/table',
        params: {
          id: table.id,
          code: table.invite_code,
          name: table.name,
          restaurant: chosen.name,
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

              {/* Typed rather than chosen from a list. Spelling is free — case,
                  diacritics and "SRL" are all folded server-side — but the name
                  has to be right, and a place the owner has not entered is
                  simply not found. */}
              <FormField
                label=""
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  setChosen(null);
                  setRestaurantError(undefined);
                }}
                placeholder="Type where you are"
                autoCapitalize="words"
                autoCorrect={false}
              />

              {chosen ? (
                <ThemedText type="secondary" style={styles.hint}>
                  {chosen.name} · {chosen.city}
                </ThemedText>
              ) : tooShort ? (
                <ThemedText type="secondary" style={styles.hint}>
                  Type at least three letters of the restaurant&apos;s name.
                </ThemedText>
              ) : searching ? (
                <ThemedText type="secondary" style={styles.hint}>
                  Searching…
                </ThemedText>
              ) : matches.length === 0 ? (
                <ThemedText type="secondary" style={styles.hint}>
                  Nothing found. Check the spelling — and if this place is not on
                  Split yet, the owner has to add it first.
                </ThemedText>
              ) : (
                <View style={[styles.matches, { borderColor: border }]}>
                  {matches.map((match) => (
                    <Pressable
                      key={match.id}
                      onPress={() => pick(match)}
                      style={[styles.match, { borderColor: border }]}>
                      <ThemedText style={styles.matchName}>{match.name}</ThemedText>
                      <ThemedText type="secondary" style={styles.hint}>
                        {match.city}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}

              {(restaurantError ?? searchError) && (
                <ThemedText type="secondary" style={[styles.hint, { color: warning }]}>
                  {restaurantError ?? searchError}
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
  matches: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  match: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  matchName: {
    fontSize: 15,
    lineHeight: 20,
  },
  fieldLabel: {
    opacity: 0.6,
  },
  hint: {
    fontSize: 13,
  },
});
