/** The currencies a bill can be kept in. */
export const CURRENCY_OPTIONS = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'RON', symbol: 'lei', label: 'Romanian Leu' },
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]['code'];

export function currencyLabel(code: string) {
  const match = CURRENCY_OPTIONS.find((option) => option.code === code);
  return match ? `${match.symbol} ${match.code}` : code;
}
