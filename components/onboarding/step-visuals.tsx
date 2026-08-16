import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';

/**
 * The illustrations behind each tutorial step.
 *
 * Every one of these is a drawing of the app, not the app: nothing here is
 * pressable and nothing reads or writes a real table, bill or claim. Buttons
 * are plain Views wearing the button's clothes, so a curious tap does nothing
 * at all rather than something surprising.
 */

/** A button's shape without a button's behaviour. */
function MockButton({ label, variant = 'primary' }: { label: string; variant?: 'primary' | 'secondary' }) {
  const accent = useThemeColor({}, 'accent');
  const accentText = useThemeColor({}, 'accentText');
  const border = useThemeColor({}, 'border');
  const text = useThemeColor({}, 'text');

  const isPrimary = variant === 'primary';

  return (
    <View
      style={[
        styles.mockButton,
        isPrimary
          ? { backgroundColor: accent }
          : { borderWidth: 1.5, borderColor: border },
      ]}>
      <ThemedText style={[styles.mockButtonLabel, { color: isPrimary ? accentText : text }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  const border = useThemeColor({}, 'border');
  const background = useThemeColor({}, 'background');

  return (
    <View style={[styles.field, { borderColor: border, backgroundColor: background }]}>
      <ThemedText type="label" style={styles.fieldLabel}>
        {label}
      </ThemedText>
      <ThemedText>{value}</ThemedText>
    </View>
  );
}

function Tick() {
  const success = useThemeColor({}, 'success');
  return <Ionicons name="checkmark-circle" size={18} color={success} />;
}

export function WelcomeVisual() {
  const border = useThemeColor({}, 'border');

  return (
    <View style={styles.centered}>
      <View style={styles.avatarStack}>
        {['George', 'Alex M', 'Maria I'].map((name, index) => (
          <View key={name} style={index > 0 && styles.avatarOverlap}>
            <Avatar name={name} size={56} />
          </View>
        ))}
      </View>
      <View style={[styles.receiptStub, { borderColor: border }]}>
        <View style={[styles.stubLine, { backgroundColor: border, width: '70%' }]} />
        <View style={[styles.stubLine, { backgroundColor: border, width: '45%' }]} />
        <View style={[styles.stubLine, { backgroundColor: border, width: '60%' }]} />
      </View>
    </View>
  );
}

export function CreateTableVisual() {
  return (
    <Card style={styles.card}>
      <MockField label="Table name" value="Dinner at Trattoria" />
      <MockField label="Restaurant" value="Trattoria Roma" />
      <MockButton label="+ New Table" />
    </Card>
  );
}

export function AddBillVisual() {
  const textSecondary = useThemeColor({}, 'textSecondary');

  const options = [
    { icon: 'scan-outline', label: 'Scan Receipt', hint: 'Photograph it' },
    { icon: 'create-outline', label: 'Add Manually', hint: 'Type the lines' },
  ] as const;

  return (
    <View style={styles.optionRow}>
      {options.map((option) => (
        <Card key={option.label} style={styles.option}>
          <Ionicons name={option.icon} size={28} color={textSecondary} />
          <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
          <ThemedText type="secondary" style={styles.optionHint}>
            {option.hint}
          </ThemedText>
        </Card>
      ))}
    </View>
  );
}

export function InviteVisual() {
  const border = useThemeColor({}, 'border');
  const background = useThemeColor({}, 'background');
  const textSecondary = useThemeColor({}, 'textSecondary');

  return (
    <Card style={styles.card}>
      <View style={[styles.link, { borderColor: border, backgroundColor: background }]}>
        <Ionicons name="link-outline" size={18} color={textSecondary} />
        <ThemedText type="secondary" numberOfLines={1} style={styles.linkText}>
          split.app/join/K7M2QX
        </ThemedText>
      </View>
      <MockButton label="Send Invitation Link" />
      <ThemedText type="secondary" style={styles.caption}>
        No account needed to join.
      </ThemedText>
    </Card>
  );
}

export function PickItemsVisual() {
  const border = useThemeColor({}, 'border');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const lines = [
    { name: 'Pizza', cents: 2000, claimants: ['George'] },
    { name: 'Coca Cola', cents: 500, claimants: ['Alex', 'Maria'] },
  ];

  return (
    <Card style={styles.card}>
      {lines.map((line, index) => (
        <View
          key={line.name}
          style={[styles.itemLine, index > 0 && { borderTopWidth: 1, borderTopColor: border }]}>
          <View style={styles.itemHeader}>
            <ThemedText style={styles.itemName}>{line.name}</ThemedText>
            <ThemedText style={styles.itemName}>{formatCents(line.cents)}</ThemedText>
          </View>

          {line.claimants.map((claimant) => (
            <View key={claimant} style={styles.claimant}>
              <ThemedText type="secondary">{claimant}</ThemedText>
              <Tick />
            </View>
          ))}
        </View>
      ))}

      <View style={styles.liveRow}>
        <Ionicons name="sync-outline" size={14} color={textSecondary} />
        <ThemedText type="secondary" style={styles.caption}>
          Updating on everyone&apos;s phone, live
        </ThemedText>
      </View>
    </Card>
  );
}

export function LiveBillVisual() {
  const border = useThemeColor({}, 'border');

  const people = [
    { name: 'George', cents: 2500 },
    { name: 'Alex', cents: 1850 },
    { name: 'Maria', cents: 3100 },
  ];

  return (
    <Card style={styles.card}>
      {people.map((person) => (
        <View key={person.name} style={styles.totalRow}>
          <View style={styles.person}>
            <Avatar name={person.name} size={28} />
            <ThemedText>{person.name}</ThemedText>
          </View>
          <ThemedText>{formatCents(person.cents)}</ThemedText>
        </View>
      ))}

      <View style={[styles.totalRow, styles.grandTotal, { borderTopColor: border }]}>
        <ThemedText style={styles.itemName}>Total</ThemedText>
        <ThemedText style={styles.itemName}>{formatCents(7450)}</ThemedText>
      </View>

      <ThemedText type="secondary" style={styles.caption}>
        Every share adds back to the cent.
      </ThemedText>
    </Card>
  );
}

export function SettleVisual() {
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');

  return (
    <Card style={styles.card}>
      <View style={styles.totalRow}>
        <ThemedText type="secondary">Bill Total</ThemedText>
        <ThemedText>{formatCents(7450)}</ThemedText>
      </View>

      <View style={styles.totalRow}>
        <ThemedText type="secondary">Collected</ThemedText>
        <ThemedText>{formatCents(7450)}</ThemedText>
      </View>

      <View style={[styles.totalRow, styles.grandTotal, { borderTopColor: border }]}>
        <ThemedText style={[styles.itemName, { color: success }]}>Everyone has paid</ThemedText>
        <Tick />
      </View>

      <MockButton label="Pay Restaurant" />
    </Card>
  );
}

export function ReadyVisual() {
  const success = useThemeColor({}, 'success');

  return (
    <View style={styles.centered}>
      <Ionicons name="checkmark-circle-outline" size={96} color={success} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOverlap: {
    marginLeft: -Spacing.md,
  },
  receiptStub: {
    width: 132,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  stubLine: {
    height: 6,
    borderRadius: Radius.pill,
  },
  card: {
    gap: Spacing.md,
  },
  field: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  fieldLabel: {
    opacity: 0.6,
    fontSize: 11,
  },
  mockButton: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  optionLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  optionHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  linkText: {
    flex: 1,
  },
  caption: {
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.75,
  },
  itemLine: {
    gap: Spacing.xs,
    paddingTop: Spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontWeight: '600',
  },
  claimant: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.md,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  grandTotal: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
});
