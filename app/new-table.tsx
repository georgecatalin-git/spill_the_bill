import { router, useLocalSearchParams } from 'expo-router';
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
import {
  createTable,
  createTableAtVenue,
  ensureAdminParticipant,
} from '@/lib/services/table-service';
import { useMyRestaurant } from '@/lib/services/use-my-restaurant';
import { useRestaurantSearch } from '@/lib/services/use-restaurant-search';
import { useVenueCode } from '@/lib/services/use-venue-code';
import { isBlank } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';

export default function NewTableScreen() {
  // Arrives from the code printed in the restaurant: the sticker's link lands
  // here with the venue already filled in, so a customer types a table name
  // and nothing else. Typing the code by hand reaches the same field.
  const { venue: scannedCode } = useLocalSearchParams<{ venue?: string }>();

  const { user, role } = useAuth();
  const warning = useThemeColor({}, 'warning');
  const border = useThemeColor({}, 'border');

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [venueCode, setVenueCode] = useState((scannedCode ?? '').toUpperCase());
  const [codeMode, setCodeMode] = useState(Boolean(scannedCode));
  const [chosen, setChosen] = useState<RestaurantMatch | null>(null);
  const [error, setError] = useState<string>();
  const [restaurantError, setRestaurantError] = useState<string>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { matches, searching, error: searchError, tooShort } = useRestaurantSearch(query);
  const { restaurant: mine, loading: loadingMine, error: mineError } = useMyRestaurant();
  const { venue, checking, error: venueError, tooShort: codeTooShort } = useVenueCode(venueCode);

  // The account's own restaurant is not a choice, so it is not offered as one.
  // Only the owner picks, because they demo wherever the meeting happens; the
  // database enforces the same split in
  // `prevent_table_at_another_restaurant`.
  const picks = role === 'owner';

  // A code that has actually been presented wins for everybody. It is proof of
  // sitting in the restaurant, and there is no reason an owner or a waiter
  // holding one should be refused it — the first version tied the code to
  // "account with no restaurant", which quietly threw away a scanned sticker
  // for the two kinds of account most likely to be testing one.
  //
  // Otherwise the account decides: the owner searches, staff already have
  // their restaurant, and anybody else has nothing but a code.
  const usesCode = codeMode || (!picks && !loadingMine && !mine);
  const restaurant = usesCode ? venue : picks ? chosen : mine;

  /** Only these two have somewhere else to go if they change their mind. */
  const canLeaveCodeMode = picks || Boolean(mine);

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

    if (!restaurant) {
      setRestaurantError(
        usesCode
          ? 'Enter the code printed on your table.'
          : 'Type the restaurant you are in and pick it from the list.'
      );
      return;
    }

    const hostName = user?.name ?? 'The host';
    setSubmitError(null);
    setPending(true);
    try {
      // A customer names no restaurant: the server reads it off the code, so
      // there is nothing the app could get wrong or the client could invent.
      const table = usesCode
        ? await createTableAtVenue(venueCode.trim(), name)
        : await createTable(name, restaurant.id);

      await ensureAdminParticipant(table.id, hostName);

      router.replace({
        pathname: '/table',
        params: {
          id: table.id,
          code: table.invite_code,
          name: table.name,
          restaurant: restaurant.name,
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

              {usesCode ? (
                <>
                  <FormField
                    label=""
                    value={venueCode}
                    onChangeText={(text) => {
                      setVenueCode(text.toUpperCase());
                      setRestaurantError(undefined);
                    }}
                    placeholder="Code printed on your table"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />

                  {venue ? (
                    <ThemedText style={styles.fixedRestaurant}>
                      {venue.name} · {venue.city}
                    </ThemedText>
                  ) : codeTooShort ? (
                    <ThemedText type="secondary" style={styles.hint}>
                      The code is on a sticker on your table.
                    </ThemedText>
                  ) : checking ? (
                    <ThemedText type="secondary" style={styles.hint}>
                      Checking…
                    </ThemedText>
                  ) : (
                    <ThemedText type="secondary" style={[styles.hint, { color: warning }]}>
                      That code does not open a table here.
                    </ThemedText>
                  )}

                  {canLeaveCodeMode && (
                    <Pressable
                      onPress={() => {
                        setCodeMode(false);
                        setVenueCode('');
                        setRestaurantError(undefined);
                      }}>
                      <ThemedText type="secondary" style={styles.switch}>
                        {picks ? 'Search for a restaurant instead' : 'Use my own restaurant instead'}
                      </ThemedText>
                    </Pressable>
                  )}
                </>
              ) : !picks ? (
                loadingMine ? (
                  <ThemedText type="secondary" style={styles.hint}>
                    Loading…
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText style={styles.fixedRestaurant}>
                      {mine?.name} · {mine?.city}
                    </ThemedText>
                    <Pressable onPress={() => setCodeMode(true)}>
                      <ThemedText type="secondary" style={styles.switch}>
                        I have a table code
                      </ThemedText>
                    </Pressable>
                  </>
                )
              ) : (
                <>
                  {/* The owner alone still chooses, and types rather than picks
                      from a list: the customer list is not readable in one
                      piece any more. */}
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
                      Nothing found. Check the spelling.
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

                  <Pressable onPress={() => setCodeMode(true)}>
                    <ThemedText type="secondary" style={styles.switch}>
                      I have a table code
                    </ThemedText>
                  </Pressable>
                </>
              )}

              {(restaurantError ?? mineError ?? searchError ?? venueError) && (
                <ThemedText type="secondary" style={[styles.hint, { color: warning }]}>
                  {restaurantError ?? mineError ?? searchError ?? venueError}
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
  switch: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  fixedRestaurant: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
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
