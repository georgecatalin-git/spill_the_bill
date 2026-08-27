import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { setBillReceiptPath } from '@/lib/services/bill-service';
import { supabase } from '@/lib/supabase';

/**
 * The receipt photo: kept with the bill, readable by everyone at the table.
 *
 * Uploading goes straight to Supabase Storage — the admin's own session is
 * what the bucket's rules check. Reading goes through the `receipt-url` Edge
 * Function instead, because the bucket is private and guests have no account
 * for a storage rule to check; the function resolves their session token and
 * mints a link that expires.
 */

export class ReceiptPhotoError extends Error {}

/**
 * Stored a little smaller than the copy sent to Claude. This one is for a
 * person squinting at a line item on a phone, not for a model reading every
 * character, and the difference is a much lighter download later.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

const BUCKET = 'receipts';

/** Turns a photo into the bytes Storage wants, without pulling in a decoder. */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) / 4);

  let byte = 0;
  let bits = 0;
  let out = 0;

  for (const character of clean) {
    const value = BASE64_ALPHABET.indexOf(character);
    if (value === -1) continue;

    byte = (byte << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (byte >> bits) & 0xff;
    }
  }

  return bytes.subarray(0, out);
}

async function toJpegBytes(imageUri: string) {
  // One render to learn the orientation: `resize` keeps the ratio from
  // whichever single dimension it is given, so which one is longer matters.
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
    throw new ReceiptPhotoError('Could not prepare that photo.');
  }

  return base64ToBytes(saved.base64);
}

/**
 * Uploads the photo and returns its object path.
 *
 * The path starts with the bill id because that is what the bucket's rules
 * read to decide whose receipt this is — the folder is the permission.
 */
export async function uploadReceiptPhoto(billId: string, imageUri: string): Promise<string> {
  const bytes = await toJpegBytes(imageUri);
  const path = `${billId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new ReceiptPhotoError('Could not save the receipt photo.');
  }

  return path;
}

/**
 * Keeps the photo against a bill, replacing whatever was there.
 *
 * Called only once the lines are committed, so an abandoned scan leaves nothing
 * behind. Both paths that commit lines — the plain scan and the reconciliation
 * — need exactly this, and the second was written by copying the first, which
 * is how the two would have drifted.
 */
export async function keepReceiptPhoto(billId: string, imageUri: string) {
  const path = await uploadReceiptPhoto(billId, imageUri);
  const replaced = await setBillReceiptPath(billId, path);
  if (replaced) await deleteReceiptPhoto(replaced);
}

/** Removes a stored photo. Used when replacing one, so nothing is orphaned. */
export async function deleteReceiptPhoto(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  // A photo that is already gone is the state we wanted; only real failures
  // are worth surfacing.
  if (error && !error.message.toLowerCase().includes('not found')) {
    throw new ReceiptPhotoError('Could not remove the old receipt photo.');
  }
}

/**
 * A link the device can actually load, valid for a few minutes.
 *
 * Returns null when the table has no photo — an ordinary answer, not an error.
 */
export async function getReceiptPhotoUrl(
  params: { sessionToken: string } | { billId: string }
): Promise<string | null> {
  const body =
    'sessionToken' in params
      ? { session_token: params.sessionToken }
      : { bill_id: params.billId };

  const { data, error } = await supabase.functions.invoke<{ url: string | null }>(
    'receipt-url',
    { body }
  );

  if (error) {
    throw new ReceiptPhotoError(await messageFrom(error));
  }

  return data?.url ?? null;
}

/** Pulls the server's own sentence out of a failed invocation. */
async function messageFrom(error: unknown) {
  const context = (error as { context?: unknown }).context;

  if (context instanceof Response) {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string' && body.error) return body.error;
    } catch {
      // Not JSON — fall through.
    }
  }

  if (error instanceof Error && error.message.toLowerCase().includes('failed to fetch')) {
    return 'No connection. Check your internet and try again.';
  }

  return 'Could not open the receipt photo.';
}
