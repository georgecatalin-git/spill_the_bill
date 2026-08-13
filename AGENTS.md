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

## Not built yet

Realtime, OCR, payments, and https universal links. The receipt parser is a
stand-in behind a `ReceiptParser` contract — swapping in real OCR is one line
in `lib/receipt/index.ts`.

Invitation links currently use the app's own scheme, which is not clickable in
messaging apps and does nothing for someone without the app installed. Making
invitations work for real needs a domain, universal links, and a web version
of the guest flow.
