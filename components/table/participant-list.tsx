import { StyleSheet, View } from 'react-native';

import { ParticipantRow } from '@/components/table/participant-row';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeInView } from '@/components/ui/fade-in-view';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Participant } from '@/lib/types';

type ParticipantListProps = {
  participants: Participant[];
};

export function ParticipantList({ participants }: ParticipantListProps) {
  const border = useThemeColor({}, 'border');

  if (participants.length === 0) {
    return (
      <EmptyState
        icon="👋"
        message="No one has joined yet."
        hint="Share the invitation link to get started."
      />
    );
  }

  return (
    <View style={styles.list}>
      {participants.map((participant, index) => (
        <FadeInView
          key={participant.id}
          style={[index > 0 && styles.divider, index > 0 && { borderTopColor: border }]}>
          <ParticipantRow participant={participant} />
        </FadeInView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.xs,
  },
  divider: {
    borderTopWidth: 1,
    paddingTop: Spacing.xs,
  },
});
