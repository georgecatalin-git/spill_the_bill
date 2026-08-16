import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/providers/auth-provider';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const border = useThemeColor({}, 'border');
  const textSecondary = useThemeColor({}, 'textSecondary');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <ScreenHeader title="Profile" />

          <Card style={styles.card}>
            <View style={styles.identity}>
              <Avatar name={user?.name ?? ''} size={56} />
              <ThemedText style={styles.name}>{user?.name}</ThemedText>
            </View>

            <View style={[styles.row, { borderTopColor: border }]}>
              <ThemedText type="secondary">Name</ThemedText>
              <ThemedText>{user?.name}</ThemedText>
            </View>

            <View style={[styles.row, { borderTopColor: border }]}>
              <ThemedText type="secondary">Email</ThemedText>
              <ThemedText>{user?.email}</ThemedText>
            </View>
          </Card>

          <View style={styles.section}>
            <ThemedText type="label" style={styles.sectionLabel}>
              Tutorial
            </ThemedText>

            <Card>
              <Pressable
                onPress={() => router.push('/onboarding')}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <View style={styles.actionCopy}>
                  <ThemedText>Replay Tutorial</ThemedText>
                  <ThemedText type="secondary" style={styles.actionHint}>
                    Walk through how Split works again.
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={textSecondary} />
              </Pressable>
            </Card>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Log Out" variant="secondary" onPress={signOut} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.xl,
  },
  card: {
    gap: Spacing.md,
  },
  identity: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  name: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  section: {
    gap: Spacing.md,
  },
  sectionLabel: {
    opacity: 0.6,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  actionCopy: {
    flex: 1,
    gap: 2,
  },
  actionHint: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.6,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
});
