import { useEffect, useState } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Type } from '@/constants/theme';
import { formatCents } from '@/lib/money';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * An amount that counts to its new value instead of blinking to it.
 *
 * Money on this screen changes because somebody else did something — a guest
 * claimed a beer, a payment was recorded — and a figure that simply becomes a
 * different figure gives no clue that anything happened. Counting shows it
 * moved and which way.
 *
 * **The number displayed is never invented.** The animation runs between the
 * old value and the new one, both of which came from Postgres, and it always
 * ends on exactly the value it was given. Nothing here rounds, sums or decides
 * anything.
 */

type AnimatedMoneyProps = {
  cents: number;
  currency?: string;
  size?: 'money' | 'moneyLarge' | 'body' | 'secondary';
  style?: StyleProp<TextStyle>;
  /** Dimmed and struck through: an amount that is history, not a debt. */
  settled?: boolean;
};

export function AnimatedMoney({
  cents,
  currency,
  size = 'money',
  style,
  settled,
}: AnimatedMoneyProps) {
  const text = useThemeColor({}, 'text');
  const success = useThemeColor({}, 'success');
  const stillness = useReducedMotion();

  const value = useSharedValue(cents);
  const pop = useSharedValue(0);
  const [shown, setShown] = useState(cents);

  useEffect(() => {
    if (stillness) {
      value.value = cents;
      setShown(cents);
      return;
    }

    // A small lift on the way, so a change catches the eye even when the
    // figure only moves by a few cents.
    pop.value = withSequence(
      withTiming(1, { duration: Motion.instant }),
      withSpring(0, Motion.spring)
    );

    value.value = withTiming(cents, {
      duration: Motion.base,
      easing: Easing.out(Easing.cubic),
    });
  }, [cents, stillness, value, pop]);

  useAnimatedReaction(
    () => Math.round(value.value),
    (current, previous) => {
      if (previous !== null && current !== previous) runOnJS(setShown)(current);
    }
  );

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.05 }],
  }));

  return (
    <Animated.View style={animated}>
      <Text
        style={[
          Type[size],
          styles.figure,
          { color: text },
          settled && { color: success, textDecorationLine: 'line-through' },
          style,
        ]}>
        {formatCents(shown, currency)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  figure: {
    // A column of amounts has to line up on the decimal point, and a
    // proportional font moves every digit as the value counts.
    fontVariant: ['tabular-nums'],
  },
});
