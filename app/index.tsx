import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';
import { useGuest } from '@/providers/guest-provider';

export default function WelcomeScreen() {
  const { user, restoring } = useAuth();
  const {
    session: guestSession,
    restoring: guestRestoring,
    expired,
    dismissExpired,
  } = useGuest();

  // Hold the splash a beat rather than flashing Welcome at someone already in.
  if (restoring || guestRestoring) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.loading}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (user) {
    return <Redirect href="/dashboard" />;
  }

  // A guest who is still at a live table goes straight back to it.
  if (guestSession) {
    return <Redirect href="/joined" />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="title" style={styles.title}>
            Split
          </ThemedText>
          <ThemedText type="secondary" style={styles.subtitle}>
            Split the bill, simply.
          </ThemedText>
        </View>

        {expired && (
          <Card style={styles.notice}>
            <ThemedText style={styles.noticeTitle}>Your table session has ended.</ThemedText>
            <ThemedText type="secondary">
              Use the invitation link again to rejoin.
            </ThemedText>
            <Button label="Return Home" variant="secondary" onPress={dismissExpired} />
          </Card>
        )}

        <View style={styles.actions}>
          <Button label="Get Started" onPress={() => router.push('/register')} />
          <Button label="Log In" variant="secondary" onPress={() => router.push('/login')} />
          {/* Both buttons above are admin doors. A guest holding a code had
              none: invitation links carry the app's own scheme, which
              messaging apps will not make tappable. */}
          <Button
            label="Join a Table"
            variant="secondary"
            onPress={() => router.push('/join')}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    justifyContent: 'flex-end',
    gap: Spacing.lg,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: 44,
    lineHeight: 57,
  },
  subtitle: {
    textAlign: 'center',
  },
  notice: {
    gap: Spacing.sm,
  },
  noticeTitle: {
    fontWeight: '600',
  },
  actions: {
    gap: Spacing.sm,
  },
});
