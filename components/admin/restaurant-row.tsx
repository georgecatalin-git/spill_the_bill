import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { FormField } from '@/components/ui/form-field';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { OwnerRestaurantStat } from '@/lib/database';

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
  onSave: (name: string, city: string) => Promise<void>;
  onToggleActive: () => Promise<void>;
  onMerge: (targetId: string) => Promise<void>;
  onDelete: () => Promise<void>;
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
}: RestaurantRowProps) {
  const textSecondary = useThemeColor({}, 'textSecondary');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');

  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [name, setName] = useState(stat.restaurant_name);
  const [city, setCity] = useState(stat.city);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setName(stat.restaurant_name);
    setCity(stat.city);
    setError(null);
    setMerging(false);
    setEditing(true);
  }

  async function save() {
    setError(null);
    try {
      await onSave(name, city);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the restaurant.');
    }
  }

  function confirmDelete() {
    const hasHistory = stat.tables_total > 0;

    // A place with history behind it loses the very figures the owner area
    // exists to show, so the warning names them rather than saying "are you
    // sure". An empty one needs no such ceremony.
    const message = hasHistory
      ? `${stat.tables_total} ${stat.tables_total === 1 ? 'table' : 'tables'}, ${stat.bills_completed} closed ${stat.bills_completed === 1 ? 'bill' : 'bills'} and ${stat.participants_total} ${stat.participants_total === 1 ? 'person' : 'people'} are deleted with it. You lose the record that this place ever used Split.\n\nHide it instead to keep the history.`
      : 'Nothing has happened here yet, so nothing else is lost.';

    Alert.alert(`Delete ${stat.restaurant_name}?`, message, [
      { text: 'Cancel', style: 'cancel' },
      ...(hasHistory
        ? [{ text: 'Hide instead', onPress: () => void onToggleActive() }]
        : []),
      {
        text: 'Delete',
        style: 'destructive' as const,
        onPress: async () => {
          setError(null);
          try {
            await onDelete();
          } catch (caught) {
            setError(
              caught instanceof Error ? caught.message : 'Could not delete the restaurant.'
            );
          }
        },
      },
    ]);
  }

  function confirmMerge(targetId: string) {
    const target = mergeTargets.find((row) => row.restaurant_id === targetId);
    if (!target) return;

    Alert.alert(
      `Merge into ${target.restaurant_name}?`,
      `${stat.tables_total} ${stat.tables_total === 1 ? 'table moves' : 'tables move'} across, and ${stat.restaurant_name} is removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            try {
              await onMerge(targetId);
            } catch (caught) {
              setError(
                caught instanceof Error ? caught.message : 'Could not merge the restaurants.'
              );
            }
          },
        },
      ]
    );
  }

  if (editing) {
    return (
      <Card style={styles.card}>
        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Trattoria Roma"
          autoCapitalize="words"
        />
        <FormField
          label="City"
          value={city}
          onChangeText={setCity}
          placeholder="Cluj-Napoca"
          autoCapitalize="words"
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
          {stat.is_active ? 'Active' : 'Hidden'}
        </ThemedText>
      </View>

      <View style={styles.figures}>
        <ThemedText type="secondary" style={styles.figure}>
          {stat.tables_total} tables · {stat.tables_active} open
        </ThemedText>
        <ThemedText type="secondary" style={styles.figure}>
          {stat.bills_completed} bills closed · {stat.participants_total} people
        </ThemedText>
        <ThemedText type="secondary" style={styles.figure}>
          {lastActive(stat.last_activity_at)}
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
          <Dropdown value="" options={mergeOptions} onChange={confirmMerge} placeholder="Choose a restaurant" />
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

          <Pressable onPress={onToggleActive} disabled={busy}>
            <ThemedText type="secondary" style={styles.link}>
              {stat.is_active ? 'Hide from the picker' : 'Show in the picker'}
            </ThemedText>
          </Pressable>

          {mergeOptions.length > 0 && (
            <Pressable onPress={() => setMerging(true)} disabled={busy}>
              <ThemedText type="secondary" style={styles.link}>
                Merge
              </ThemedText>
            </Pressable>
          )}

          <Pressable onPress={confirmDelete} disabled={busy}>
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
