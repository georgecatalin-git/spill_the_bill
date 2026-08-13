import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { createTable, ensureAdminParticipant } from '@/lib/services/table-service';
import { isBlank } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';

export default function NewTableScreen() {
  const { user } = useAuth();
  const warning = useThemeColor({}, 'warning');

  const [name, setName] = useState('');
  const [restaurant, setRestaurant] = useState('');
  const [error, setError] = useState<string>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    if (isBlank(name)) {
      setError('Please name your table.');
      return;
    }

    const hostName = user?.name ?? 'The host';
    setSubmitError(null);
    setPending(true);
    try {
      const table = await createTable(name, restaurant);
      await ensureAdminParticipant(table.id, hostName);

      router.replace({
        pathname: '/table',
        params: {
          id: table.id,
          code: table.invite_code,
          name: table.name,
          restaurant: table.restaurant_name ?? '',
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
          <View style={styles.form}>
            <ScreenHeader title="New Table" subtitle="Give your table a name." />

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

            <FormField
              label="Restaurant name"
              value={restaurant}
              onChangeText={setRestaurant}
              placeholder="Trattoria Roma"
              autoCapitalize="words"
            />

            {submitError && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {submitError}
              </ThemedText>
            )}
          </View>

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
    flex: 1,
    gap: Spacing.lg,
  },
});
