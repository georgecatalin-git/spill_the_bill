import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { haptics } from '@/lib/haptics';

/**
 * It worked.
 *
 * A ring springs open and the tick is drawn inside it a beat later, because a
 * mark that appears fully formed reads as an icon while one that is drawn reads
 * as something having just happened. The success haptic fires with it, once.
 *
 * The tick is two borders on a rotated square — no image, no icon font, nothing
 * to load at the moment the app is trying to say a thing went well.
 */

export function SuccessCheck({ size = 64, silent }: { size?: number; silent?: boolean }) {
  const success = useThemeColor({}, 'success');
  const stillness = useReducedMotion();

  const ring = useSharedValue(stillness ? 1 : 0);
  const tick = useSharedValue(stillness ? 1 : 0);

  useEffect(() => {
    if (!silent) haptics.success();
    if (stillness) return;

    ring.value = withSpring(1, Motion.spring);
    tick.value = withDelay(Motion.instant, withTiming(1, { duration: Motion.fast }));
  }, [ring, tick, stillness, silent]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + ring.value * 0.4 }],
    opacity: ring.value,
  }));

  const tickStyle = useAnimatedStyle(() => ({
    opacity: tick.value,
    transform: [{ rotate: '45deg' }, { scale: 0.5 + tick.value * 0.5 }],
  }));

  return (
    <Animated.View
      accessibilityRole="image"
      accessibilityLabel="Done"
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, borderColor: success },
        ringStyle,
      ]}>
      <View style={styles.centre}>
        <Animated.View
          style={[
            styles.tick,
            {
              width: size * 0.24,
              height: size * 0.44,
              borderColor: success,
              borderRightWidth: Math.max(2, size * 0.06),
              borderBottomWidth: Math.max(2, size * 0.06),
            },
            tickStyle,
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
    // Lifts the tick so the rotated square sits optically centred in the ring.
    marginTop: -2,
  },
  tick: {
    backgroundColor: 'transparent',
  },
});
