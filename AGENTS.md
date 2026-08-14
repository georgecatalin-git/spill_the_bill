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

Regenerate types after any schema change:

```bash
npx supabase gen types typescript --project-id <project-id> > lib/database/types.ts
```

Two Postgres traps this project has already been bitten by, worth remembering:

- A column-level `REVOKE` does nothing while the role still holds a table-wide
  `SELECT`. Revoke the table privilege, then grant the safe columns back.
- `EXECUTE` is granted to `PUBLIC` by default. Revoking from `anon` and
  `authenticated` alone leaves the inherited grant in place.

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

## Not built yet

OCR, payments, and https universal links. The receipt parser is a
stand-in behind a `ReceiptParser` contract — swapping in real OCR is one line
in `lib/receipt/index.ts`.

Invitation links currently use the app's own scheme, which is not clickable in
messaging apps and does nothing for someone without the app installed. Making
invitations work for real needs a domain, universal links, and a web version
of the guest flow.
