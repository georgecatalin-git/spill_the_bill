import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
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

type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword', string>>;

export default function RegisterScreen() {
  const { signUp, pending, error, clearError } = useAuth();
  const warning = useThemeColor({}, 'warning');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  function validate() {
    const next: Errors = {};

    if (isBlank(name)) next.name = 'Please enter your name.';
    if (!isValidEmail(email)) next.email = 'Please enter a valid email address.';
    if (isBlank(password)) next.password = 'Please choose a password.';
    if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    clearError();
    if (!validate()) return;

    if (await signUp(name, email, password)) {
      router.replace('/dashboard');
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
            <ScreenHeader title="Create Account" subtitle="Start splitting bills with friends." />

            <View style={styles.form}>
              <FormField
                label="Full Name"
                value={name}
                onChangeText={setName}
                placeholder="George Catalin"
                autoCapitalize="words"
                error={errors.name}
              />
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
                placeholder="At least 6 characters"
                secureTextEntry
                error={errors.password}
              />
              <FormField
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat your password"
                secureTextEntry
                error={errors.confirmPassword}
              />
            </View>

            {error && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button
              label={pending ? 'Creating account…' : 'Create Account'}
              onPress={handleSubmit}
              disabled={pending}
            />
            <Button
              label="I already have an account"
              variant="secondary"
              onPress={() => router.replace('/login')}
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
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
});
