import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Appear } from '@/components/ui/appear';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Radius, Spacing } from '@/constants/theme';

/** Admin view: confirm the captured photo is readable before extracting items. */
export default function ReviewReceiptScreen() {
  const { uri, tableId } = useLocalSearchParams<{ uri: string; tableId?: string }>();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScreenHeader title="Review Receipt" subtitle="Make sure the whole receipt is readable." />

        <Appear index={1} style={styles.preview}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Appear>

        <View style={styles.actions}>
          <Button
            label="Use Receipt"
            onPress={() => router.push({ pathname: '/review-items', params: { uri, tableId } })}
          />
          <Button label="Retake" variant="secondary" onPress={() => router.back()} />
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
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  preview: {
    flex: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  actions: {
    gap: Spacing.sm,
  },
});
