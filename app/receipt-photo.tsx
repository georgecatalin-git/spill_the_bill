import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getReceiptPhotoUrl } from '@/lib/services/receipt-photo-service';
import { useGuest } from '@/providers/guest-provider';

/**
 * The receipt, as it was photographed.
 *
 * Everyone at the table can open this — the whole point is that "I never
 * ordered the wine" has somewhere to be checked. The link behind the image is
 * signed and expires, so it is fetched fresh each time this screen opens
 * rather than stored anywhere.
 */
export default function ReceiptPhotoScreen() {
  const { billId } = useLocalSearchParams<{ billId?: string }>();
  const { session } = useGuest();
  const border = useThemeColor({}, 'border');
  const warning = useThemeColor({}, 'warning');

  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const signed = await getReceiptPhotoUrl(
        session ? { sessionToken: session.sessionToken } : { billId: billId ?? '' }
      );
      setUrl(signed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the receipt photo.');
    } finally {
      setLoading(false);
    }
  }, [session, billId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="The Receipt"
            subtitle="The photo this bill was read from."
          />

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator />
              <ThemedText type="secondary">Opening the photo…</ThemedText>
            </View>
          ) : error ? (
            <View style={styles.errorBlock}>
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
              <Button label="Try again" variant="secondary" onPress={load} />
            </View>
          ) : !url ? (
            <EmptyState
              message="No photo was kept"
              hint="This bill was typed in by hand, or scanned before photos were saved."
            />
          ) : (
            <>
              <View style={[styles.frame, { borderColor: border }]}>
                <Image
                  source={{ uri: url }}
                  style={styles.photo}
                  contentFit="contain"
                  transition={150}
                />
              </View>
              <Button label="Reload" variant="secondary" onPress={load} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  errorBlock: { gap: Spacing.md },
  frame: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    // Receipts are tall and narrow; this keeps the whole thing on screen
    // without the reader having to pinch it into view.
    aspectRatio: 3 / 4,
  },
  photo: { width: '100%', height: '100%' },
});
