import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { keyboardBehavior } from '@/lib/keyboard';
import { useThemeColor } from '@/hooks/use-theme-color';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * Set false only for a sheet with no text input in it.
   *
   * Anything with a field has to be able to scroll: once the keyboard is up
   * the panel has perhaps a third of the screen, and content that overflows a
   * box that cannot scroll is content nobody can reach.
   */
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
 * The entrance is the platform's own `slide`, and that is a correction rather
 * than a default. A hand-written spring on the panel looked slightly better and
 * broke the keyboard: the first field carries `autoFocus`, so the keyboard
 * comes up while the panel is still moving, and `KeyboardAvoidingView` measures
 * a panel that has not settled — leaving the field being typed into sitting
 * under the keyboard. On a sheet full of inputs the entrance is not decoration;
 * it decides where everything ends up.
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
    <View
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
          // The panel is short with a keyboard up, so the scroll has to be
          // reachable rather than merely present.
          keyboardDismissMode="interactive"
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
      <View style={[styles.overlay, { backgroundColor: overlay }]}>
        {/* Covers the entire screen, so the page behind is properly dimmed. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/*
          Android had no behaviour at all here, so a keyboard simply covered the
          sheet and whatever was being typed into it. The shared constant says
          why both platforms now need one.

          Reanimated's `useAnimatedKeyboard` would have been tidier and is not
          used on purpose: it is deprecated in Reanimated 4 over iOS bugs, and
          on Android it takes over inset management for the entire app.
        */}
        <KeyboardAvoidingView behavior={keyboardBehavior} style={styles.anchor}>
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
