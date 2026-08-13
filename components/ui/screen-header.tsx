import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
};

export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle && <ThemedText type="secondary">{subtitle}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.xs,
  },
  title: {
    fontSize: 32,
    lineHeight: 42,
  },
});
