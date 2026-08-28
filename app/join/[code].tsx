import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useGuest } from '@/providers/guest-provider';
import { keyboardBehavior } from '@/lib/keyboard';

const MAX_NAME_LENGTH = 60;

/** Guest view: opened from an invitation link. No account required. */
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { join } = useGuest();
  const warning = useThemeColor({}, 'warning');
  const border = useThemeColor({}, 'border');

  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteCode = (code ?? '').trim().toUpperCase();
  const canJoin = name.trim().length > 0 && !pending;

  if (!inviteCode) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ScreenHeader title="Invalid invitation" />
          <EmptyState
            icon="🔗"
            message="This invitation link is no longer valid."
            hint="Ask for a new link from whoever created the table."
          />
          <Button label="Back" variant="secondary" onPress={() => router.replace('/')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  async function handleJoin() {
    if (!canJoin) return;

    setPending(true);
    setError(null);

    try {
      await join(inviteCode, name);
      router.replace('/joined');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to join the table.');
    } finally {
      setPending(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={keyboardBehavior}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.form}>
            <ScreenHeader
              title="Join the table"
              subtitle="You've been invited to join this table."
            />

            <Card style={styles.details}>
              <View style={styles.detailRow}>
                <ThemedText type="secondary">Table code</ThemedText>
                <ThemedText style={styles.detailValue}>{inviteCode}</ThemedText>
              </View>
              <View style={[styles.detailRow, styles.divider, { borderTopColor: border }]}>
                <ThemedText type="secondary">Account</ThemedText>
                <ThemedText style={styles.detailValue}>Not needed</ThemedText>
              </View>
            </Card>

            <View style={styles.field}>
              <ThemedText type="label" style={styles.fieldLabel}>
                Your name
              </ThemedText>
              <TextField
                value={name}
                onChangeText={setName}
                placeholder="e.g. Alex"
                autoFocus
                autoCapitalize="words"
                maxLength={MAX_NAME_LENGTH}
                returnKeyType="done"
                onSubmitEditing={handleJoin}
                editable={!pending}
              />
              <ThemedText type="secondary" style={styles.hint}>
                No account needed — your name is only visible at this table.
              </ThemedText>
            </View>

            {error && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
            )}
          </View>

          <Button
            label={pending ? 'Joining table…' : 'Join Table'}
            disabled={!canJoin}
            onPress={handleJoin}
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
    gap: Spacing.xl,
  },
  details: {
    gap: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  divider: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  detailValue: {
    fontWeight: '500',
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
