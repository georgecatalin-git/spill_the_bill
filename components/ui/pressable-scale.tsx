import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { haptics, type HapticKind } from '@/lib/haptics';

/**
 * The press, once, for everything that can be pressed.
 *
 * Every button, card and chip in the app sinks the same distance, at the same
 * speed, and buzzes the same way — because they all come through here. The
 * alternative is thirty components each with their own idea of what a press
 * feels like, which is what makes an app feel assembled rather than designed.
 *
 * The animation runs on the UI thread: a spring on a shared value keeps
 * responding while JavaScript is busy loading the next screen, which is exactly
 * when a button most needs to feel alive.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far it shrinks. Bigger things move less. */
  scaleTo?: number;
  /** How far it sinks, in points. Zero for anything that is not raised. */
  lift?: number;
  /** What it feels like. `none` for anything pressed repeatedly. */
  feedback?: HapticKind;
};

export function PressableScale({
  children,
  style,
  scaleTo = Motion.pressScale,
  lift = 0,
  feedback = 'select',
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  // Somebody who has asked their phone to stop animating things has asked for
  // this too. They keep the haptic and the opacity — the feedback survives, the
  // movement does not.
  const stillness = useReducedMotion();

  const animated = useAnimatedStyle(() => ({
    transform: stillness
      ? []
      : [
          { scale: withSpring(1 - (1 - scaleTo) * pressed.value, Motion.springSnappy) },
          { translateY: withSpring(lift * pressed.value, Motion.springSnappy) },
        ],
    opacity: withTiming(disabled ? 0.4 : 1 - 0.12 * pressed.value, {
      duration: Motion.instant,
    }),
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      style={[style, animated]}
      onPressIn={(event) => {
        pressed.value = 1;
        if (feedback !== 'none') haptics[feedback]();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = 0;
        onPressOut?.(event);
      }}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}
