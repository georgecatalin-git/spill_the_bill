const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  RON: 'lei ',
  GBP: '£',
  PLN: 'zł ',
  CHF: 'CHF ',
  USD: '$',
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_SYMBOLS);

/** Money is stored as integer cents everywhere, so totals never drift. */
export function toCents(amount: number) {
  return Math.round(amount * 100);
}

export function formatCents(cents: number, currency = 'EUR') {
  return `${CURRENCY_SYMBOLS[currency] ?? `${currency} `}${(cents / 100).toFixed(2)}`;
}

/**
 * Reads a typed amount as integer cents.
 *
 * Accepts "30", "30.0", "30.00" and the comma form a European keypad produces.
 * Rejects anything that is not a plain non-negative number, so "abc", "-5" and
 * an empty box never reach the database. Zero is allowed: tax, service and tip
 * are legitimately zero, and a comped item is legitimately free.
 */
export function parseMoneyToCents(text: string) {
  const normalized = text.replace(',', '.').trim();

  if (!normalized || !/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);
  if (Number.isNaN(value) || value < 0) {
    return null;
  }

  return toCents(value);
}

/** Same as `parseMoneyToCents`, but rejects zero. Use for prices that must cost something. */
export function parsePriceToCents(text: string) {
  const cents = parseMoneyToCents(text);
  return cents === null || cents <= 0 ? null : cents;
}

/** Turns stored cents back into the text an input field shows. */
export function centsToInput(cents: number | null | undefined) {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
}

/**
 * Divides `totalCents` between claimants in proportion to their shares.
 *
 * Uses the largest-remainder method: every leftover cent is handed to the
 * claimant with the biggest fractional part, so the parts always add back up
 * to exactly `totalCents`.
 */
export function splitCents(totalCents: number, shares: Record<string, number>) {
  const entries = Object.entries(shares).filter(([, count]) => count > 0);
  const totalShares = entries.reduce((sum, [, count]) => sum + count, 0);

  if (totalShares === 0) return {};

  const amounts: Record<string, number> = {};
  const remainders: { id: string; remainder: number }[] = [];
  let allocated = 0;

  for (const [id, count] of entries) {
    const exact = (totalCents * count) / totalShares;
    const whole = Math.floor(exact);

    amounts[id] = whole;
    allocated += whole;
    remainders.push({ id, remainder: exact - whole });
  }

  remainders.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < totalCents - allocated; i++) {
    amounts[remainders[i % remainders.length].id] += 1;
  }

  return amounts;
}
