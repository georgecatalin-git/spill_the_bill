import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useElevation } from '@/hooks/use-elevation';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * A surface that groups something.
 *
 * `depth` is the whole vocabulary: 0 for a card that is simply a container, 1
 * for one holding something worth reading, 2 for something the screen is
 * actually about. Anything pressable gets the same press as every button, and
 * anything not pressable stays perfectly still — a card that responds to a
 * touch that does nothing is a promise the app then breaks.
 */

type CardProps = ViewProps & {
  depth?: 0 | 1 | 2 | 3;
  /** Present makes the card interactive, and it starts behaving like a button. */
  onPress?: () => void;
  selected?: boolean;
  children?: ReactNode;
};

export function Card({ style, depth = 1, onPress, selected, children, ...rest }: CardProps) {
  const surface = useThemeColor({}, 'surface');
  const surfaceRaised = useThemeColor({}, 'surfaceRaised');
  const border = useThemeColor({}, 'border');
  const accent = useThemeColor({}, 'accent');
  const shadow = useElevation(depth === 0 ? 1 : (Math.min(depth, 3) as 1 | 2 | 3));

  const skin: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: depth >= 1 ? surfaceRaised : surface,
      borderColor: selected ? accent : border,
      borderWidth: selected ? 1.5 : 1,
    },
    depth >= 1 ? shadow : null,
    style,
  ];

  if (!onPress) {
    return (
      <View style={skin} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <PressableScale onPress={onPress} lift={1} scaleTo={0.985} style={skin} {...rest}>
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
});
