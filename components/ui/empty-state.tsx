import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Appear } from '@/components/ui/appear';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

type EmptyStateProps = {
  message: string;
  hint?: string;
  /** One glyph. Enough to make the space feel composed rather than broken. */
  icon?: string;
  /** Usually the button that fills the emptiness. */
  action?: ReactNode;
};

/**
 * Where something will be, said in a way that does not look like a failure.
 *
 * The old version was a dashed box with a sentence in it, which reads as an
 * error to anybody who has ever seen a form. This one is composed: a mark, a
 * line telling you what belongs here, a line telling you how to put it there,
 * and the button that does it.
 */
export function EmptyState({ message, hint, icon, action }: EmptyStateProps) {
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const textSecondary = useThemeColor({}, 'textSecondary');

  return (
    <Appear style={[styles.container, { borderColor: border, backgroundColor: surface }]}>
      {icon && (
        <View style={[styles.badge, { backgroundColor: border }]}>
          <ThemedText style={[styles.icon, { color: textSecondary }]}>{icon}</ThemedText>
        </View>
      )}

      <ThemedText style={styles.message}>{message}</ThemedText>

      {hint && (
        <ThemedText type="secondary" style={styles.hint}>
          {hint}
        </ThemedText>
      )}

      {action && <View style={styles.action}>{action}</View>}
    </Appear>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  icon: {
    fontSize: 22,
    lineHeight: 28,
  },
  message: {
    ...Type.heading,
    textAlign: 'center',
  },
  hint: {
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    marginTop: Spacing.md,
    alignSelf: 'stretch',
  },
});
