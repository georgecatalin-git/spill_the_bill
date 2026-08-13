import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InvitationModal } from '@/components/table/invitation-modal';
import { ParticipantList } from '@/components/table/participant-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getTable, listParticipants } from '@/lib/services/table-service';
import { buildInvitationLink, buildInvitationMessage } from '@/lib/table';
import type { Participant } from '@/lib/types';

/**
 * Backstop in case the sheet never reports that it closed — the share must
 * still happen rather than the button appearing to do nothing.
 */
const DISMISS_FALLBACK_MS = 600;

/** Admin view: invite people, watch them join, then open the bill. */
export default function TableScreen() {
  const { id, code, name, restaurant } = useLocalSearchParams<{
    id?: string;
    code?: string;
    name?: string;
    restaurant?: string;
  }>();
  const warning = useThemeColor({}, 'warning');

  const [invitationVisible, setInvitationVisible] = useState(false);
  const shareWhenClosed = useRef(false);
  const [people, setPeople] = useState<Participant[]>([]);
  const [loadedCode, setLoadedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tableName = name ?? 'Your table';
  const restaurantName = restaurant ?? '';
  // Opened from the dashboard we only get an id, so the code is fetched.
  const inviteCode = code ?? loadedCode ?? '';

  const load = useCallback(async () => {
    if (!id) return;

    setError(null);
    try {
      if (!code) {
        const table = await getTable(id);
        if (table) setLoadedCode(table.invite_code);
      }

      const rows = await listParticipants(id);
      setPeople(
        rows.map((row) => ({
          id: row.id ?? '',
          name: row.name ?? '',
          isAdmin: row.is_admin ?? false,
        }))
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the people here.');
    }
  }, [id, code]);

  useEffect(() => {
    load();
  }, [load]);

  const participants = people;

  async function openShareSheet() {
    if (!shareWhenClosed.current) return;
    shareWhenClosed.current = false;

    try {
      await Share.share({
        title: 'Join my table on Split',
        message: buildInvitationMessage(inviteCode),
      });
    } catch {
      // Share sheet dismissed or unavailable — nothing to do.
    }
  }

  /**
   * iOS hands the share sheet to whichever screen is on top, and our own sheet
   * counts as one — asking while it is still up gets refused, and the screen
   * looks frozen. So close ours first and share only once it has actually gone,
   * which the sheet tells us rather than us guessing at an animation length.
   */
  function handleShare() {
    shareWhenClosed.current = true;
    setInvitationVisible(false);

    // Android does not report a dismiss, and does not need the wait either.
    if (Platform.OS !== 'ios') {
      openShareSheet();
      return;
    }

    setTimeout(openShareSheet, DISMISS_FALLBACK_MS);
  }

  function handleStartBill() {
    router.push({ pathname: '/bill', params: { tableId: id } });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader title={tableName} subtitle={restaurantName} />

          <Card style={styles.inviteCard}>
            <View style={styles.inviteCopy}>
              <ThemedText type="subtitle" style={styles.inviteTitle}>
                Invite your friends
              </ThemedText>
              <ThemedText type="secondary">
                Share the link with everyone at the table.
              </ThemedText>
            </View>
            <Button label="Invite People" onPress={() => setInvitationVisible(true)} />
          </Card>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="label" style={styles.sectionLabel}>
                People at the table{participants.length > 0 ? ` · ${participants.length}` : ''}
              </ThemedText>
            </View>
            <ParticipantList participants={participants} />
            <Button label="Refresh" variant="secondary" onPress={load} />
            {error && (
              <ThemedText type="secondary" style={{ color: warning }}>
                {error}
              </ThemedText>
            )}
          </View>

          <Button label="Open Bill" onPress={handleStartBill} />
        </ScrollView>
      </SafeAreaView>

      <InvitationModal
        visible={invitationVisible}
        link={buildInvitationLink(inviteCode)}
        inviteCode={inviteCode}
        onShare={handleShare}
        onDismiss={openShareSheet}
        onClose={() => {
          shareWhenClosed.current = false;
          setInvitationVisible(false);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
  inviteCard: {
    gap: Spacing.lg,
  },
  inviteCopy: {
    gap: Spacing.xs,
  },
  inviteTitle: {
    fontSize: 18,
    lineHeight: 23,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    opacity: 0.6,
  },
});
