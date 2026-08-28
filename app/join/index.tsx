import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Appear } from '@/components/ui/appear';
import { ScreenHeader } from '@/components/ui/screen-header';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { keyboardBehavior } from '@/lib/keyboard';

/**
 * Generous: codes are six characters today, but the generator takes a length
 * and this field should not be the thing that breaks if that ever changes.
 */
const MAX_CODE_LENGTH = 12;

/**
 * The way in for someone who already has the app.
 *
 * Invitation links carry the app's own scheme, which messaging apps will not
 * make tappable — so without this screen a guest holding a perfectly good code
 * has no door at all. The code was built to be read out loud (its alphabet has
 * no O/0 or I/1 to mishear), and this is where it gets typed.
 *
 * Nothing is validated here beyond "they typed something". Whether the code is
 * real is the server's answer to give, and `join_table` gives it.
 */
export default function JoinByCodeScreen() {
  const [code, setCode] = useState('');

  const canContinue = code.length > 0;

  /** Codes are upper case and unspaced; accept whatever the keyboard produced. */
  function handleChange(value: string) {
    setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  }

  function handleContinue() {
    if (!canContinue) return;
    router.push({ pathname: '/join/[code]', params: { code } });
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={keyboardBehavior}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.form}>
            <ScreenHeader
              title="Join a table"
              subtitle="Enter the code from your invitation."
            />

            <Appear index={1} style={styles.field}>
              <ThemedText type="label" style={styles.fieldLabel}>
                Table code
              </ThemedText>
              <TextField
                value={code}
                onChangeText={handleChange}
                placeholder="e.g. GQSV9P"
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={MAX_CODE_LENGTH}
                returnKeyType="go"
                onSubmitEditing={handleContinue}
                style={styles.codeInput}
              />
              <ThemedText type="secondary" style={styles.hint}>
                Whoever created the table can read it out — it is shown on their
                invitation screen.
              </ThemedText>
            </Appear>
          </View>

          <Button label="Continue" disabled={!canContinue} onPress={handleContinue} />
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
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
  form: {
    flex: 1,
    gap: Spacing.xl,
  },
  field: {
    gap: Spacing.sm,
  },
  fieldLabel: {
    opacity: 0.6,
  },
  // Matches the way the code is displayed on the invitation, so the thing being
  // copied and the thing being typed look like the same thing.
  codeInput: {
    fontSize: 24,
    letterSpacing: 4,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
  },
});
