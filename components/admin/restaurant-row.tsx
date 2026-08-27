import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { FormField } from '@/components/ui/form-field';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { confirmAction } from '@/lib/confirm';
import type { OwnerRestaurantStat } from '@/lib/database';
import { isBlank } from '@/lib/validation';

/**
 * Scanning cost, in the currency the subscription is priced in.
 *
 * The database stores millionths of a dollar; euros are what the 30 €/month
 * figure is in, so the comparison a person actually makes — "is this place
 * paying for itself" — needs no arithmetic in their head.
 */
function scanCost(micros: number): string {
  const eur = micros / 1e6 / 1.08;
  if (eur === 0) return '0 €';
  if (eur < 0.01) return '<0,01 €';
  return `${eur.toFixed(2).replace('.', ',')} €`;
}

/** "3 days ago" reads faster than a timestamp when scanning a list of places. */
function lastActive(iso: string | null): string {
  if (!iso) return 'Never used';

  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 30) return `Active ${days} days ago`;
  return `Last active ${new Date(iso).toLocaleDateString()}`;
}

type RestaurantRowProps = {
  stat: OwnerRestaurantStat;
  /** The other restaurants, as merge destinations. */
  mergeTargets: OwnerRestaurantStat[];
  busy: boolean;
  onSave: (name: string, city: string, taxId: string) => Promise<void>;
  onToggleActive: () => Promise<void>;
  onMerge: (targetId: string) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Issues a new code, retiring every sticker already printed. */
  onRotateCode: () => Promise<void>;
};

/**
 * One restaurant: what it is, how much it is used, and what the owner can do
 * to it — edit, hide, merge, delete.
 *
 * Editing happens in place rather than on another screen — correcting a typo
 * should not cost a navigation, and the figures stay visible while you do it.
 */
