import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useState } from 'react';

import { useThemeColor } from '@/hooks/use-theme-color';
import { confirmAction } from '@/lib/confirm';
import type { AdminAccount } from '@/lib/database';

type AccountRowProps = {
  account: AdminAccount;
  onDelete: () => Promise<void>;
};

/**
 * One account: who it is, and what it has done.
 *
 * Deliberately nothing about restaurants. An account is not linked to one any
 * more — the printed code says which restaurant a session is at, and
 * `prevent_unauthorised_table` makes that the only way in. Choosing a
 * restaurant for somebody was a control that only ever restricted the people
 * the owner trusted.
 */
export function AccountRow({ account, onDelete }: AccountRowProps) {
  const warning = useThemeColor({}, 'warning');
  const textSecondary = useThemeColor({}, 'textSecondary');

  // The server's refusals are written for a person to read; without somewhere
  // to put them they escape as uncaught promise rejections instead.
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    }
  }

  // The owner reaches every restaurant through `is_owner()`, so offering them a
  // restaurant here would be offering a setting that changes nothing.
  if (account.role === 'owner') {
    return (
      <Card style={styles.card}>
        <View style={styles.who}>
          <ThemedText style={styles.name}>{account.full_name ?? account.email}</ThemedText>
          <ThemedText type="secondary" style={styles.line}>
            {account.email}
          </ThemedText>
        </View>
        <ThemedText type="secondary" style={[styles.line, { color: textSecondary }]}>
          Owner — opens tables anywhere
        </ThemedText>
      </Card>
    );
  }

  async function confirmDelete() {
    // The warning names what survives rather than asking "are you sure". What
    // this destroys is one login; what it deliberately does not destroy is the
    // restaurant's record, and that is the part somebody would worry about.
    const kept =
      account.tables_total > 0
        ? `The ${account.tables_total} ${
            account.tables_total === 1 ? 'table' : 'tables'
          } opened by this account stay with their restaurants, but nobody will be able to act on them again.`
        : 'This account has never opened a table, so nothing else changes.';

    const confirmed = await confirmAction({
      title: `Delete ${account.full_name ?? account.email}?`,
      message: `The login, the name and the email are removed for good.\n\n${kept}`,
      confirmLabel: 'Delete',
      destructive: true,
    });

    if (!confirmed) return;
    await run(onDelete, 'Could not delete the account.');
  }

  return (
    <Card style={styles.card}>
      <View style={styles.who}>
        <ThemedText style={styles.name}>{account.full_name ?? account.email}</ThemedText>
        <ThemedText type="secondary" style={styles.line}>
          {account.email}
        </ThemedText>
      </View>

      {error && (
        <ThemedText type="secondary" style={[styles.line, { color: warning }]}>
          {error}
        </ThemedText>
      )}

      <View style={styles.actions}>
        <ThemedText type="secondary" style={styles.line}>
          {account.tables_total} {account.tables_total === 1 ? 'table' : 'tables'} opened
        </ThemedText>

        <Pressable onPress={() => void confirmDelete()}>
          <ThemedText type="secondary" style={[styles.link, { color: warning }]}>
            Delete account
          </ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  who: { gap: 2 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  line: { fontSize: 13 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  link: { fontSize: 13, textDecorationLine: 'underline' },
});
