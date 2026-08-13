import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

type InvitationModalProps = {
  visible: boolean;
  link: string;
  /** Shown large so it can be read out loud across a noisy table. */
  inviteCode?: string;
  onShare: () => void;
  onClose: () => void;
  /** Called once the sheet has finished closing. */
  onDismiss?: () => void;
};

/** How long the "Copied" confirmation stays up. */
const COPIED_FEEDBACK_MS = 2000;

/** Bottom sheet with the invitation link and the ways to send it. */
export function InvitationModal({
  visible,
  link,
  inviteCode,
  onShare,
  onClose,
  onDismiss,
}: InvitationModalProps) {
  const [copied, setCopied] = useState(false);

  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    await Clipboard.setStringAsync(link);
    setCopied(true);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false} onDismiss={onDismiss}>
    <View style={styles.copy}>
        <ThemedText type="subtitle" style={styles.title}>
          Invite people to your table
        </ThemedText>
        <ThemedText type="secondary">
          Anyone with this link can join. No account needed.
        </ThemedText>
      </View>

      {/* QR placeholder: no QR library is installed yet, so this stays a
          clean, labelled area rather than a broken image. */}
      <View style={[styles.qrPlaceholder, { backgroundColor: surface, borderColor: border }]}>
        {inviteCode ? (
          <>
            <ThemedText type="label" style={styles.qrLabel}>
              Table code
            </ThemedText>
            <ThemedText style={styles.code}>{inviteCode}</ThemedText>
          </>
        ) : (
          <ThemedText type="secondary">QR code coming soon</ThemedText>
        )}
      </View>

      <View style={[styles.linkBox, { backgroundColor: surface, borderColor: border }]}>
        <ThemedText numberOfLines={1} style={styles.link}>
          {link}
        </ThemedText>
      </View>

      {copied && (
        <ThemedText type="secondary" style={{ color: success }}>
          Link copied to clipboard
        </ThemedText>
      )}

      <View style={styles.actions}>
        <Button label="Share Link" onPress={onShare} />
        <Button label={copied ? 'Copied' : 'Copy Link'} variant="secondary" onPress={handleCopy} />
        <Button label="Close" variant="secondary" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  copy: {
    gap: Spacing.xs,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
  },
  qrPlaceholder: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  qrLabel: {
    opacity: 0.6,
  },
  code: {
    fontSize: 30,
    lineHeight: 39,
    fontWeight: '700',
    letterSpacing: 4,
  },
  linkBox: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  link: {
    fontSize: 15,
  },
  actions: {
    gap: Spacing.sm,
  },
});
