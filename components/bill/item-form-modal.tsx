import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { parseQuantity } from '@/lib/bill';
import { parsePriceToCents } from '@/lib/money';

/** Somebody at the table an order can be put on. */
export type ItemFormPerson = { id: string; name: string };

type ItemFormModalProps = {
  visible: boolean;
  onSubmit: (
    name: string,
    unitPriceCents: number,
    quantity: number,
    forPersonId: string | null
  ) => void;
  onClose: () => void;
  title?: string;
  submitLabel?: string;
  initialName?: string;
  initialPriceCents?: number;
  initialQuantity?: number;
  /**
   * Who the order can be put on, offered while adding.
   *
   * A waiter taking an order does one thing — "a beer for George" — and
   * splitting that across adding the line and then assigning it is how the
   * second half gets forgotten. Leave empty to keep the item unclaimed, which
   * is still the default and still what guests do for themselves.
   */
  people?: ItemFormPerson[];
};

/**
 * Bottom sheet for entering one bill item by hand, used both to add a new item
 * and to edit a detected one. Mount it with a `key` when editing so the fields
 * start from the item being edited.
 *
 * The quantity is always asked for. It was once hidden while adding, on the
 * theory that a round is three taps of "beer" rather than one line of three;
 * see AGENTS.md for why that was reversed.
 */
export function ItemFormModal({
  visible,
  onSubmit,
  onClose,
  title = 'Add item',
  submitLabel = 'Add item',
  initialName = '',
  initialPriceCents,
  initialQuantity = 1,
  people = [],
}: ItemFormModalProps) {
  const border = useThemeColor({}, 'border');
  const accent = useThemeColor({}, 'text');

  const initialPriceText = initialPriceCents ? (initialPriceCents / 100).toFixed(2) : '';
  const initialQuantityText = String(initialQuantity);

  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState(initialPriceText);
  const [quantity, setQuantity] = useState(initialQuantityText);
  const [forPersonId, setForPersonId] = useState<string | null>(null);


  const parsedPrice = parsePriceToCents(price);
  const parsedQuantity = parseQuantity(quantity);
  const canSubmit = name.trim().length > 0 && parsedPrice !== null && parsedQuantity !== null;

  function reset() {
    setName(initialName);
    setPrice(initialPriceText);
    setQuantity(initialQuantityText);
    setForPersonId(null);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(name, parsedPrice, parsedQuantity, forPersonId);
    reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    // Scrollable, and it must stay that way: this sheet has three fields, a row
    // of people and two buttons, and with a keyboard up it is taller than the
    // space left for it. Without scrolling, whatever is being typed can end up
    // under the keyboard with no way to bring it back.
    <BottomSheet visible={visible} onClose={handleClose}>
  <ThemedText type="subtitle" style={styles.title}>
        {title}
      </ThemedText>

      <View style={styles.field}>
        <ThemedText type="label" style={styles.fieldLabel}>
          Item
        </ThemedText>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="e.g. Pizza Margherita"
          autoFocus
          autoCapitalize="words"
          returnKeyType="next"
        />
      </View>

      <View style={styles.priceRow}>
        <View style={[styles.field, styles.priceField]}>
          <ThemedText type="label" style={styles.fieldLabel}>
            Price
          </ThemedText>
          <TextField
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>

        <View style={[styles.field, styles.quantityField]}>
          <ThemedText type="label" style={styles.fieldLabel}>
            Qty
          </ThemedText>
          <TextField
            value={quantity}
            onChangeText={setQuantity}
            placeholder="1"
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>
      </View>

      {people.length > 0 && (
        <View style={styles.field}>
          <ThemedText type="label" style={styles.fieldLabel}>
            For
          </ThemedText>

          <View style={styles.people}>
            {/* "Nobody yet" first and selected by default: an item that belongs
                to no one is the normal case, and the one guests claim
                themselves. */}
            <Pressable
              onPress={() => setForPersonId(null)}
              style={[
                styles.person,
                { borderColor: border },
                forPersonId === null && { borderColor: accent },
              ]}>
              <ThemedText type="secondary" style={styles.personLabel}>
                Nobody yet
              </ThemedText>
            </Pressable>

            {people.map((person) => (
              <Pressable
                key={person.id}
                onPress={() => setForPersonId(person.id)}
                style={[
                  styles.person,
                  { borderColor: border },
                  forPersonId === person.id && { borderColor: accent },
                ]}>
                <ThemedText style={styles.personLabel}>{person.name}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <Button label={submitLabel} onPress={handleSubmit} disabled={!canSubmit} />
        <Button label="Cancel" variant="secondary" onPress={handleClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    lineHeight: 26,
  },
  field: {
    gap: Spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  priceField: {
    flex: 2,
  },
  people: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  person: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  personLabel: {
    fontSize: 14,
    lineHeight: 19,
  },
  quantityField: {
    flex: 1,
  },
  fieldLabel: {
    opacity: 0.6,
  },
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
