import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';
import type { ParsedReceipt, ReceiptParser } from '@/lib/receipt/types';

/**
 * Reads a receipt by sending the photo to the `parse-receipt` Edge Function.
 *
 * The Anthropic key stays on the server. Nothing here holds a credential — the
 * device sends a photo to our own function and gets lines back, and the
 * function is the only thing that can talk to Anthropic.
 */

export class ReceiptError extends Error {}

/**
 * Claude's high-resolution tier reads up to 2576 pixels on the long edge and
 * downsamples anything larger, so a phone's full 4000-pixel photo costs upload
 * time and buys nothing. Resizing to exactly that keeps every pixel the model
 * can actually use — going lower would start losing small print.
 */
const MAX_EDGE = 2576;

/** High enough that faded thermal print survives; low enough to upload fast. */
const JPEG_QUALITY = 0.8;

/** Shape the function returns. `unit_price` is spelled out for the model's sake. */
type RemoteReceipt = {
  items: { name: string; quantity: number; unit_price: number }[];
  total: number;
  currency: string;
};

async function toBase64Jpeg(imageUri: string) {
  // One render just to learn the orientation: `resize` preserves the ratio from
  // whichever single dimension it is given, so we have to know which is longer.
  const original = await ImageManipulator.manipulate(imageUri).renderAsync();
  const context = ImageManipulator.manipulate(original);

  if (Math.max(original.width, original.height) > MAX_EDGE) {
    context.resize(
      original.width >= original.height ? { width: MAX_EDGE } : { height: MAX_EDGE }
    );
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    base64: true,
    compress: JPEG_QUALITY,
  });

  if (!saved.base64) {
    throw new ReceiptError('Could not prepare that photo. Please try again.');
  }
  return saved.base64;
}

/**
 * Pulls the server's own message out of a failed invocation.
 *
 * `functions.invoke` hides the response body inside the error, and the body is
 * where the useful sentence lives — "Receipt scanning is not configured on this
 * server" is worth showing; "FunctionsHttpError" is not.
 */
async function messageFrom(error: unknown, fallback: string) {
  const context = (error as { context?: unknown }).context;

  if (context instanceof Response) {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string' && body.error) return body.error;
    } catch {
      // Not JSON — fall through to the generic message.
    }
  }

  if (error instanceof Error && error.message.toLowerCase().includes('failed to fetch')) {
    return 'No connection. Check your internet and try again.';
  }

  return fallback;
}

export const claudeReceiptParser: ReceiptParser = async (imageUri, tableId) => {
  const imageBase64 = await toBase64Jpeg(imageUri);

  const { data, error } = await supabase.functions.invoke<RemoteReceipt>('parse-receipt', {
    body: { image_base64: imageBase64, media_type: 'image/jpeg', table_id: tableId },
  });

  if (error) {
    throw new ReceiptError(await messageFrom(error, 'Could not read this receipt.'));
  }

  if (!data || !Array.isArray(data.items)) {
    throw new ReceiptError('Could not read this receipt.');
  }

  if (data.items.length === 0) {
    throw new ReceiptError('No items were found on that photo. Try a clearer one.');
  }

  const receipt: ParsedReceipt = {
    // `price` on this side of the boundary is the unit price, which is what the
    // function returns; only the name differs.
    items: data.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.unit_price,
    })),
    total: data.total,
    currency: data.currency,
  };

  return receipt;
};
