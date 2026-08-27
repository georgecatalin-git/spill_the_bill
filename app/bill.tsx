import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillSummaryCard } from '@/components/bill/bill-summary-card';
import { BillTotals } from '@/components/bill/bill-totals';
import { BillTotalsModal } from '@/components/bill/bill-totals-modal';
import { EditableItemRow } from '@/components/bill/editable-item-row';
import { EvenSplit } from '@/components/bill/even-split';
import { ItemFormModal } from '@/components/bill/item-form-modal';
import { MyTotal } from '@/components/bill/my-total';
import { ReceiptItemRow } from '@/components/bill/receipt-item-row';
import { TipSplit } from '@/components/bill/tip-split';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ConnectionIndicator } from '@/components/ui/connection-status';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useAdminBill } from '@/hooks/use-admin-bill';
import { useGuestBill } from '@/hooks/use-guest-bill';
import { useThemeColor } from '@/hooks/use-theme-color';
import { confirmAction } from '@/lib/confirm';
import { formatCents } from '@/lib/money';
import type { BillItem as DbBillItem } from '@/lib/database';
import type { BillItem } from '@/lib/types';
import { useGuest } from '@/providers/guest-provider';

/** Maps a database row onto the shape the shared row components expect. */
function toLocalItem(row: DbBillItem): BillItem {
  return {
    id: row.id,
    name: row.name,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
  };
}

export default function BillScreen() {
  const { tableId } = useLocalSearchParams<{ tableId?: string }>();
  const { session } = useGuest();

  // A guest session wins: that device is at the table as a guest, not an admin.
  if (session) {
    return <GuestBillScreen sessionToken={session.sessionToken} />;
  }

  if (tableId) {
    return <AdminBillScreen tableId={tableId} />;
  }

  // Reached only by opening /bill directly, with nothing to show.
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.content}>
          <ScreenHeader title="No bill open" />
          <EmptyState
            message="Pick a table first."
            hint="Open one of your tables and start its bill."
          />
          <Button label="Go to my tables" onPress={() => router.replace('/dashboard')} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/** The shared receipt, as a guest sees it. Every figure comes from the server. */
