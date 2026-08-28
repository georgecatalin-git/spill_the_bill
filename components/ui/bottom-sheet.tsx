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
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Motion, Radius, Spacing } from '@/constants/theme';
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
 *
 * The backdrop fades and the panel springs up separately, which is why the
 * Modal's own animation is set to `fade` and the movement is done here: with
 * `slide`, the dimming slides up with the panel and the page appears to be
 * pushed rather than covered. Leaving is still the Modal's own fade — an exit
 * animation would mean keeping it mounted after `visible` goes false, and a
 * sheet that lingers is a worse bug than a sheet that leaves plainly.
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
  const overlay = useThemeColor({}, 'overlay');
  const borderStrong = useThemeColor({}, 'borderStrong');

  const body = (
    <Animated.View
      entering={SlideInDown.duration(Motion.base)
        .springify()
        .damping(Motion.springSoft.damping)
        .stiffness(Motion.springSoft.stiffness)}
      style={[
        styles.panel,
        { backgroundColor: background, borderColor: border, paddingBottom: insets.bottom },
      ]}>
      {/* Says the panel is a thing you could pull, even where dragging it is
          not wired up — it is what makes a sheet read as a sheet. */}
      <View style={styles.grabber}>
        <View style={[styles.grabberBar, { backgroundColor: borderStrong }]} />
      </View>

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
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismiss}>
      <View style={[styles.overlay, { backgroundColor: overlay }]}>
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
  },
  anchor: {
    // Percentage resolves against the full-height overlay above it.
    maxHeight: '88%',
  },
  panel: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
  },
  grabber: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  grabberBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  content: {
    padding: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
});
