import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { confirmAction } from '@/lib/confirm';
import type { AdminAccount } from '@/lib/database';

type AccountRowProps = {
  account: AdminAccount;
  /** Every restaurant, as somewhere this account could belong. */
  options: DropdownOption[];
  onLink: (restaurantId: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
};

/**
 * One account, and where it opens tables.
 *
 * The restaurant is not something the account chooses — it is a property of
 * the profile, written only from here, and the database refuses a table
 * anywhere else. So this dropdown is the whole of the control, and an account
 * left unlinked simply cannot open a table.
 */
export function AccountRow({ account, options, onLink, onDelete }: AccountRowProps) {
  const warning = useThemeColor({}, 'warning');
  const textSecondary = useThemeColor({}, 'textSecondary');

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
          } opened by this account stay with ${
            account.restaurant_name ?? 'the restaurant'
          }, but nobody will be able to act on them again.`
        : 'This account has never opened a table, so nothing else changes.';

    const confirmed = await confirmAction({
      title: `Delete ${account.full_name ?? account.email}?`,
      message: `The login, the name and the email are removed for good.\n\n${kept}`,
      confirmLabel: 'Delete',
      destructive: true,
    });

    if (!confirmed) return;
    await onDelete();
  }

  return (
    <Card style={styles.card}>
      <View style={styles.who}>
        <ThemedText style={styles.name}>{account.full_name ?? account.email}</ThemedText>
        <ThemedText type="secondary" style={styles.line}>
          {account.email}
        </ThemedText>
      </View>

      {!account.restaurant_id && (
        <ThemedText type="secondary" style={[styles.line, { color: warning }]}>
          Not linked — this account cannot open a table
        </ThemedText>
      )}

      <Dropdown
        value={account.restaurant_id ?? ''}
        options={options}
        onChange={(id) => void onLink(id || null)}
        placeholder="Link to a restaurant"
      />

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
