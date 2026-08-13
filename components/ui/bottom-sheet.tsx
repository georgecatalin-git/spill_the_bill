import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Set false for short sheets that do not need to scroll. */
  scrollable?: boolean;
  /**
   * Fires once the sheet is fully off screen (iOS only).
   *
   * Anything that asks iOS to present its own screen — the share sheet, the
   * photo picker — has to wait for this, or the request is refused.
   */
  onDismiss?: () => void;
};

/**
 * The sheet every modal in the app uses.
 *
 * Two details matter for it not to look see-through:
 *
 *  - the dimmed backdrop covers the whole screen, behind the panel, rather
 *    than being a sibling that only fills the space above it;
 *  - the panel is anchored to the bottom edge and paints an opaque background
 *    all the way down past the home indicator, so nothing of the page shows
 *    underneath it.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  scrollable = true,
  onDismiss,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');

  const body = (
    <View
      style={[
        styles.panel,
        { backgroundColor: background, borderColor: border, paddingBottom: insets.bottom },
      ]}>
      {scrollable ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}>
      <View style={styles.overlay}>
        {/* Covers the entire screen, so the page behind is properly dimmed. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.anchor}>
          {body}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  anchor: {
    // Percentage resolves against the full-height overlay above it.
    maxHeight: '88%',
  },
  panel: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
});
