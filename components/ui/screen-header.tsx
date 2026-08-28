import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Motion } from '@/constants/theme';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
};

/**
 * The top of a screen.
 *
 * It arrives first and everything below follows it, which is what gives a
 * screen a reading order instead of appearing as one block. The movement is
 * small — eight points — because a header that swoops is a header you wait for.
 */
export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  return (
    <Animated.View entering={FadeInDown.duration(Motion.base)} style={styles.header}>
      <ThemedText type="title" accessibilityRole="header" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle && (
        <ThemedText type="secondary" style={styles.subtitle}>
          {subtitle}
        </ThemedText>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 2,
  },
  title: {
    fontSize: 30,
    lineHeight: 37,
  },
  subtitle: {
    maxWidth: 420,
  },
});
