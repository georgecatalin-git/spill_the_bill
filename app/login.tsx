import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isBlank, isValidEmail } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';

type Errors = Partial<Record<'email' | 'password', string>>;

export default function LoginScreen() {
  const { signIn, resetPassword, pending, error, clearError } = useAuth();
  const warning = useThemeColor({}, 'warning');
  const success = useThemeColor({}, 'success');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [resetSent, setResetSent] = useState(false);

  function validate() {
    const next: Errors = {};

    if (!isValidEmail(email)) next.email = 'Please enter a valid email address.';
    if (isBlank(password)) next.password = 'Please enter your password.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    clearError();
    if (!validate()) return;

    if (await signIn(email, password)) {
      router.replace('/dashboard');
    }
  }

  async function handleForgotPassword() {
    clearError();
    setResetSent(false);

    if (!isValidEmail(email)) {
      setErrors({ email: 'Enter your email above, then tap this again.' });
      return;
    }

    if (await resetPassword(email)) {
      setResetSent(true);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <ScreenHeader title="Log In" subtitle="Welcome back." />

            <View style={styles.form}>
              <FormField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                error={errors.email}
              />
              <FormField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                secureTextEntry
                onSubmitEditing={handleSubmit}
                error={errors.password}
              />
            </View>

            {error && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
            )}

            {resetSent && (
              <ThemedText type="secondary" style={{ color: success }}>
                Check your inbox for a password reset link.
              </ThemedText>
            )}

            <Pressable onPress={handleForgotPassword} hitSlop={8} style={styles.forgot}>
              <ThemedText type="secondary" style={styles.forgotLabel}>
                Forgot Password?
              </ThemedText>
            </Pressable>
          </ScrollView>

          <View style={styles.footer}>
            <Button
              label={pending ? 'Logging in…' : 'Log In'}
              onPress={handleSubmit}
              disabled={pending}
            />
            <Button
              label="Create Account"
              variant="secondary"
              onPress={() => router.replace('/register')}
            />
          </View>
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
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.xl,
  },
  form: {
    gap: Spacing.lg,
  },
  forgot: {
    alignSelf: 'flex-start',
  },
  forgotLabel: {
    textDecorationLine: 'underline',
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
});
