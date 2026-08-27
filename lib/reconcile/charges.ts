/**
 * Lines a receipt prints that are not something anybody ordered.
 *
 * They matter because adding them to `bill_items` would be wrong in two
 * directions at once: the service charge and the tip already have their own
 * columns on the bill and would be counted twice, while a discount cannot be
 * stored as an item at all — `bill_items.unit_price_cents` is checked `>= 0`,
 * on purpose, because an item that costs less than nothing is not a thing that
 * was eaten.
 *
 * Packaging is the one that surprises people and is the most Romanian: the SGR
 * deposit is 50 bani per bottle, printed as its own line, and it is real money
 * on the bill. It belongs on the split. It is only sorted here so it is
 * recognised rather than matched hopelessly against the drinks.
 */

export type ChargeKind = 'service' | 'tip' | 'packaging' | 'discount' | 'total_line';

const PATTERNS: { kind: ChargeKind; re: RegExp }[] = [
  { kind: 'total_line', re: /^(sub)?total|^total de plata|^tva\b|^numerar\b|^card\b|^rest\b|^casa\b|^bon fiscal/ },
  { kind: 'service', re: /taxa de serviciu|serviciu|service charge|\bservice\b|cover charge/ },
  { kind: 'tip', re: /bacsis|\btips?\b|gratuity/ },
  { kind: 'packaging', re: /ambalaj|\bsgr\b|garantie|packaging|deposit/ },
  { kind: 'discount', re: /discount|reducere|storno|voucher|bon valoric|gratuit/ },
];

/**
 * What kind of charge a line is, or null when it is an ordinary product.
 *
 * Matched on the folded name so "TAXĂ DE SERVICIU" and "taxa de serviciu" are
 * one thing. A negative amount is decisive on its own: whatever the line is
 * called, money coming off the bill is a discount.
 */
export function classifyCharge(foldedName: string, unitPriceCents: number): ChargeKind | null {
  if (unitPriceCents < 0) return 'discount';

  for (const { kind, re } of PATTERNS) {
    if (re.test(foldedName)) return kind;
  }

  return null;
}
