import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * The shape of what is coming, while it is on its way.
 *
 * A blank screen with a spinner tells somebody to wait; a page already laid out
 * in grey tells them what they are waiting for, and the arrival is then a fill
 * rather than a jump. Match the real content's size — a skeleton that is the
 * wrong shape moves the page when the data lands, which is worse than no
 * skeleton at all.
 */

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height = 16, radius = Radius.sm, style }: SkeletonProps) {
  const surface = useThemeColor({}, 'surfaceSunken');
  const shimmer = useThemeColor({}, 'shimmer');
  const stillness = useReducedMotion();

  const travel = useSharedValue(0);

  useEffect(() => {
    if (stillness) return;
    travel.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      -1,
      false
    );
  }, [travel, stillness]);

  const sweep = useAnimatedStyle(() => ({
    // Percentages rather than pixels, so one component works at every width
    // without being measured.
    left: `${-60 + travel.value * 160}%`,
  }));

  return (
    <View
      style={[styles.base, { width, height, borderRadius: radius, backgroundColor: surface }, style]}>
      {!stillness && (
        <Animated.View style={[styles.sweep, { backgroundColor: shimmer }, sweep]} />
      )}
    </View>
  );
}

/** A stack of them, for a list that has not arrived. */
export function SkeletonList({ rows = 3, height = 72 }: { rows?: number; height?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={height} radius={Radius.lg} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '60%',
  },
  list: {
    gap: Spacing.sm,
  },
});
