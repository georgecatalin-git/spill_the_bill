import { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewProps } from 'react-native';

/** Fades and lifts its children into place once, when first rendered. */
export function FadeInView({ style, children, ...rest }: ViewProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
      {...rest}>
      {children}
    </Animated.View>
  );
}
