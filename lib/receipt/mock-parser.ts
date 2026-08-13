import type { ReceiptParser } from '@/lib/receipt/types';

/** Stands in for the round trip a real OCR/AI service would take. */
const SIMULATED_DELAY_MS = 900;

/** Returns the same sample receipt for any photo. */
export const mockReceiptParser: ReceiptParser = async () => {
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));

  return {
    items: [
      { name: 'Pizza Margherita', quantity: 1, price: 12.5 },
      { name: 'Pasta Carbonara', quantity: 1, price: 14.0 },
      { name: 'Coca Cola', quantity: 2, price: 3.0 },
      { name: 'Tiramisu', quantity: 1, price: 6.5 },
    ],
    total: 39.0,
    currency: 'EUR',
  };
};
