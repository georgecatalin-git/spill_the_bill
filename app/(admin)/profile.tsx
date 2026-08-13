import { StyleSheet, View } from 'react-native';
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
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

        <View style={styles.footer}>
          <Button label="Log Out" variant="secondary" onPress={signOut} />
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
    paddingTop: Spacing.lg,
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
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Spacing.sm,
  },
});
