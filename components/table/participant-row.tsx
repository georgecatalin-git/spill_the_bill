import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Participant } from '@/lib/types';

type ParticipantRowProps = {
  participant: Participant;
};

export function ParticipantRow({ participant }: ParticipantRowProps) {
  const success = useThemeColor({}, 'success');

  return (
    <View style={styles.row}>
      <Avatar name={participant.name} />

      <View style={styles.details}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {participant.name}
        </ThemedText>
        {participant.isAdmin && (
          <ThemedText type="secondary" style={styles.role}>
            Admin
          </ThemedText>
        )}
      </View>

      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: success }]} />
        <ThemedText type="secondary" style={styles.statusLabel}>
          Joined
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  details: {
    flex: 1,
  },
  name: {
    fontWeight: '500',
  },
  role: {
    fontSize: 13,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 14,
  },
});
