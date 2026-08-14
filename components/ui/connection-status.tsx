import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { ConnectionStatus } from '@/hooks/use-realtime-bill';
import { useThemeColor } from '@/hooks/use-theme-color';

type ConnectionIndicatorProps = {
  status: ConnectionStatus;
};

/**
 * A dot and a word, nothing more.
 *
 * Losing the live connection is not an error worth a banner — the figures on
 * screen are still the ones the server last sent, they have simply stopped
 * moving. Anything raw from the socket stays out of sight.
 */
export function ConnectionIndicator({ status }: ConnectionIndicatorProps) {
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');
  const muted = useThemeColor({}, 'textSecondary');

  const { label, color } = describe(status, { success, warning, muted });

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="secondary" style={styles.label}>
        {label}
      </ThemedText>
    </View>
  );
}

function describe(
  status: ConnectionStatus,
  colors: { success: string; warning: string; muted: string }
) {
  switch (status) {
    case 'connected':
      return { label: 'Live', color: colors.success };
    case 'connecting':
      return { label: 'Connecting…', color: colors.muted };
    case 'reconnecting':
      return { label: 'Reconnecting…', color: colors.warning };
    default:
      return { label: 'Offline', color: colors.muted };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
});
