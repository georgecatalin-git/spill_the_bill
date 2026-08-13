import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { TextField } from '@/components/ui/text-field';
import { CURRENCY_OPTIONS } from '@/lib/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { centsToInput, formatCents, parseMoneyToCents } from '@/lib/money';
import type { BillTotalsInput } from '@/lib/services/bill-service';

/** The rates people actually leave, as offered by most Romanian receipts. */
const TIP_PERCENTAGES = [5, 10, 15] as const;

type BillTotalsModalProps = {
  visible: boolean;
  /** Items only. The tip percentages are worked out from this plus tax and service. */
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  tipCents: number;
  confirmedTotalCents: number | null;
  currency?: string;
  onSubmit: (input: BillTotalsInput) => void;
  onClose: () => void;
};

/**
 * Editor for the parts of a receipt that are not items.
 *
 * The confirmed total is optional on purpose: leaving it empty means "add it
 * up for me", filling it in means "the paper says this, use it".
 */
export function BillTotalsModal({
  visible,
  subtotalCents,
  taxCents,
  serviceChargeCents,
  tipCents,
  confirmedTotalCents,
  currency,
  onSubmit,
  onClose,
}: BillTotalsModalProps) {
  const [tax, setTax] = useState(centsToInput(taxCents));
  const [service, setService] = useState(centsToInput(serviceChargeCents));
  const [tip, setTip] = useState(centsToInput(tipCents));
  const [confirmed, setConfirmed] = useState(centsToInput(confirmedTotalCents));
  const [selectedCurrency, setSelectedCurrency] = useState(currency ?? 'EUR');

  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const accent = useThemeColor({}, 'accent');
  const accentText = useThemeColor({}, 'accentText');
  const warning = useThemeColor({}, 'warning');

  // Blank means zero for the extras, and "no override" for the confirmed total.
  const parsedTax = tax.trim() === '' ? 0 : parseMoneyToCents(tax);
  const parsedService = service.trim() === '' ? 0 : parseMoneyToCents(service);
  const parsedTip = tip.trim() === '' ? 0 : parseMoneyToCents(tip);
  const parsedConfirmed = confirmed.trim() === '' ? null : parseMoneyToCents(confirmed);

  /**
   * A tip is left on the bill as it stands before the tip itself — the items
   * plus whatever tax and service the restaurant added. Typing a different tax
   * immediately changes what each percentage works out to.
   */
  const tipBaseCents = subtotalCents + (parsedTax ?? 0) + (parsedService ?? 0);
  const tipFor = (percentage: number) => Math.round((tipBaseCents * percentage) / 100);

  const invalid =
    parsedTax === null ||
    parsedService === null ||
    parsedTip === null ||
    (confirmed.trim() !== '' && parsedConfirmed === null);

  function handleSubmit() {
    if (invalid) return;

    onSubmit({
      taxCents: parsedTax as number,
      serviceChargeCents: parsedService as number,
      tipCents: parsedTip as number,
      confirmedTotalCents: parsedConfirmed,
      currency: selectedCurrency,
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
<ThemedText type="subtitle" style={styles.title}>
        Receipt totals
      </ThemedText>

      <View style={styles.field}>
        <ThemedText type="label" style={styles.fieldLabel}>
          Currency
        </ThemedText>
        <Dropdown
          value={selectedCurrency}
          onChange={setSelectedCurrency}
          options={CURRENCY_OPTIONS.map((option) => ({
            value: option.code,
            label: `${option.symbol}  ${option.code}`,
            hint: option.label,
          }))}
        />
        <ThemedText type="secondary" style={styles.hint}>
          Prices are shown in this currency. Changing it relabels the amounts, it does not
          convert them.
        </ThemedText>
      </View>

      <View style={styles.row}>
        <View style={styles.halfField}>
          <ThemedText type="label" style={styles.fieldLabel}>
            Tax
          </ThemedText>
          <TextField
            value={tax}
            onChangeText={setTax}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.halfField}>
          <ThemedText type="label" style={styles.fieldLabel}>
            Service
          </ThemedText>
          <TextField
            value={service}
            onChangeText={setService}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.field}>
        <ThemedText type="label" style={styles.fieldLabel}>
          Tip
        </ThemedText>

        <View style={styles.tipRow}>
          <Pressable
            onPress={() => setTip('')}
            style={[
              styles.tipPill,
              { borderColor: border },
              parsedTip === 0 && { backgroundColor: accent, borderColor: accent },
            ]}>
            <ThemedText
              style={[styles.tipPillLabel, parsedTip === 0 && { color: accentText }]}>
              None
            </ThemedText>
          </Pressable>

          {TIP_PERCENTAGES.map((percentage) => {
            const amount = tipFor(percentage);
            const selected = parsedTip !== null && parsedTip !== 0 && parsedTip === amount;

            return (
              <Pressable
                key={percentage}
                onPress={() => setTip(centsToInput(amount))}
                style={[
                  styles.tipPill,
                  { backgroundColor: surface, borderColor: border },
                  selected && { backgroundColor: accent, borderColor: accent },
                ]}>
                <ThemedText
                  style={[styles.tipPillLabel, selected && { color: accentText }]}>
                  {percentage}%
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <TextField
          value={tip}
          onChangeText={setTip}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        <ThemedText type="secondary" style={styles.hint}>
          Percentages are of {formatCents(tipBaseCents, selectedCurrency)} — the bill before
          the tip. You can also type any amount.
        </ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText type="label" style={styles.fieldLabel}>
          Confirmed receipt total (optional)
        </ThemedText>
        <TextField
          value={confirmed}
          onChangeText={setConfirmed}
          placeholder="Leave empty to add it up"
          keyboardType="decimal-pad"
        />
        <ThemedText type="secondary" style={styles.hint}>
          Set this when the paper receipt shows a different total, for example after a
          discount or rounding.
        </ThemedText>
      </View>

      {invalid && (
        <ThemedText type="secondary" style={{ color: warning }}>
          Please enter valid amounts.
        </ThemedText>
      )}

      <View style={styles.actions}>
        <Button label="Save totals" onPress={handleSubmit} disabled={invalid} />
        <Button label="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    lineHeight: 26,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  field: {
    gap: Spacing.sm,
  },
  /** Half-width field, for the two that share a row. */
  halfField: {
    flex: 1,
    gap: Spacing.sm,
  },
  fieldLabel: {
    opacity: 0.6,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  tipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tipPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
  },
  tipPillLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
