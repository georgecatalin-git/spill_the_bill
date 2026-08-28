import { useEffect, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

/**
 * Content arriving.
 *
 * Written by hand rather than with Reanimated's declarative `entering`, for two
 * small reasons. `FadeInDown.duration(...).springify()` asks for two
 * contradictory things — springify ignores the duration — and the failure mode
 * of getting an entrance wrong is content that is simply not on the screen. And
 * a value driven to one on mount, clamped, with nothing else touching it, is
 * something anybody reading this can be sure ends visible.
 *
 * (An earlier version of this comment claimed the declarative form had been
 * measured leaving elements at eleven percent opacity. It had not: the page
 * being measured was hidden, so the browser was throttling
 * `requestAnimationFrame` and every animation on it was frozen part-way. The
 * reasons above stand on their own; that one was never true.)
 */

type AppearProps = {
  children: ReactNode;
  /** Position in a list. Later items wait a little longer, up to a cap. */
  index?: number;
  /** How far it rises into place. Zero for something that should only fade. */
  lift?: number;
  style?: StyleProp<ViewStyle>;
};

export function Appear({ children, index = 0, lift = 10, style }: AppearProps) {
  const stillness = useReducedMotion();
  const progress = useSharedValue(stillness ? 1 : 0);

  useEffect(() => {
    if (stillness) {
      progress.value = 1;
      return;
    }

    progress.value = withDelay(
      Math.min(index, Motion.staggerCap) * Motion.stagger,
      withSpring(1, Motion.springSoft)
    );
  }, [index, progress, stillness]);

  const animated = useAnimatedStyle(() => ({
    // Clamped: a spring overshoots, and opacity above one is a warning on some
    // platforms and a no-op on others. Neither is worth finding out about.
    opacity: Math.min(1, progress.value),
    transform: [{ translateY: (1 - progress.value) * lift }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
