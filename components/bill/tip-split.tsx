import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';

type TipShareRow = { id: string; name: string; isMe: boolean; amountCents: number };

type TipSplitProps = {
  shares: TipShareRow[];
  currency?: string;
};

/**
 * How the tip is divided: evenly across everyone active at the table right
 * now, not by who ordered more. Shows every share, not just the reader's own,
 * so the number in "Your Total" is never a mystery — it's the same split
 * everyone else sees, added up.
 */
export function TipSplit({ shares, currency }: TipSplitProps) {
  const border = useThemeColor({}, 'border');
  const accent = useThemeColor({}, 'accent');

  const totalCents = shares.reduce((sum, share) => sum + share.amountCents, 0);

  // No tip on this bill, or nobody active to split it between — nothing to show.
  if (totalCents === 0 || shares.length === 0) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.headline}>
        <ThemedText type="label" style={styles.label}>
          Tip
        </ThemedText>
        <ThemedText style={styles.total}>{formatCents(totalCents, currency)}</ThemedText>
        <ThemedText type="secondary" style={styles.hint}>
          Split evenly across {shares.length} {shares.length === 1 ? 'person' : 'people'} at the
          table
        </ThemedText>
      </View>

      <View>
        {shares.map((share, index) => (
          <View
            key={share.id}
            style={[styles.row, index > 0 && styles.divider, index > 0 && { borderTopColor: border }]}>
            <Avatar name={share.name} size={28} />
            <ThemedText
              style={[styles.name, share.isMe && { color: accent, fontWeight: '700' }]}
              numberOfLines={1}>
              {share.name}
              {share.isMe ? ' (You)' : ''}
            </ThemedText>
            <ThemedText style={styles.amount}>{formatCents(share.amountCents, currency)}</ThemedText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.md,
  },
  headline: {
    gap: Spacing.xs,
  },
  label: {
    opacity: 0.6,
  },
  total: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  divider: {
    borderTopWidth: 1,
  },
  name: {
    flex: 1,
    fontWeight: '500',
  },
  amount: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
