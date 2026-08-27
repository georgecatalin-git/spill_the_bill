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
    // Who printed this, and which piece of paper it is. Read so the server can
    // refuse a receipt from somewhere other than the session's restaurant, and
    // refuse the same receipt twice. Empty strings rather than nulls: a
    // nullable type is not something structured outputs promise to honour.
    merchant_tax_id: { type: 'string' },
    merchant_name: { type: 'string' },
    receipt_number: { type: 'string' },
    issued_at: { type: 'string' },
  },
  required: [
    'items',
    'total',
    'currency',
    'merchant_tax_id',
    'merchant_name',
    'receipt_number',
    'issued_at',
  ],
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

merchant_tax_id: the fiscal registration code of the business that printed
this receipt, from the header. On Romanian receipts it is labelled CUI, C.U.I.,
CIF or C.I.F., sometimes with an RO prefix. Copy the digits exactly as printed,
in order.

merchant_name: the business name as printed.

receipt_number: the fiscal receipt's own number, however it is labelled — "BON
FISCAL NR", "NR BON", "#". Digits and letters as printed.

issued_at: the date and time printed on the receipt, as ISO 8601
(2026-08-27T20:15:00). If only a date is printed, use midday. Romanian receipts
print day-first: 27-08-2026 is the 27th of August.

Use an empty string for any of these four when it is not printed or not
legible, and NEVER guess at one. They are compared against a record, and an
invented value refuses an honest customer or lets a dishonest one through.

