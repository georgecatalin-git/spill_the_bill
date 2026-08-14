// Hands out a short-lived link to a table's receipt photo.
//
// The bucket is private, so a photo is only ever reachable through a signed
// link. Minting one needs the service key — which is exactly why this runs on
// a server and not on a phone: that key bypasses every row-level rule in the
// project, and anything in the Expo bundle is extractable.
//
// Two kinds of caller, one boundary each:
//   admin  — their Supabase session; RLS decides whether the bill is theirs.
//   guest  — their opaque session token; `get_guest_receipt_path` resolves the
//            table it belongs to, the same way every other guest read does.
//
// Neither is trusted to name the object. The path is looked up server-side
// from whoever they turned out to be, so a caller cannot ask for someone
// else's receipt by guessing an id.

import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';

/** Long enough to open the photo, short enough that a leaked link goes stale. */
const SIGNED_URL_TTL_SECONDS = 300;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function publicKey() {
  // Both names are read: a project moved to the newer publishable/secret keys
  // may have the legacy anon key switched off.
  return Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
}

/** The guest's own table decides which photo they may see. */
async function pathForGuest(sessionToken: string) {
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', publicKey());

  const { data, error } = await supabase.rpc('get_guest_receipt_path', {
    p_session_token: sessionToken,
  });

  if (error) {
    // An expired or invented token lands here; say so without echoing the
    // database's own wording back to a stranger.
    console.error('receipt-url: guest lookup failed:', error.message);
    return { path: null as string | null, rejected: true };
  }

  return { path: (data as string | null) ?? null, rejected: false };
}

/** RLS answers this one: a bill the caller does not own simply returns nothing. */
async function pathForAdmin(authorization: string, billId: string) {
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', publicKey(), {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { path: null as string | null, rejected: true };

  const { data, error } = await supabase
    .from('bills')
    .select('receipt_path')
    .eq('id', billId)
    .maybeSingle();

  if (error) {
    console.error('receipt-url: admin lookup failed:', error.message);
    return { path: null as string | null, rejected: true };
  }

  return { path: data?.receipt_path ?? null, rejected: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not available to this function.');
    return json({ error: 'Receipt photos are not configured on this server.' }, 503);
  }

  let sessionToken: string | null;
  let billId: string | null;

  try {
    const body = await req.json();
    sessionToken = body.session_token ? String(body.session_token) : null;
    billId = body.bill_id ? String(body.bill_id) : null;
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const authorization = req.headers.get('Authorization');

  const resolved = sessionToken
    ? await pathForGuest(sessionToken)
    : authorization && billId
      ? await pathForAdmin(authorization, billId)
      : { path: null, rejected: true };

  if (resolved.rejected) {
    return json({ error: 'You are not at this table.' }, 403);
  }

  // A table with no photo is an ordinary answer, not a failure.
  if (!resolved.path) {
    return json({ url: null });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  const { data, error } = await admin.storage
    .from('receipts')
    .createSignedUrl(resolved.path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error('receipt-url: could not sign', resolved.path, error?.message);
    return json({ error: 'Could not open the receipt photo.' }, 502);
  }

  return json({ url: data.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
});
