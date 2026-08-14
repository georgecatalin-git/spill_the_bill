import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';

type EvenShareRow = { id: string; name: string; isMe: boolean; amountCents: number };

type EvenSplitProps = {
  shares: EvenShareRow[];
  currency?: string;
};

/**
 * The whole bill, divided by headcount.
 *
 * Shows everyone's share rather than only the reader's, for the same reason
 * the tip card does: a number you can check against your friends' is a number
 * you can trust. The parts are worked out in Postgres by largest remainder, so
 * they add back up to the bill exactly — this only displays them.
 */
export function EvenSplit({ shares, currency }: EvenSplitProps) {
  const border = useThemeColor({}, 'border');
  const accent = useThemeColor({}, 'accent');

  if (shares.length === 0) return null;

  const totalCents = shares.reduce((sum, share) => sum + share.amountCents, 0);

  return (
    <Card style={styles.card}>
      <View style={styles.headline}>
        <ThemedText type="label" style={styles.label}>
          Split evenly
        </ThemedText>
        <ThemedText style={styles.total}>{formatCents(totalCents, currency)}</ThemedText>
        <ThemedText type="secondary" style={styles.hint}>
          The whole bill — items, tax and tip — divided between {shares.length}{' '}
          {shares.length === 1 ? 'person' : 'people'}. Nobody has to tick anything.
        </ThemedText>
      </View>

      <View>
        {shares.map((share, index) => (
          <View
            key={share.id}
            style={[
              styles.row,
              index > 0 && styles.divider,
              index > 0 && { borderTopColor: border },
            ]}>
            <Avatar name={share.name} size={28} />
            <ThemedText
              style={[styles.name, share.isMe && { color: accent, fontWeight: '700' }]}
              numberOfLines={1}>
              {share.name}
              {share.isMe ? ' (You)' : ''}
            </ThemedText>
            <ThemedText style={styles.amount}>
              {formatCents(share.amountCents, currency)}
            </ThemedText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.md },
  headline: { gap: Spacing.xs },
  label: { opacity: 0.6 },
  total: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  hint: { fontSize: 13, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  divider: { borderTopWidth: 1 },
  name: { flex: 1, fontWeight: '500' },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
