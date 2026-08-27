import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { AdminAccount } from '@/lib/database';

type AccountRowProps = {
  account: AdminAccount;
  /** Every restaurant, as somewhere this account could belong. */
  options: DropdownOption[];
  onLink: (restaurantId: string | null) => Promise<void>;
};

/**
 * One account, and where it opens tables.
 *
 * The restaurant is not something the account chooses — it is a property of
 * the profile, written only from here, and the database refuses a table
 * anywhere else. So this dropdown is the whole of the control, and an account
 * left unlinked simply cannot open a table.
 */
export function AccountRow({ account, options, onLink }: AccountRowProps) {
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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  who: { gap: 2 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  line: { fontSize: 13 },
});
