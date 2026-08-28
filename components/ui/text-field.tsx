import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Radius, Spacing, Type } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/**
 * A field that shows where the keyboard is going.
 *
 * The border thickens and takes the accent colour on focus, over 130ms. On a
 * form with four fields, that is the only thing telling somebody which one they
 * are typing into — a caret is three pixels wide and often under a thumb.
 */
export function TextField({ style, onFocus, onBlur, ...rest }: TextInputProps) {
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const accent = useThemeColor({}, 'accent');
  const surface = useThemeColor({}, 'surfaceSunken');
  const stillness = useReducedMotion();

  const [focused, setFocused] = useState(false);

  const animated = useAnimatedStyle(() => {
    const duration = stillness ? 0 : Motion.instant;
    return {
      borderColor: withTiming(focused ? accent : border, { duration }),
      borderWidth: withTiming(focused ? 1.6 : 1, { duration }),
    };
  });

  return (
    <AnimatedInput
      style={[styles.input, { color: text, backgroundColor: surface }, animated, style]}
      placeholderTextColor={textSecondary}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Type.body,
    // A field is as tall as a button, so a form does not look like a ladder.
    minHeight: 52,
  },
});
