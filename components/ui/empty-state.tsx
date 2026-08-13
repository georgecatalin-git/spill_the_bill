import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

type EmptyStateProps = {
  message: string;
  hint?: string;
};

/** Placeholder area shown where a list (e.g. guests) will appear. */
export function EmptyState({ message, hint }: EmptyStateProps) {
  const border = useThemeColor({}, 'border');

  return (
    <View style={[styles.container, { borderColor: border }]}>
      <ThemedText style={styles.message}>{message}</ThemedText>
      {hint && (
        <ThemedText type="secondary" style={styles.hint}>
          {hint}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  message: {
    textAlign: 'center',
    fontWeight: '500',
  },
  hint: {
    textAlign: 'center',
  },
});