Read only what is there. If a line is illegible, leave it out rather than
guessing at it — a missing line is obvious to the reviewer, an invented one is
not.`;

/** Claude's high-resolution tier tops out here; a larger image gains nothing. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Chosen by measurement, not by tier. On 30 generated receipts, Sonnet 5 read
 * 100% of items, quantities and prices on realistic photos with nothing
 * invented — the same as Opus 5, for half the cost. Effort made no difference
 * to accuracy and 41% difference to the bill, so it stays low.
 *
 * Haiku 4.5 was rejected: it invented items even on clean photos, and an
 * invented item lands on somebody's share where they cannot notice it.
 */
const MODEL = 'claude-sonnet-5';
const EFFORT = 'low' as const;

/**
 * Dollars per million tokens, so a scan can be costed at the moment it happens.
 *
 * Kept beside the model rather than in the database: the price belongs to the
 * model, and a stale figure here would quietly misreport every restaurant's
 * spend. Change both together.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

function getServiceKey(): string | undefined {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
}

/**
 * The restaurant this scan will be billed to, or null when the caller has no
 * business scanning for that table.
 *
 * Asked BEFORE the API call, not after. `table_id` used to be optional, and a
 * scan without one — or with a made-up uuid — ran, spent tokens, and then
 * vanished from the figures because `record_receipt_scan` had no restaurant to
 * attribute it to. Uncounted spending is the one thing the scan log exists to
 * make impossible, so a scan that cannot be attributed does not happen.
 */
async function resolveRestaurant(tableId: string, adminId: string): Promise<string | null> {
  const serviceKey = getServiceKey();
  if (!serviceKey) {
    console.error('No service key set; the scan cannot be attributed.');
    return null;
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const { data, error } = await admin.rpc('resolve_scan_restaurant', {
    p_table_id: tableId,
    p_admin_id: adminId,
  });

  if (error) {
    console.error('resolve_scan_restaurant failed:', error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Hands the receipt's own identity to Postgres, which decides whether it may
 * be used at all.
 *
 * Every check lives there: the restaurant is derived from the session, the
 * fiscal code is compared against it, the date is bounded, and a unique index
 * refuses a receipt that has already been split. Nothing here judges anything —
 * this function's only job is that the values arrive from the photo rather
 * than from the phone.
 *
 * Returns the refusal to be shown, or null when the receipt was accepted.
 */
async function attachReceipt(
  tableId: string,
  receipt: ParsedReceipt
): Promise<string | null> {
  const serviceKey = getServiceKey();
  if (!serviceKey) {
    console.error('No service key set; the receipt cannot be validated.');
    return 'Receipt checking is not configured on this server.';
  }

  const issuedAt = Date.parse(receipt.issued_at);

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const { error } = await admin.rpc('attach_receipt_to_bill', {
    p_table_id: tableId,
    p_receipt_tax_id: receipt.merchant_tax_id ?? '',
    p_receipt_number: receipt.receipt_number ?? '',
    p_receipt_issued_at: Number.isNaN(issuedAt)
      ? null
      : new Date(issuedAt).toISOString(),
    p_receipt_total_cents: Math.round((receipt.total ?? 0) * 100),
  });

  if (!error) return null;

  console.error('attach_receipt_to_bill refused:', error.message);
  return error.message;
}

/** Cost in millionths of a dollar — integer money, as everywhere else here. */
function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MTOK[model];
  if (!price) return 0;
  return Math.round(inputTokens * price.input + outputTokens * price.output);
}

/**
 * Writes the scan against the restaurant behind the table.
 *
 * Deliberately never throws: the admin is standing at a table waiting for their
 * receipt, and losing a bookkeeping row is a far smaller failure than losing
 * the scan they just paid for. Failures are logged for the developer instead.
 */
async function recordScan(params: {
  tableId: string;
  adminId: string;
  inputTokens: number;
  outputTokens: number;
  succeeded: boolean;
}) {
  const serviceKey = getServiceKey();
  if (!serviceKey) {
    console.error('No service key set; the scan was not recorded.');
    return;
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
    const { error } = await admin.rpc('record_receipt_scan', {
      p_table_id: params.tableId,
      p_admin_id: params.adminId,
      p_model: MODEL,
      p_input_tokens: params.inputTokens,
      p_output_tokens: params.outputTokens,
      p_cost_micros: costMicros(MODEL, params.inputTokens, params.outputTokens),
      p_succeeded: params.succeeded,
    });
    if (error) console.error('record_receipt_scan failed:', error.message);
  } catch (error) {
    console.error('record_receipt_scan threw:', error);
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ParsedItem = { name: string; quantity: number; unit_price: number };
type ParsedReceipt = {
  items: ParsedItem[];
  total: number;
  currency: string;
  merchant_tax_id: string;
  merchant_name: string;
  receipt_number: string;
  issued_at: string;
};

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
  // Required. The restaurant is resolved from it server-side, never sent by
  // the client, and a scan that cannot be attributed to one is refused rather
  // than paid for.
  let tableId: string;

  try {
    const body = await req.json();
    imageBase64 = String(body.image_base64 ?? '');
    mediaType = String(body.media_type ?? 'image/jpeg');
    tableId = body.table_id ? String(body.table_id) : '';
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  if (!imageBase64) {
    return json({ error: 'No photo was sent.' }, 400);
  }

  if (!tableId) {
    return json({ error: 'A scan has to belong to a table.' }, 400);
  }

  // Also covers a table that belongs to somebody else: the answer is the same
  // null, and so is the refusal. Nothing has been spent at this point.
  if (!(await resolveRestaurant(tableId, user.id))) {
    return json({ error: 'You cannot scan a receipt for that table.' }, 403);
  }

  // base64 carries 3 bytes per 4 characters.
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return json({ error: 'That photo is too large. Please retake it.' }, 413);
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      // Thinking is on by default on this model and `max_tokens` caps thinking
      // and answer together, so this leaves room for both on a long receipt.
      max_tokens: 8000,
      output_config: {
        effort: EFFORT,
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
    // Every outcome below has already been billed, so every outcome is
    // recorded — a restaurant whose photos keep being refused is expensive
    // precisely because they keep being refused.
    const usage = {
      tableId,
      adminId: user.id,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };

    if (message.stop_reason === 'refusal') {
      console.error('Refused:', message.stop_details);
      await recordScan({ ...usage, succeeded: false });
      return json({ error: 'This photo could not be read. Try another one.' }, 422);
    }

    if (message.stop_reason === 'max_tokens') {
      await recordScan({ ...usage, succeeded: false });
      return json({ error: 'That receipt is too long to read in one go.' }, 422);
    }

    const text = message.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') {
      throw new Error('The receipt reader returned nothing to read.');
    }

    const receipt = JSON.parse(text.text) as ParsedReceipt;
    validate(receipt);

    // Checked before the empty-items case below: "this receipt is from
    // somewhere else" explains an empty result as well as a full one, and is
    // the more useful thing to be told.
    const refusal = await attachReceipt(tableId, receipt);

    if (refusal) {
      // Recorded as failed: the tokens were spent, and a restaurant collecting
      // refusals is what somebody trying to bill their receipts to it looks
      // like from the owner's side.
      await recordScan({ ...usage, succeeded: false });
      return json({ error: refusal }, 409);
    }

    // A reply with no items is a valid answer to "what is on this receipt" —
    // it is what a photo of a laptop, or a hand, correctly produces. But it
    // spent the tokens and gave the admin nothing, so it is a failed scan in
    // the only sense that matters here: the money is gone and the receipt is
    // not read. Recording it as a success would make "failed scans" a number
    // that quietly excludes the most common way scanning wastes money.
    await recordScan({ ...usage, succeeded: receipt.items.length > 0 });
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
