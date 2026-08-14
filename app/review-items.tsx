import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EditableItemRow } from '@/components/bill/editable-item-row';
import { ItemFormModal } from '@/components/bill/item-form-modal';
import { ReceiptSummary } from '@/components/bill/receipt-summary';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useReceiptScan } from '@/hooks/use-receipt-scan';
import { useThemeColor } from '@/hooks/use-theme-color';
import { createBillItem } from '@/lib/bill';
import { toCents } from '@/lib/money';
import { billTotalCents } from '@/lib/split';
import { toBillItems } from '@/lib/receipt';
import type { BillItem } from '@/lib/types';
import { getOrCreateActiveBill, setBillReceiptPath } from '@/lib/services/bill-service';
import { createBillItem as createRemoteItem } from '@/lib/services/bill-item-service';
import { deleteReceiptPhoto, uploadReceiptPhoto } from '@/lib/services/receipt-photo-service';

/** Admin view: verify and correct what was detected before adding it to the bill. */
export default function ReviewItemsScreen() {
  const { uri, tableId } = useLocalSearchParams<{ uri: string; tableId?: string }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { state, retry } = useReceiptScan(uri);

  const [items, setItems] = useState<BillItem[]>([]);
  const [editingItem, setEditingItem] = useState<BillItem | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const border = useThemeColor({}, 'border');

  useEffect(() => {
    if (state.status === 'ready') {
      setItems(toBillItems(state.receipt));
    }
  }, [state]);

  function handleRemove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function handleSaveEdit(name: string, unitPriceCents: number, quantity: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === editingItem?.id ? { ...item, name: name.trim(), unitPriceCents, quantity } : item
      )
    );
    setEditingItem(null);
  }

  function handleAdd(name: string, unitPriceCents: number, quantity: number) {
    setItems((current) => [...current, createBillItem(name, unitPriceCents, quantity)]);
    setAddingItem(false);
  }

  /** Writes the reviewed lines onto the table's open bill. */
  async function handleConfirm() {
    if (!tableId) {
      setSaveError('This scan is not attached to a table.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const bill = await getOrCreateActiveBill(tableId);

      for (const item of items) {
        await createRemoteItem(bill.id, {
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
        });
      }

      // Kept only now that the lines are committed, so an abandoned scan does
      // not leave a photo behind. A failure here must not lose the items the
      // admin just confirmed — the receipt is evidence, not the bill itself.
      if (uri) {
        try {
          const path = await uploadReceiptPhoto(bill.id, uri);
          const replaced = await setBillReceiptPath(bill.id, path);
          if (replaced) await deleteReceiptPhoto(replaced);
        } catch (photoError) {
          console.warn('Could not keep the receipt photo:', photoError);
          setSaveError('The items were added, but the receipt photo could not be kept.');
        }
      }

      router.dismissTo({ pathname: '/bill', params: { tableId } });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not add the items.');
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator />
          <ThemedText type="secondary">Reading the receipt…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (state.status === 'error') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.errorArea} edges={['bottom']}>
          <ScreenHeader title="Review Items" />
          <EmptyState
            message={state.message}
            hint="Try again, or go back and take a clearer photo."
          />
          <Button label="Try again" variant="secondary" onPress={retry} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const { receipt } = state;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="Review Items"
            subtitle="Check the detected items before adding them."
          />

          {items.length === 0 ? (
            <EmptyState
              message="No items left"
              hint="Add the items by hand, or go back and scan again."
            />
          ) : (
            <View style={styles.section}>
              <ThemedText type="label" style={styles.sectionLabel}>
                Detected · {items.length}
              </ThemedText>

              <View>
                {items.map((item, index) => (
                  <View
                    key={item.id}
                    style={[index > 0 && styles.divider, index > 0 && { borderTopColor: border }]}>
                    <EditableItemRow
                      item={item}
                      onEdit={() => setEditingItem(item)}
                      onRemove={() => handleRemove(item.id)}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}

          <Button
            label="Add missing item"
            variant="secondary"
            onPress={() => setAddingItem(true)}
          />

          {items.length > 0 && (
            <ReceiptSummary
              detectedTotalCents={toCents(receipt.total)}
              itemsTotalCents={billTotalCents(items)}
              currency={receipt.currency}
            />
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={saving ? 'Adding items…' : 'Add Items to Bill'}
            onPress={handleConfirm}
            disabled={items.length === 0 || saving}
          />
          {saveError && (
            <ThemedText type="secondary" style={styles.saveError}>
              {saveError}
            </ThemedText>
          )}
        </View>
      </SafeAreaView>

      {editingItem && (
        <ItemFormModal
          key={editingItem.id}
          visible
          title="Edit item"
          submitLabel="Save item"
          initialName={editingItem.name}
          initialPriceCents={editingItem.unitPriceCents}
          initialQuantity={editingItem.quantity}
          onSubmit={handleSaveEdit}
          onClose={() => setEditingItem(null)}
        />
      )}

      <ItemFormModal
        visible={addingItem}
        title="Add missing item"
        onSubmit={handleAdd}
        onClose={() => setAddingItem(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  errorArea: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    opacity: 0.6,
  },
  divider: {
    borderTopWidth: 1,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  saveError: {
    fontSize: 13,
    lineHeight: 18,
  },
});
