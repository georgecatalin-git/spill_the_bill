import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { parseQuantity } from '@/lib/bill';
import { parsePriceToCents } from '@/lib/money';

type ItemFormModalProps = {
  visible: boolean;
  onSubmit: (name: string, unitPriceCents: number, quantity: number) => void;
  onClose: () => void;
  title?: string;
  submitLabel?: string;
  initialName?: string;
  initialPriceCents?: number;
  initialQuantity?: number;
};

/**
 * Bottom sheet for entering one bill item by hand, used both to add a new item
 * and to edit a detected one. Mount it with a `key` when editing so the fields
 * start from the item being edited.
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
}: ItemFormModalProps) {
  const initialPriceText = initialPriceCents ? (initialPriceCents / 100).toFixed(2) : '';
  const initialQuantityText = String(initialQuantity);

  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState(initialPriceText);
  const [quantity, setQuantity] = useState(initialQuantityText);


  const parsedPrice = parsePriceToCents(price);
  const parsedQuantity = parseQuantity(quantity);
  const canSubmit = name.trim().length > 0 && parsedPrice !== null && parsedQuantity !== null;

  function reset() {
    setName(initialName);
    setPrice(initialPriceText);
    setQuantity(initialQuantityText);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(name, parsedPrice, parsedQuantity);
    reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} scrollable={false}>
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
