# Split — shared restaurant bills

## Before writing any code

Expo has changed. Read the versioned docs at
https://docs.expo.dev/versions/v54.0.0/ rather than relying on memory.

## What the app does

One person (the **admin**) creates a table at a restaurant and shares an
invitation link. **Guests** join with just a name — no account, no email, no
password — and each person taps the items they actually consumed. Everyone's
share is worked out from those selections.

The receipt is the single source of truth. Nothing is "assigned" by the admin
on other people's behalf.

## Rules that hold everywhere

**The database owns every number.** Line totals, subtotals, bill totals and
each person's share are computed in Postgres. The app displays them; it never
decides them. If a screen and the database disagree, the database is right.

**Money is integer cents. Always.** No floats anywhere near a total. Splitting
uses the largest-remainder method so the parts always add back up exactly —
€10 between three people is 334 + 333 + 333, never 333.33.

**No silent fallbacks.** There is deliberately no mock data and no offline
stand-in for auth. A missing configuration fails with a clear message instead
of quietly pretending to work. An earlier mock layer caused a real bug where
the app chose invented data over the user's own; do not reintroduce that
pattern.

**Two kinds of receipt line**, and they behave differently:
- `quantity > 1` — unit based. Units are counted out and cannot be
  over-claimed. "3 of 4 claimed."
- `quantity = 1` — shareable. Any number of people may claim it and the price
  is divided between them. "Shared by 3."

## Who is who

| | Admin | Guest |
|---|---|---|
| Identity | Supabase Auth account | opaque session token |
| Stored in | `profiles` + `participants` | `participants` only |
| Reaches data via | RLS as `authenticated` | `SECURITY DEFINER` functions as `anon` |

Both are participants at the table and both claim items. The admin can also
manage the receipt, totals and lifecycle. Guests have **no** direct table
access — the database functions are the entire authorisation boundary, and
each one derives the participant from the session token rather than trusting
any id sent by the client.

## Layout

```
app/                     screens (expo-router)
  (admin)/               dashboard · tables · profile, behind an auth guard
  join/[code].tsx        guest entry from an invitation link
hooks/
  use-realtime-bill.ts   the only Supabase Realtime subscription
supabase/functions/
  parse-receipt/         reads a receipt photo; holds the Anthropic key
lib/
  money.ts               cents, formatting, largest-remainder split
  split.ts               display-side helpers for the receipt rows
  services/              every Supabase call lives here, never in a screen
  database/              generated types + readable aliases
providers/               auth session · guest session
supabase/migrations/     schema, functions, triggers, RLS
```

Screens call services. Services call Supabase. Nothing in `components/` talks
to the network.

## Database

Migrations are the source of truth and are applied in order:

| Migration | Adds |
|---|---|
| `20260813000000_initial_schema` | tables, RLS, split maths, completion checks |
| `20260813120000_guest_sessions` | invite codes, join/leave, guest reads |
| `20260813180000_bill_management` | tax, service, tip, confirmed total, dashboard view |
| `20260813210000_item_claims` | claiming, availability, admin claims |
| `20260814000000_realtime_sync` | change broadcasts for bills and tables |
| `20260814120000_freeze_completed_bills` | a closed bill stops accepting changes |
| `20260814140000_fix_claim_upsert_double_count` | a claim that fits is no longer refused |
| `20260814160000_tip_shares` | the tip, split evenly by headcount |
| `20260814200000_receipt_photos` | the receipt photo, kept and shared |
| `20260814220000_even_split_mode` | split the whole bill evenly, no ticking |
| `20260814230000_grant_settlement_columns` | the grant `settlement_tracking` forgot |
| `20260814240000_draft_bills_are_never_assigned` | a draft never skips `start_bill` |

Regenerate types after any schema change:

```bash
npx supabase gen types typescript --project-id <project-id> > lib/database/types.ts
```

Three Postgres traps this project has already been bitten by, worth
remembering:

- A column-level `REVOKE` does nothing while the role still holds a table-wide
  `SELECT`. Revoke the table privilege, then grant the safe columns back.
- Column grants are not retroactive, and this has already broken production
  once. `participants` has no table-wide `SELECT` on purpose, so
  `session_token` stays unreachable — the price is that **every column added
  later has to be granted explicitly**. Adding `settled_at`/`settled_by`
  without granting them made Postgres refuse the entire read, and every admin
  saw "Could not load the people at this table." until the grant was added.
  Adding a column to `participants` means adding a grant in the same
  migration.
- `EXECUTE` is granted to `PUBLIC` by default. Revoking from `anon` and
  `authenticated` alone leaves the inherited grant in place.
- A trigger function is **not** `SECURITY DEFINER` unless it says so, and a
  plain one runs as the caller. A guard trigger that calls a revoked helper
  therefore fails on *every* write rather than only the ones it means to
  refuse — and the error it raises is `permission denied for function …`,
  which reads nothing like the rule being enforced.

Closed bills are frozen in the database, not only in the UI: `bill_items`,
`bills` and claim deletion all refuse once a bill is `COMPLETED`. A
`FULLY_ASSIGNED` bill deliberately still lets a guest lower or clear their own
claim, otherwise they are stranded on a bill they cannot change.

## Running it

```bash
npx expo start -c
```

`-c` matters after installing native modules or changing `app.json`.

Requires `.env` (see `.env.example`). The app does not run without it, by
design.

## Realtime

Everyone at a table sees the same figures without pressing anything.

Postgres triggers send a **signal, never content**: `{bill_id, source, event}`
on the topic `bill:<uuid>` (and `table:<uuid>` for the screens that exist
before the bill does). Every client then re-reads the authoritative state
through the path it is already allowed to use. Nothing is merged into local
state and nothing is recomputed on the device — one person claiming a shared
line changes what *everyone else* on that line owes, and only Postgres knows
the largest-remainder answer.

