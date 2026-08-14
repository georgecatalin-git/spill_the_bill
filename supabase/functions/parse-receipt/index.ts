// Reads a photo of a receipt and returns its lines as structured data.
//
// This runs on the server for one reason: the Anthropic API key. Anything in
// the Expo bundle is extractable — an `EXPO_PUBLIC_` variable is shipped to the
// device in plain text — so a key placed there is a key anyone can spend. It
// lives here as a Supabase secret instead, and the device never sees it.
//
// The app talks to this function, this function talks to Anthropic.

import Anthropic from 'npm:@anthropic-ai/sdk@^0.117.1';
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';

/**
 * The shape the model must return, enforced by the API rather than hoped for.
 *
 * Deliberately no `minimum` on the numbers: structured outputs reject
 * numerical constraints, so the values are checked below instead of pretending
 * the schema did it.
 */
const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'integer' },
          unit_price: { type: 'number' },
        },
        required: ['name', 'quantity', 'unit_price'],
        additionalProperties: false,
      },
    },
    total: { type: 'number' },
    currency: {
      type: 'string',
      enum: ['EUR', 'RON', 'GBP', 'PLN', 'CHF', 'USD'],
    },
  },
  required: ['items', 'total', 'currency'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You read photographs of restaurant receipts and return what is printed on them.

Return one entry per consumed line item, in the order they appear.

Prices: return the price of a SINGLE unit. Receipts usually print the line
total, so divide by the quantity when they do — "3 Cola 7.50" is quantity 3 at
a unit price of 2.50. If a line total does not divide evenly, give the closest
unit price; the person reviewing this will see both figures and can correct it.

Quantity: the printed count, or 1 when none is printed.

Names: keep them as printed, abbreviations included. Do not translate, expand
or tidy them — the person reviewing knows what they ordered, and an invented
name is worse than a terse one.

Skip everything that is not something someone ate or drank: subtotals, tax and
VAT lines, service charges, tips, discounts, loyalty points, table and cover
numbers, payment method, amount tendered, change, and any closing message.

total: the grand total printed on the receipt — the figure the customer pays,
including tax and service. Not the sum of the item lines.

currency: infer it from the symbol or code on the receipt. If nothing on the
receipt indicates one, use EUR.

Read only what is there. If a line is illegible, leave it out rather than
guessing at it — a missing line is obvious to the reviewer, an invented one is
not.`;

/** Claude's high-resolution tier tops out here; a larger image gains nothing. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ParsedItem = { name: string; quantity: number; unit_price: number };
type ParsedReceipt = { items: ParsedItem[]; total: number; currency: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Only the table's own admin scans receipts.
 *
 * `verify_jwt` alone is not enough: the publishable key is itself a valid JWT,
 * so it would let any guest — or anyone holding the key — spend the API budget.
 * This asks for a real signed-in user.
 */
async function requireSignedInUser(authorization: string | null) {
  if (!authorization) return null;

  // Either key works here — this client only forwards the caller's own token to
  // `getUser`. Both names are read because a project on the newer
  // publishable/secret keys may have the legacy anon key switched off.
  const publicKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

  if (!publicKey) {
    throw new Error('Neither SUPABASE_PUBLISHABLE_KEY nor SUPABASE_ANON_KEY is set.');
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', publicKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Rejects a reply that is the right shape but not usable as money. */
function validate(receipt: ParsedReceipt) {
  if (!Array.isArray(receipt.items)) {
    throw new Error('The receipt reader returned no items.');
  }

  for (const item of receipt.items) {
    if (!item.name.trim()) {
      throw new Error('The receipt reader returned an unnamed item.');
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error(`Invalid quantity for "${item.name}".`);
    }
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) {
      throw new Error(`Invalid price for "${item.name}".`);
    }
  }

  if (!Number.isFinite(receipt.total) || receipt.total < 0) {
    throw new Error('The receipt reader returned an invalid total.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // No quiet stand-in: a missing configuration says so.
    console.error('ANTHROPIC_API_KEY is not set on this project.');
    return json({ error: 'Receipt scanning is not configured on this server.' }, 503);
  }

  let user;
  try {
    user = await requireSignedInUser(req.headers.get('Authorization'));
  } catch (error) {
    // A missing platform key is a misconfiguration, not a rejected caller —
    // saying so beats a 401 that sends the admin looking at their own login.
    console.error('parse-receipt could not check the caller:', error);
    return json({ error: 'Receipt scanning is not configured on this server.' }, 503);
  }

  if (!user) {
    return json({ error: 'Only a signed-in admin can scan a receipt.' }, 401);
  }

  let imageBase64: string;
  let mediaType: string;

  try {
    const body = await req.json();
    imageBase64 = String(body.image_base64 ?? '');
    mediaType = String(body.media_type ?? 'image/jpeg');
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  if (!imageBase64) {
    return json({ error: 'No photo was sent.' }, 400);
  }

  // base64 carries 3 bytes per 4 characters.
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return json({ error: 'That photo is too large. Please retake it.' }, 413);
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      // Thinking is on by default on this model and `max_tokens` caps thinking
      // and answer together, so this leaves room for both on a long receipt.
      max_tokens: 8000,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            { type: 'text', text: 'Read this receipt.' },
          ],
        },
      ],
    });

    // Checked before reading content: a refusal returns HTTP 200 with nothing
    // useful in `content`, so indexing into it first would throw on undefined.
    if (message.stop_reason === 'refusal') {
      console.error('Refused:', message.stop_details);
      return json({ error: 'This photo could not be read. Try another one.' }, 422);
    }

    if (message.stop_reason === 'max_tokens') {
      return json({ error: 'That receipt is too long to read in one go.' }, 422);
    }

    const text = message.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') {
      throw new Error('The receipt reader returned nothing to read.');
    }

    const receipt = JSON.parse(text.text) as ParsedReceipt;
    validate(receipt);

    return json(receipt);
  } catch (error) {
    // The message is logged for the developer and generalised for the guest:
    // an API error can carry request details that are nobody else's business.
    console.error('parse-receipt failed:', error);

    const message = error instanceof Error ? error.message : '';
    const isOurValidation = message.startsWith('Invalid') || message.startsWith('The receipt reader');

    return json(
      { error: isOurValidation ? message : 'Could not read this receipt. Please try again.' },
      502
    );
  }
});