function GuestBillScreen({ sessionToken }: { sessionToken: string }) {
  const bill = useGuestBill(sessionToken);
  const border = useThemeColor({}, 'border');
  const warning = useThemeColor({}, 'warning');

  const currency = bill.summary?.currency ?? 'EUR';

  // "Closed" means COMPLETED, nothing else. FULLY_ASSIGNED used to count as
  // locked here, which contradicted the database — it deliberately still lets
  // a guest lower or clear their own claim, so nobody is stranded on a bill
  // they can no longer change. An evenly split bill reaches FULLY_ASSIGNED the
  // moment it opens, which made every guest read "This bill is closed."
  const completed = bill.summary?.status === 'COMPLETED';
  const notStarted = bill.summary?.status === 'DRAFT';

  // Nothing to claim on an even split, and nothing to claim before the bill
  // is open or after it is closed.
  const locked = completed || notStarted || bill.splitEvenly;

  if (bill.loading && bill.items.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator />
          <ThemedText type="secondary">Loading the bill…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="Restaurant Bill"
            subtitle={
              completed
                ? 'This bill is closed.'
                : notStarted
                  ? 'Waiting for the receipt to be added.'
                  : bill.splitEvenly
                    ? 'Everyone pays the same share.'
                    : 'Tap + Add on everything you had.'
            }
          />

          <ConnectionIndicator status={bill.connectionStatus} />

          {bill.summary && (
            <BillTotals
              totalCents={bill.summary.billTotalCents}
              assignedCents={bill.summary.assignedTotalCents}
              remainingCents={bill.summary.remainingTotalCents}
              tipCents={bill.tipShares.reduce((sum, share) => sum + share.tip_share_cents, 0)}
              fullyAssigned={bill.summary.status === 'FULLY_ASSIGNED'}
              currency={currency}
            />
          )}

          {bill.error && (
            <ThemedText type="secondary" style={{ color: warning }}>
              {bill.error}
            </ThemedText>
          )}

          {bill.localItems.length === 0 ? (
            <EmptyState
              message="No items yet"
              hint="Waiting for the receipt to be added."
            />
          ) : (
            <View>
              {bill.localItems.map((item, index) => (
                <View
                  key={item.id}
                  style={[index > 0 && styles.divider, index > 0 && { borderTopColor: border }]}>
                  <ReceiptItemRow
                    item={item}
                    claims={bill.claims}
                    amounts={bill.amounts[item.id]}
                    participants={bill.participants}
                    currentParticipantId={bill.myParticipantId}
                    currency={currency}
                    // On an even split there is nothing to claim, so the rows
                    // become a plain reading of the receipt.
                    locked={locked || bill.splitEvenly}
                    onClaim={() => bill.claim(item.id)}
                    onRelease={() => bill.release(item.id)}
                  />
                </View>
              ))}
            </View>
          )}

          <MyTotal
            totalCents={bill.myTotalCents}
            breakdown={
              bill.splitEvenly
                ? []
                : bill.items
                    .filter((item) => item.my_quantity > 0)
                    .map((item) => ({
                      item: {
                        id: item.id,
                        name: item.name,
                        unitPriceCents: item.unit_price_cents,
                        quantity: item.quantity,
                      },
                      shares: item.my_quantity,
                      amountCents: item.my_amount_cents,
                    }))
            }
            tipCents={bill.myTipCents}
            evenSplit={bill.splitEvenly}
            currency={currency}
          />

          <EvenSplit
            shares={bill.evenShares.map((share) => ({
              id: share.participant_id,
              name: share.participant_name,
              isMe: share.is_me,
              amountCents: share.share_cents,
            }))}
            currency={currency}
          />

          {/* The tip is already inside everyone's even share; showing it again
              would read as a second charge. */}
          {!bill.splitEvenly && (
            <TipSplit
              shares={bill.tipShares.map((share) => ({
                id: share.participant_id,
                name: share.participant_name,
                isMe: share.is_me,
                amountCents: share.tip_share_cents,
              }))}
              currency={currency}
            />
          )}

          {/* Only offered when there is something behind it — a button that
              leads to "no photo was kept" is a button that wasted a tap. */}
          {bill.hasReceiptPhoto && (
            <Button
              label="See the receipt"
              variant="secondary"
              onPress={() => router.push('/receipt-photo')}
            />
          )}

          {/* The overview answers "what do I owe and who owes what", so it
              comes before the refresh nobody should need any more. */}
          <Button
            label="See everyone"
            variant="secondary"
            onPress={() => router.push('/table-overview')}
          />
          <Button label="Refresh" variant="secondary" onPress={bill.reload} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** The real thing: bill, items and totals all come from Supabase. */
function AdminBillScreen({ tableId }: { tableId: string }) {
  const bill = useAdminBill(tableId);
  const border = useThemeColor({}, 'border');
  const warning = useThemeColor({}, 'warning');

  const [addVisible, setAddVisible] = useState(false);
  const [totalsVisible, setTotalsVisible] = useState(false);
  const [editing, setEditing] = useState<DbBillItem | null>(null);
  const [editMode, setEditMode] = useState(false);

  const currency = bill.bill?.currency ?? 'EUR';
  const draft = bill.bill?.status === 'DRAFT';
  const completed = bill.bill?.status === 'COMPLETED';

  async function assignTo(itemId: string, participantId: string) {
    try {
      await bill.assignOne(itemId, participantId);
    } catch (caught) {
      Alert.alert(
        'Could not assign',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    }
  }

  async function confirmSplitRest(item: DbBillItem) {
    const claimed = Object.values(bill.claims[item.id] ?? {}).reduce((a, b) => a + b, 0);
    const left = item.quantity - claimed;
    const people = bill.participants.length;

    // The figure is the whole point of the confirmation: nobody agrees to
    // "share it" in the abstract, everybody agrees to 5.17 each.
    const each = Math.round((left * item.unit_price_cents) / people);

    const ok = await confirmAction({
      title: `Share ${left} between the ${people} of you?`,
      message: `Nobody claimed ${left} × ${item.name}. It becomes one shared line, and each of you pays ${formatCents(each, currency)}.`,
      confirmLabel: 'Share',
    });
    if (!ok) return;

    try {
      await bill.splitRestOfItem(item.id);
    } catch (caught) {
      Alert.alert(
        'Could not split',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    }
  }

  function confirmRemove(item: DbBillItem) {
    Alert.alert('Remove this item?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => bill.removeItem(item.id) },
    ]);
  }

  if (bill.loading && !bill.bill) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator />
          <ThemedText type="secondary">Loading the bill…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="Your Bill"
            subtitle={draft ? 'Add the items from your receipt.' : 'The bill is open to the table.'}
          />

          <ConnectionIndicator status={bill.connectionStatus} />

          {bill.error && (
            <ThemedText type="secondary" style={{ color: warning }}>
              {bill.error}
            </ThemedText>
          )}

          <View style={styles.section}>
            {bill.items.length > 0 && (
              <ThemedText type="label" style={styles.sectionLabel}>
                Items · {bill.items.length}
              </ThemedText>
            )}

            {bill.items.length === 0 ? (
              <EmptyState
                message="No items yet"
                hint="Add items manually or scan the receipt."
              />
            ) : (
              <View>
                {bill.items.map((item, index) => (
                  <View
                    key={item.id}
                    style={[index > 0 && styles.divider, index > 0 && { borderTopColor: border }]}>
                    {draft || editMode ? (
                      <EditableItemRow
                        item={toLocalItem(item)}
                        currency={currency}
                        onEdit={() => setEditing(item)}
                        onRemove={() => confirmRemove(item)}
                      />
                    ) : (
                      <ReceiptItemRow
                        item={toLocalItem(item)}
                        claims={bill.claims}
                        amounts={bill.amounts[item.id]}
                        participants={bill.participants}
                        currentParticipantId={bill.myParticipantId}
                        currency={currency}
                        locked={completed}
                        onClaim={() => bill.claim(item.id)}
                        onRelease={() => bill.release(item.id)}
                        onSplitRest={() => confirmSplitRest(item)}
                        splitCandidates={bill.participants.length}
                        onAssign={(participantId) => assignTo(item.id, participantId)}
                      />
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {!draft && !completed && (
            <Button
              label={editMode ? 'Done editing' : 'Edit items'}
              variant="secondary"
              onPress={() => setEditMode((current) => !current)}
            />
          )}

          {/* Offered from the draft onwards: deciding "we're splitting this
              evenly" usually happens before the receipt is shown to anyone,
              not after. Claims are kept either way, so this can be flipped
              back without losing anyone's selections. */}
          {!completed && (
            <Button
              label={bill.splitEvenly ? 'Go back to picking items' : 'Split evenly instead'}
              variant="secondary"
              onPress={() => bill.setSplitMode(bill.splitEvenly ? 'BY_ITEM' : 'EVENLY')}
            />
          )}

          {/* A settled bill is a record, not a working document. Until this
              screen resolved the closed bill the admin never landed here, so
              nothing stopped them editing it. */}
          {!completed && (
            <View style={styles.actions}>
              <Button label="Add Item" onPress={() => setAddVisible(true)} />
              <Button
                label="Scan Receipt"
                variant="secondary"
                onPress={() => router.push({ pathname: '/scan-receipt', params: { tableId } })}
              />
            </View>
          )}

          {!draft && (
            <MyTotal
              totalCents={bill.myTotalCents}
              breakdown={bill.splitEvenly ? [] : bill.myBreakdown}
              tipCents={bill.myTipCents}
              evenSplit={bill.splitEvenly}
              currency={currency}
            />
          )}

          {!draft && (
            <EvenSplit
              shares={bill.evenShares.map((share) => ({
                id: share.participant_id ?? '',
                name: share.name ?? '',
                isMe: share.participant_id === bill.myParticipantId,
                amountCents: share.share_cents ?? 0,
              }))}
              currency={currency}
            />
          )}

          {/* Already inside everyone's even share — showing it twice would
              read as a second charge. */}
          {!draft && !bill.splitEvenly && (
            <TipSplit
              shares={bill.tipShares.map((share) => ({
                id: share.participant_id ?? '',
                name: share.name ?? '',
                isMe: share.participant_id === bill.myParticipantId,
                amountCents: share.tip_share_cents ?? 0,
              }))}
              currency={currency}
            />
          )}

          {bill.bill && (
            <BillSummaryCard
              subtotalCents={bill.bill.subtotal_cents}
              taxCents={bill.bill.tax_cents}
              serviceChargeCents={bill.bill.service_charge_cents}
              tipCents={bill.bill.tip_cents}
              totalCents={bill.bill.total_cents}
              confirmedTotalCents={bill.bill.confirmed_total_cents}
              currency={currency}
            />
          )}

          {!completed && (
            <Button
              label="Edit tax, service & tip"
              variant="secondary"
              onPress={() => setTotalsVisible(true)}
            />
          )}

          {bill.bill?.receipt_path && (
            <Button
              label="See the receipt"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/receipt-photo',
                  params: { billId: bill.bill?.id },
                })
              }
            />
          )}

          <Button
            label="See everyone"
            variant="secondary"
            onPress={() => router.push({ pathname: '/table-overview', params: { tableId } })}
          />

          <Button label="Refresh" variant="secondary" onPress={bill.reload} />

          {draft && (
            <Button
              label="Start Bill"
              onPress={async () => {
                if (await bill.start()) {
                  Alert.alert('Bill started', 'Everyone at the table can now see it.');
                }
              }}
            />
          )}

          {!draft && !completed && (
            <>
              <Button
                label="Finish Bill"
                disabled={bill.blocker !== null}
                onPress={() =>
                  router.push({ pathname: '/finish-bill', params: { tableId } })
                }
              />
              {bill.blocker && (
                <ThemedText type="secondary" style={styles.blocker}>
                  {bill.blocker}
                </ThemedText>
              )}
            </>
          )}

          {completed && (
            <ThemedText type="secondary" style={styles.blocker}>
              This bill is closed.
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>

      <ItemFormModal
        visible={addVisible}
        people={bill.participants.map((person) => ({ id: person.id, name: person.name }))}
        onSubmit={async (name, unitPriceCents, quantity, forPersonId) => {
          setAddVisible(false);

          // One act, not two: a round ordered for George goes onto George.
          // Left on "Nobody yet" it behaves exactly as before, which is what
          // guests claiming for themselves still rely on.
          if (forPersonId) {
            await bill.addItemFor({ name, unitPriceCents, quantity }, forPersonId);
          } else {
            await bill.addItem({ name, unitPriceCents, quantity });
          }
        }}
        onClose={() => setAddVisible(false)}
      />

      {editing && (
        <ItemFormModal
          key={editing.id}
          visible
          title="Edit item"
          submitLabel="Save item"
          initialName={editing.name}
          initialPriceCents={editing.unit_price_cents}
          initialQuantity={editing.quantity}
          onSubmit={async (name, unitPriceCents, quantity) => {
            const target = editing;
            setEditing(null);
            await bill.editItem(target.id, { name, unitPriceCents, quantity });
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {bill.bill && (
        <BillTotalsModal
          visible={totalsVisible}
          subtotalCents={bill.bill.subtotal_cents}
          taxCents={bill.bill.tax_cents}
          serviceChargeCents={bill.bill.service_charge_cents}
          tipCents={bill.bill.tip_cents}
          confirmedTotalCents={bill.bill.confirmed_total_cents}
          currency={currency}
          onSubmit={async (input) => {
            setTotalsVisible(false);
            await bill.saveTotals(input);
          }}
          onClose={() => setTotalsVisible(false)}
        />
      )}
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
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.md,
  },
  sectionLabel: {
    opacity: 0.6,
  },
  divider: {
    borderTopWidth: 1,
  },
  actions: {
    gap: Spacing.sm,
  },
  blocker: {
    fontSize: 13,
    lineHeight: 18,
  },
});