`postgres_changes` is deliberately not used. It replays rows through RLS as
the connecting role, and guests are `anon` with no grant on any table; making
it work would mean handing `anon` direct SELECT on bills, items, claims and
participants. Broadcast keeps the boundary exactly where it was. The
`supabase_realtime` publication stays empty.

The topics are public, because a private topic can only be joined by an
authenticated client and guests have no account by design. The bill id is what
guards the topic — 122 random bits that reach a device only through an
authorised read — and the message carries nothing to read even if it leaked.

`hooks/use-realtime-bill.ts` is the only place that talks to Realtime. It
reference-counts one channel per topic, coalesces bursts into a single reload,
and re-reads after a reconnection or a return to the foreground.

One trap worth remembering: `realtime.messages` is partitioned by day and its
partitions are created by the Realtime service, not by the schema. On a
project that has never opened a Realtime connection there are none, and
`realtime.send` swallows the failure as a `WARNING` — every broadcast silently
vanishes. One client connection creates them.

## Reading receipts

A photo of the receipt becomes bill lines through Claude's vision, and the key
that pays for it never touches the device.

Anything in the Expo bundle is extractable — an `EXPO_PUBLIC_` variable ships to
the phone in plain text — so the Anthropic key lives as a Supabase secret and
the call happens in the `parse-receipt` Edge Function. The app sends a photo and
gets lines back; only the function can talk to Anthropic. The function also
demands a real signed-in user, because `verify_jwt` alone would accept the
publishable key and let anyone spend the budget.

The reply shape is enforced by the API rather than hoped for: `output_config`
carries a JSON schema, so the model cannot return prose or a field we do not
expect. Numeric bounds are checked in code, since structured outputs reject
`minimum` in a schema.

Photos are resized to 2576 pixels on the long edge before upload — exactly
Claude's high-resolution limit. Larger buys nothing (the API downsamples);
smaller starts losing small print.

Receipts print line totals, the app stores unit prices. The model divides, and
a line total that does not divide evenly cannot be represented exactly — the
review screen shows the receipt's own total beside the sum of the lines so the
admin can see any gap, and `confirmed_total_cents` is where it settles.

`lib/receipt/mock-parser.ts` is still in the tree, returning four invented
lines. Swap it back into `lib/receipt/index.ts` only to work on the review
screens without spending API calls, and never leave it there — an earlier mock
layer caused a real bug where the app preferred invented data over the user's.

## Two ways to split

`bills.split_mode` decides which question the bill is answering.

**`BY_ITEM`** (the default) is everything described above: people claim what
they had, and the largest-remainder split divides each line between whoever
took it.

**`EVENLY`** divides the **grand total** — items, tax, service and tip — by
headcount, and ignores claims entirely. Splitting only the subtotal would have
left tax and service allocated to nobody, which is exactly the unexplained
"remaining" this mode exists to remove. The shares come from
`bill_even_shares`, largest remainder again, so they add back up to the total
to the cent.

Three things follow from the mode, and all three are decided in Postgres:

- **Status.** An evenly split bill is `FULLY_ASSIGNED` as soon as it has a
  total and somebody to divide it between — there is nothing left to claim.
  `apply_assignment_status` refuses to move a `DRAFT` bill at all: it never
  needed that guard while claiming required an open bill, but an even split
  has no claims to wait for and promoted drafts straight past `start_bill`.
- **Completion.** `validate_bill_completion` asks a different question per
  mode; "some items have not been claimed yet" cannot apply to an even split.
- **Assigned / remaining.** Reported as the full total and zero, not from item
  claims. Reading claims there showed "Remaining <the whole bill>" on a bill
  where nothing was outstanding.

Switching modes **keeps the claims**. Someone who ticks half a receipt, flips
to even, and flips back finds their selections where they left them —
discarding them would make the toggle a one-way door wearing a switch's
clothes.

One UI note worth keeping: "closed" means `COMPLETED` and nothing else.
`FULLY_ASSIGNED` used to count as locked on the guest screen, which both
contradicted the database — it deliberately still lets a guest lower or clear
their own claim — and made every evenly split bill announce "This bill is
closed." the moment it opened.

## The receipt photo

Kept with the bill and readable by everyone at the table, so "I never ordered
the wine" has somewhere to be checked after the plates are gone.

The `receipts` bucket is **private**, and that is not paranoia: a receipt shows
the table, the time, what was eaten, sometimes the last four digits of a card.
Access is a signed link that expires in five minutes, minted per request.

Guests are the interesting case, and the same one Realtime had. Storage
policies are evaluated against the caller's account, and a guest has none — a
policy cannot tell "a guest at this table" from "any anonymous caller". So
guests never touch Storage: the `receipt-url` Edge Function resolves their
session token exactly like every other guest read, then signs a link with the
service key, which lives only there. The path is looked up server-side from
whoever the caller turned out to be, so nobody can request someone else's
receipt by guessing a bill id.

The photo is uploaded only once the scanned lines are confirmed, so an
abandoned scan leaves nothing behind, and a failure to keep it never loses the
items the admin just added.

One trap, already walked into: **do not clean up storage objects with a
Postgres trigger.** `delete from storage.objects` raises inside
`storage.protect_delete` and takes the parent row's deletion down with it, and
forcing past that guard would only drop Postgres's record while the bytes stay
in the bucket. Removal goes through the Storage API, from the side holding the
session.

## Not built yet

Payments and https universal links.

Invitation links currently use the app's own scheme, which is not clickable in
messaging apps and does nothing for someone without the app installed. Making
invitations work for real needs a domain, universal links, and a web version
of the guest flow.
