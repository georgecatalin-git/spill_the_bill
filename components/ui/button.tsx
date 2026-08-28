import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Motion, Radius, Spacing, Type } from '@/constants/theme';
import { useElevation } from '@/hooks/use-elevation';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HapticKind } from '@/lib/haptics';

/**
 * The button.
 *
 * Two layers, and the depth comes from the gap between them: an outer view
 * holds the shadow and stays put, the coloured face sits on top of it and sinks
 * on press. Pressing moves the face towards its own shadow, which is what a
 * physical button does and what a flat opacity fade never quite convinces
 * anybody of.
 *
 * The API is unchanged from the flat version it replaces — `label`, `onPress`,
 * `variant`, `disabled` — because it is used on every screen and a redesign
 * that renames things is a redesign nobody finishes.
 */

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  /** Shows a spinner in place of the label and stops accepting presses. */
  loading?: boolean;
  /** Medium by default on a primary button: it is usually committing something. */
  feedback?: HapticKind;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  feedback,
}: ButtonProps) {
  const accent = useThemeColor({}, 'accent');
  const accentText = useThemeColor({}, 'accentText');
  const text = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const depth = useElevation(2);

  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  const blocked = disabled || loading;

  const face = isPrimary
    ? { backgroundColor: accent }
    : isGhost
      ? { backgroundColor: 'transparent' }
      : { backgroundColor: surface, borderWidth: 1.5, borderColor: border };

  return (
    // Only a raised button casts one. A secondary button that floats reads as
    // two primary buttons, and the hierarchy is the point.
    //
    // The wrapper needs the same radius as the face: a shadow takes the shape
    // of the view that casts it, and without this a pill sits inside a
    // rectangular smudge.
    <View style={[styles.shadow, isPrimary && !blocked ? depth : null]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(blocked), busy: Boolean(loading) }}
        accessibilityLabel={label}
        disabled={blocked}
        onPress={onPress}
        feedback={feedback ?? (isPrimary ? 'confirm' : 'select')}
        lift={isPrimary ? Motion.pressLift : 0}
        style={[styles.face, face]}>
        {loading ? (
          <ActivityIndicator size="small" color={isPrimary ? accentText : text} />
        ) : (
          <Text
            numberOfLines={1}
            style={[styles.label, { color: isPrimary ? accentText : text }]}>
            {label}
          </Text>
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: Radius.pill,
  },
  face: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    // A touch target that does not shrink below the size of a thumb, whatever
    // the label turns out to be.
    minHeight: 52,
  },
  label: {
    ...Type.heading,
  },
});
