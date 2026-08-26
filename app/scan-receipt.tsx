import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Radius, Spacing } from '@/constants/theme';

/** Admin view: capture the receipt with the camera or pick one from the library. */
export default function ScanReceiptScreen() {
  const { tableId } = useLocalSearchParams<{ tableId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  function openReview(uri: string) {
    router.push({ pathname: '/review-receipt', params: { uri, tableId } });
  }

  async function handleTakePhoto() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
    if (photo?.uri) {
      openReview(photo.uri);
    }
  }

  async function handleChooseFromPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      openReview(result.assets[0].uri);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {/* The fiscal code is what the scan is checked against, and it is
            printed in the header — a photo cropped to the item lines is read,
            paid for, and then refused for want of it. Saying so here costs
            nothing; finding out afterwards costs a scan. */}
        <ScreenHeader
          title="Scan Receipt"
          subtitle="Photograph the whole bill, including the restaurant's CUI/CIF."
        />

        <View style={styles.preview}>
          {permission?.granted ? (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
              <View style={styles.frame} pointerEvents="none" />
            </>
          ) : (
            <View style={styles.permission}>
              <EmptyState
                message="Camera access needed"
                hint="Allow the camera to scan a receipt, or pick one from your photos."
              />
              {permission && !permission.granted && (
                <Button label="Allow Camera" variant="secondary" onPress={requestPermission} />
              )}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Button label="Take Photo" onPress={handleTakePhoto} disabled={!permission?.granted} />
          <Button
            label="Choose from Photos"
            variant="secondary"
            onPress={handleChooseFromPhotos}
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
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  preview: {
    flex: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  frame: {
    position: 'absolute',
    top: Spacing.xl,
    bottom: Spacing.xl,
    left: Spacing.lg,
    right: Spacing.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: Radius.md,
  },
  permission: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  actions: {
    gap: Spacing.sm,
  },
});
