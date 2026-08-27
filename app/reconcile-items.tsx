import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReconcileGroupCard } from '@/components/bill/reconcile-group-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCents } from '@/lib/money';
import { reconcile, type DecisionId, type ReceiptLine, type Reconciliation } from '@/lib/reconcile';
import { keepReceiptPhoto } from '@/lib/services/receipt-photo-service';
import { applyReconciliation, getTabLines } from '@/lib/services/reconcile-service';

/**
 * The receipt against the running tab.
 *
 * Reached only when the bill already has items. A table that noted nothing goes
 * straight from the scan to the bill as it always did — there is nothing to
 * compare, and a diff screen showing every line as "new" would be a step that
 * asks a question with one answer.
 *
 * Every figure here is read from the tab and the paper; nothing on this screen
 * decides money. Answers become ordinary item writes when Apply is pressed, and
 * Postgres recomputes the totals from those.
 */

/** The reviewed lines arrive through the router, which only carries strings. */
function parseLines(raw: string | undefined): ReceiptLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReceiptLine[]) : [];
  } catch {
    return [];
  }
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: Reconciliation };

export default function ReconcileItemsScreen() {
  const { tableId, billId, uri, lines, currency, printedTotal } = useLocalSearchParams<{
    tableId?: string;
    billId?: string;
    uri?: string;
    lines?: string;
    currency?: string;
    printedTotal?: string;
  }>();

  const [state, setState] = useState<State>({ status: 'loading' });
  const [answers, setAnswers] = useState<Record<string, DecisionId>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const border = useThemeColor({}, 'border');
  const warning = useThemeColor({}, 'warning');

  const load = useCallback(async () => {
    if (!billId) {
      setState({ status: 'error', message: 'This scan is not attached to a bill.' });
      return;
    }

    setState({ status: 'loading' });

    try {
      const tab = await getTabLines(billId);
      const result = reconcile(tab, parseLines(lines), {
        printedTotalCents: printedTotal ? Number(printedTotal) : null,
      });

      setState({ status: 'ready', result });
      setAnswers(
        Object.fromEntries(result.groups.map((group) => [group.key, group.defaultDecision]))
      );
    } catch (caught) {
      setState({
        status: 'error',
        message: caught instanceof Error ? caught.message : 'Could not read the tab.',
      });
    }
  }, [billId, lines, printedTotal]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApply() {
    if (state.status !== 'ready' || !billId) return;

    setApplying(true);
    setApplyError(null);

    try {
      await applyReconciliation(
        billId,
        state.result.groups.map((group) => ({
          group,
          decision: answers[group.key] ?? group.defaultDecision,
        }))
      );

      // Kept only now the writes are through, so an abandoned reconciliation
      // leaves no photo behind. A failure here must not lose the lines that
      // were just settled — the receipt is evidence, not the bill itself.
      if (uri) {
        try {
          await keepReceiptPhoto(billId, uri);
        } catch (photoError) {
          console.warn('Could not keep the receipt photo:', photoError);
          setApplyError('The bill was updated, but the receipt photo could not be kept.');
        }
      }

      router.dismissTo({ pathname: '/bill', params: { tableId } });
    } catch (caught) {
      setApplyError(caught instanceof Error ? caught.message : 'Could not update the bill.');
    } finally {
      setApplying(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator />
          <ThemedText type="secondary">Comparing with the tab…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (state.status === 'error') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.errorArea} edges={['bottom']}>
          <ScreenHeader title="Receipt vs. tab" />
          <EmptyState message={state.message} hint="Go back and try again." />
          <Button label="Try again" variant="secondary" onPress={load} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const { result } = state;
  const toAnswer = result.groups.filter((group) => group.needsAnswer);
  const settled = result.groups.filter((group) => !group.needsAnswer);
  const undecided = toAnswer.filter((group) => (answers[group.key] ?? group.defaultDecision) === 'match_by_hand');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="Receipt vs. tab"
            subtitle="What the paper says, next to what was noted during the meal."
          />

          <View style={[styles.totals, { borderColor: border }]}>
            <View style={styles.totalRow}>
              <ThemedText type="secondary">On the tab</ThemedText>
              <ThemedText style={styles.totalValue}>
                {formatCents(result.tabTotalCents, currency)}
              </ThemedText>
            </View>
            <View style={styles.totalRow}>
              <ThemedText type="secondary">On the receipt</ThemedText>
              <ThemedText style={styles.totalValue}>
                {formatCents(result.receiptTotalCents, currency)}
              </ThemedText>
            </View>
            {result.chargesTotalCents !== 0 && (
              <View style={styles.totalRow}>
                <ThemedText type="secondary">Service, tip and the rest</ThemedText>
                <ThemedText style={styles.totalValue}>
                  {formatCents(result.chargesTotalCents, currency)}
                </ThemedText>
              </View>
            )}
          </View>

          {toAnswer.length === 0 ? (
            <EmptyState
              message="The receipt and the tab agree"
              hint="Nothing to decide. Keep the receipt and carry on."
            />
          ) : (
            <View style={styles.section}>
              <ThemedText type="label" style={styles.sectionLabel}>
                To decide · {toAnswer.length}
              </ThemedText>
              {toAnswer.map((group) => (
                <ReconcileGroupCard
                  key={group.key}
                  group={group}
                  currency={currency}
                  decision={answers[group.key] ?? group.defaultDecision}
                  onDecide={(decision) =>
                    setAnswers((current) => ({ ...current, [group.key]: decision }))
                  }
                />
              ))}
            </View>
          )}

          {settled.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="label" style={styles.sectionLabel}>
                Already agree · {settled.length}
              </ThemedText>
              {settled.map((group) => (
                <ReconcileGroupCard
                  key={group.key}
                  group={group}
                  currency={currency}
                  decision={answers[group.key] ?? group.defaultDecision}
                  onDecide={() => {}}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {undecided.length > 0 && (
            <ThemedText type="secondary" style={[styles.pending, { color: warning }]}>
              {undecided.length === 1
                ? 'One of these still needs you.'
                : `${undecided.length} of these still need you.`}
            </ThemedText>
          )}

          <Button
            label={applying ? 'Updating the bill…' : 'Apply to the bill'}
            onPress={handleApply}
            disabled={applying || undecided.length > 0}
          />

          {applyError && (
            <ThemedText type="secondary" style={styles.applyError}>
              {applyError}
            </ThemedText>
          )}
        </View>
      </SafeAreaView>
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
  totals: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  totalValue: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    opacity: 0.6,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  pending: {
    fontSize: 13,
    lineHeight: 18,
  },
  applyError: {
    fontSize: 13,
    lineHeight: 18,
  },
});