export function RestaurantRow({
  stat,
  mergeTargets,
  busy,
  onSave,
  onToggleActive,
  onMerge,
  onDelete,
  onRotateCode,
}: RestaurantRowProps) {
  const textSecondary = useThemeColor({}, 'textSecondary');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');

  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [name, setName] = useState(stat.restaurant_name);
  const [city, setCity] = useState(stat.city);
  const [taxId, setTaxId] = useState(stat.tax_id ?? '');

  const [nameError, setNameError] = useState<string>();
  const [cityError, setCityError] = useState<string>();
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setName(stat.restaurant_name);
    setCity(stat.city);
    setTaxId(stat.tax_id ?? '');
    setNameError(undefined);
    setCityError(undefined);
    setError(null);
    setMerging(false);
    setEditing(true);
  }

  async function save() {
    // The same two rules the Add form applies. Without them a cleared field
    // reaches the database and comes back as a check-constraint failure that
    // never mentions which field was the problem.
    if (isBlank(name)) {
      setNameError('Please name the restaurant.');
      return;
    }

    if (isBlank(city)) {
      setCityError('Please say which town this one is in.');
      return;
    }

    setError(null);
    try {
      await onSave(name, city, taxId);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the restaurant.');
    }
  }

  async function confirmDelete() {
    const hasHistory = stat.tables_total > 0;

    // The warning names what is being destroyed rather than asking "are you
    // sure". Hiding is one tap away on this same card, and the message says so,
    // because for a contract that merely ends that is the better answer.
    const message = hasHistory
      ? `${stat.tables_total} ${stat.tables_total === 1 ? 'table' : 'tables'}, ${stat.bills_completed} closed ${stat.bills_completed === 1 ? 'bill' : 'bills'} and ${stat.participants_total} ${stat.participants_total === 1 ? 'person' : 'people'} are deleted with it. You lose the record that this place ever used Split.\n\nTo keep the history, cancel and use "Hide from the picker" instead.`
      : 'Nothing has happened here yet, so nothing else is lost.';

    const confirmed = await confirmAction({
      title: `Delete ${stat.restaurant_name}?`,
      message,
      confirmLabel: 'Delete',
      destructive: true,
    });

    if (!confirmed) return;

    setError(null);
    try {
      await onDelete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the restaurant.');
    }
  }

  /**
   * The lifecycle refusals are written for a person — "add the fiscal code
   * before making this restaurant active" — and belong on the card that was
   * pressed. Bound straight to the Pressable, the rejection had nowhere to go
   * and surfaced as an uncaught promise instead.
   */
  async function toggleActive() {
    setError(null);
    try {
      await onToggleActive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the restaurant.');
    }
  }

  async function confirmRotate() {
    // Worth a confirmation, because the damage is physical: every sticker in
    // the restaurant stops working the moment this returns.
    const confirmed = await confirmAction({
      title: 'Issue a new code?',
      message: `Every sticker already printed for ${stat.restaurant_name} stops working, and the tables have to be re-labelled. Do this when a code has turned up somewhere it should not.`,
      confirmLabel: 'New code',
      destructive: true,
    });

    if (!confirmed) return;

    setError(null);
    try {
      await onRotateCode();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not issue a new code.');
    }
  }

  async function confirmMerge(targetId: string) {
    const target = mergeTargets.find((row) => row.restaurant_id === targetId);
    if (!target) return;

    const confirmed = await confirmAction({
      title: `Merge into ${target.restaurant_name}?`,
      message: `${stat.tables_total} ${stat.tables_total === 1 ? 'table moves' : 'tables move'} across, and ${stat.restaurant_name} is removed. This cannot be undone.`,
      confirmLabel: 'Merge',
      destructive: true,
    });

    if (!confirmed) {
      // Put the card back rather than leaving the picker open on a choice that
      // was declined.
      setMerging(false);
      return;
    }

    setError(null);
    try {
      await onMerge(targetId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not merge the restaurants.');
    }
  }

  if (editing) {
    return (
      <Card style={styles.card}>
        <FormField
          label="Name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setNameError(undefined);
          }}
          placeholder="Trattoria Roma"
          autoCapitalize="words"
          error={nameError}
        />
        <FormField
          label="City"
          value={city}
          onChangeText={(text) => {
            setCity(text);
            setCityError(undefined);
          }}
          placeholder="Cluj-Napoca"
          autoCapitalize="words"
          error={cityError}
        />
        <FormField
          label="Fiscal code (CUI)"
          value={taxId}
          onChangeText={setTaxId}
          placeholder="RO12345678"
          autoCapitalize="characters"
        />

        {error && (
          <ThemedText type="secondary" style={[styles.figure, { color: warning }]}>
            {error}
          </ThemedText>
        )}

        <View style={styles.editActions}>
          <View style={styles.editAction}>
            <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} />
          </View>
          <View style={styles.editAction}>
            <Button label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
          </View>
        </View>
      </Card>
    );
  }

  // Half the 30 € subscription spent on reading receipts is the point at which
  // this place stops being comfortably profitable — worth seeing before the
  // month ends rather than on the invoice afterwards.
  const overBudget = stat.scan_cost_micros_this_month / 1e6 / 1.08 > 15;

  const mergeOptions: DropdownOption[] = mergeTargets.map((row) => ({
    value: row.restaurant_id,
    label: row.restaurant_name,
    hint: row.city,
  }));

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.title}>
          <ThemedText style={styles.name}>{stat.restaurant_name}</ThemedText>
          <ThemedText type="secondary" style={styles.figure}>
            {stat.city}
          </ThemedText>
        </View>
        <ThemedText
          type="secondary"
          style={[styles.badge, { color: stat.is_active ? success : textSecondary }]}>
          {stat.status}
        </ThemedText>
      </View>

      <View style={styles.figures}>
        <ThemedText type="secondary" style={styles.figure}>
          {stat.tables_active} active {stat.tables_active === 1 ? 'split' : 'splits'} ·{' '}
          {stat.tables_total} in total
        </ThemedText>
        <ThemedText type="secondary" style={styles.figure}>
          {stat.bills_completed} bills closed · {stat.participants_total} guests
        </ThemedText>
        <ThemedText type="secondary" style={styles.figure}>
          {lastActive(stat.last_activity_at)}
        </ThemedText>
        <ThemedText type="secondary" style={styles.figure}>
          Split code <ThemedText style={styles.code}>{stat.venue_code}</ThemedText> · print
          it as often as you like
        </ThemedText>
        {/* The one field that decides whether this restaurant can work at all:
            a scanned receipt is checked against it, so without one the
            database refuses to let the restaurant be active. */}
        {!stat.tax_id && (
          <ThemedText type="secondary" style={[styles.figure, { color: warning }]}>
            No fiscal code — add it before this restaurant can be active
          </ThemedText>
        )}
        <ThemedText
          type="secondary"
          style={[styles.figure, overBudget && { color: warning }]}>
          {stat.scans_this_month} {stat.scans_this_month === 1 ? 'scanare' : 'scanări'} luna
          aceasta · {scanCost(stat.scan_cost_micros_this_month)}
          {overBudget ? ' — peste jumătate din abonament' : ''}
        </ThemedText>

      </View>

      {error && (
        <ThemedText type="secondary" style={[styles.figure, { color: warning }]}>
          {error}
        </ThemedText>
      )}

      {merging ? (
        <View style={styles.mergeBox}>
          <ThemedText type="secondary" style={styles.figure}>
            Move this one&apos;s tables into:
          </ThemedText>
          <Dropdown
            value=""
            options={mergeOptions}
            onChange={(id) => void confirmMerge(id)}
            placeholder="Choose a restaurant"
          />
          <Pressable onPress={() => setMerging(false)}>
            <ThemedText type="secondary" style={styles.link}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable onPress={startEditing} disabled={busy}>
            <ThemedText type="secondary" style={styles.link}>
              Edit
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => void confirmRotate()} disabled={busy}>
            <ThemedText type="secondary" style={styles.link}>
              New code
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => void toggleActive()} disabled={busy}>
            <ThemedText type="secondary" style={styles.link}>
              {stat.is_active ? 'Stand down' : 'Make active'}
            </ThemedText>
          </Pressable>

          {mergeOptions.length > 0 && (
            <Pressable onPress={() => setMerging(true)} disabled={busy}>
              <ThemedText type="secondary" style={styles.link}>
                Merge
              </ThemedText>
            </Pressable>
          )}

          <Pressable onPress={() => void confirmDelete()} disabled={busy}>
            <ThemedText type="secondary" style={[styles.link, { color: warning }]}>
              Delete
            </ThemedText>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  title: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  badge: {
    fontSize: 12,
  },
  figures: {
    gap: 4,
  },
  figure: {
    fontSize: 13,
  },
  code: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  link: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  mergeBox: {
    gap: Spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  editAction: {
    flex: 1,
  },
});
