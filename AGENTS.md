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

Above both sits the **owner** — `profiles.role = 'owner'`, one account, the
person selling the app. See "The owner area" below. An owner is still an admin
in every other respect; the role only adds what that section describes.

## Layout

```
app/                     screens (expo-router)
  (admin)/               dashboard · tables · profile, behind an auth guard
  onboarding.tsx         the admin tutorial, eight steps
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
providers/               auth session · guest session · onboarding
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
| `20260814180000_settlement_tracking` | who has actually handed the money over |
| `20260814200000_receipt_photos` | the receipt photo, kept and shared |
| `20260814220000_even_split_mode` | split the whole bill evenly, no ticking |
| `20260814230000_grant_settlement_columns` | the grant `settlement_tracking` forgot |
| `20260814240000_draft_bills_are_never_assigned` | a draft never skips `start_bill` |
| `20260816000000_admin_onboarding` | the tutorial's "already read it" flag |
| `20260826000000_owner_role_and_restaurants` | the owner role, the curated restaurant list, usage counts |
| `20260826120000_restaurants_unique_per_city` | two branches may share a name in different towns |
| `20260826140000_owner_merges_restaurants` | folding a duplicate into the real restaurant |
| `20260826160000_owner_deletes_restaurants` | removing a restaurant and its history for good |
| `20260826180000_no_new_tables_at_hidden_restaurants` | a hidden restaurant stops taking new tables |
| `20260826200000_restaurants_require_a_city` | the city becomes mandatory, closing the uniqueness hole |
| `20260826220000_restaurants_grants_match_the_rules` | the grants on `restaurants` stop contradicting the policies |
| `20260826240000_receipt_scan_log` | what each restaurant costs in receipt-reading |

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
- The same is now true of `profiles`, but only for writes. `role` had to
  become unwritable by its own owner — a table-wide `UPDATE` plus the
  "Admins update their own profile" policy let any admin promote themselves —
  so `INSERT`/`UPDATE` were revoked and granted back by column. `SELECT` is
  still table-wide, so a new column stays *readable* automatically but is
  **not writable until granted by name**.
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

## The admin tutorial

Eight steps shown once, the first time an admin reaches the app: the table,
the bill, the invitation, claiming, the live totals, settling up.

**It is a drawing of the app, not the app.** Every mock control is a plain
`View` rather than a `Pressable`, so a curious tap does nothing at all instead
of something surprising, and no table, bill or claim is touched. The figures
on the pages are invented and stay that way, which is not the mock data this
project forbids elsewhere — nothing here can reach a screen that shows real
numbers, and there is no path by which the app could prefer it over the
user's own.

**The flag is a column, not a device setting.** `profiles.onboarding_completed`
is where "has read it" lives, so somebody who signs in on a second phone is
not made to read it again. The ownership was already right: RLS on `profiles`
restricts every row to `id = auth.uid()` for `authenticated` and gives `anon`
no policy at all, so an admin reaches only their own flag and a guest reaches
none. No grant was needed either — `profiles` carries table-wide `SELECT` and
`UPDATE`, which a new column inherits. That is only true because those grants
are table-wide; `participants` has to name every column, for the reason above.

Guests never see it. The trigger lives behind the `(admin)` layout, which is
the boundary they cannot cross.

Two details worth keeping:

- The step counter is read from the scroll offset, not from
  `onMomentumScrollEnd`. A slow drag released without velocity never produces
  a momentum end on iOS, which would leave "3 / 8" naming a page the reader is
  no longer looking at.
- Android's back button steps backwards through the tutorial, and means
  "skip" on the first page. Left alone it would pop the screen without
  recording anything, and the tutorial would offer itself again next launch.

Failing to persist is deliberately not surfaced: the admin has already left by
then, and an unwritten flag means the tutorial asks once more next launch,
which is the harmless direction to fail. **Profile → Replay Tutorial** reopens
it at step one and clears nothing else.

## The owner area

One account — `profiles.role = 'owner'` — sees whether the app is actually
being used: tables started, bills closed, people who joined, and when each
place was last active. It exists because selling Split to a restaurant needs
evidence, and until now every admin could only ever see their own tables.

**Counts, never money.** `owner_restaurant_stats()` returns no amounts, no
participant names and no receipt lines. Whether a place uses the app is a
different question from what its customers ate, and only the first one is the
owner's business.

**The role is set in SQL, not in the app and not in a migration.** The repo is
public, so no email belongs in a committed file:

```sql
update public.profiles set role = 'owner' where email = '<the owner>';
```

**The database is the boundary, the hidden tab is a convenience.** The owner
tab is dropped from the tab bar with `href: null`, and `app/(admin)/owner.tsx`
redirects a non-owner away, but neither is what protects anything —
`is_owner()` inside the `SECURITY DEFINER` function is, exactly as the guest
functions work. Reaching the screen by other means still yields nothing.

## Restaurants are chosen, not typed

`tables.restaurant_name` used to be free text, which meant "Trattoria Roma"
and "trattoria roma" were two different places and the usage figures above
would have been worth nothing. Names now live in `restaurants`, every admin
may read the list, and only the owner may write it.

The unique index is on `lower(trim(name))` **and the city** — that, rather
than the picker, is what actually prevents duplicates. The backfill collapsed
the existing `loft`/`LOFT` pair into one restaurant on exactly that rule.

The city is part of the key because a chain has a "Loft" in Cluj and a "Loft"
in Bucharest, and keying on the name alone refused the second as a duplicate
of the first. A missing city collapses to `''` rather than staying `NULL`,
because NULLs are not equal to each other in a unique index and two
nameless-city rows sharing a name would both be accepted.

The city is now `NOT NULL`, with a check that it is not blank — `NOT NULL`
alone would accept `'   '` and reopen the same hole. It was nullable only while
the rows backfilled from the old free text still existed; once they were gone,
the column could finally say what the form had always required.

A restaurant is normally **deactivated rather than deleted**: `is_active =
false` drops it out of the picker while its history stays intact. It is the
answer for a contract that ends — the place stops appearing, and the figures
that prove it once used Split survive.

That rule is enforced in Postgres, not only in the picker.
`prevent_table_at_inactive_restaurant` refuses a new table at a hidden
restaurant, because filtering in the service alone left the database happily
accepting one. It fires on INSERT only: tables that already exist keep working
(hiding a place mid-dinner must not break somebody's bill), and
`owner_merge_restaurants` moves tables with an UPDATE, so consolidating two
dead entries stays possible. That history is the evidence the owner area exists to
produce, so a place that merely goes quiet should keep it.

`owner_delete_restaurant` is the way out when a contract ends for good, or a
row was added by mistake. It takes the tables with it, and everything below
`tables` already cascades. The confirmation names what is being destroyed —
tables, closed bills, people — and offers **Hide instead** whenever there is
anything to lose, because that is usually the answer.

Worth knowing: deleting the tables gets past the completed-bill freeze guards
without standing them down. Those guards refuse a claim or a line being
*edited* on a closed bill, and treat a parent cascading away as a different
thing — `prevent_completed_claim_delete` says so in its own comment. Deleting
`item_claims` directly on a closed bill is still refused, correctly; that is
why a bulk wipe has to start at `tables` rather than at the leaves.

`authenticated` has no `DELETE` on `restaurants`, and `anon` has nothing at
all, so the function is the only route and the owner check lives in one place.
That is now true rather than merely intended: Supabase's default privileges
had granted every role all four verbs on the table, and the original
`grant select, insert, update` was additive — it revoked nothing. Nothing was
exploitable, because RLS has no `DELETE` policy and `anon` has no policy at
all, but the *reason* written down was false, which is the dangerous kind of
wrong in a file the next change reads for guidance.

Worth carrying forward: on this project RLS is the guard and grants are
defence in depth, and a fresh table starts with `anon` and `authenticated`
holding everything. Revoke what a role should not have in the same migration
that creates the table, or the comment explaining why it is safe will not
match the privileges.

The one exception is **merging**, and it exists because renaming cannot fix a
duplicate on its own — renaming "italiwn" onto "Italien" just collides with
the unique index, which is the index working correctly.
`owner_merge_restaurants` moves the tables across *first* and only then drops
the row, so no table is ever orphaned; `tables.restaurant_id` is `NOT NULL` and
would refuse it anyway. It is a `SECURITY DEFINER` function rather than a
policy exactly because `authenticated` has no `DELETE` here.

The owner edits a name or a town in place on the restaurant's own card. Fixing
a typo should not cost a navigation, and the usage figures stay on screen while
you do it.

Google Places was considered and rejected: it bills per request, needs the key
kept off the device like the Anthropic one, and still would not prevent two
spellings of the same place. The list is small and the owner meets each
restaurant in person anyway.

`restaurant_name` still appears in the output of `admin_table_summaries` and
`get_guest_table`, resolved through the join — screens read the field they
always read.

## What a restaurant costs to serve

Reading a receipt is the only part of Split billed per use, and it is billed by
the token. A place with twenty tables and three sittings a night can spend more
on API calls than it pays in subscription — and without a record, the first
sign of that is the Anthropic invoice, which does not mention restaurants by
name.

So `parse-receipt` writes a row per scan into `receipt_scans`: the tokens the
API reported (not an estimate — `usage` was already in the response and was
being thrown away), the model, and the cost. The owner sees the month's count
and spend per restaurant.

**Cost is in micro-dollars.** Integer money, like everything else here. Cents
are too coarse: a scan costs about five of them and the differences worth
seeing are smaller than one.

**Failed scans count too.** A refusal or a truncated answer still spent the
tokens, and a place whose photos keep failing is expensive precisely because
they keep failing.

**The scan is attributed server-side.** The app sends `table_id`; the
restaurant is resolved from it inside `record_receipt_scan`, so a client cannot
bill its scans to somebody else. That function is granted to `service_role`
alone — not even the owner may write a row, which is what keeps the figures
worth trusting. Reading goes through `owner_restaurant_stats`; `receipt_scans`
itself has no grants for `anon` or `authenticated` at all.

**Recording never fails the scan.** The admin is standing at a table waiting
for their receipt. A lost bookkeeping row is a smaller failure than a lost
scan they have already paid for, so `recordScan` logs and returns rather than
throwing.

The price table lives beside the model in the Edge Function, because the price
belongs to the model. Change the two together, or every restaurant's spend is
quietly misreported.

**The model was chosen by measurement.** Thirty generated receipts through
Haiku 4.5, Sonnet 5 and Opus 5, scored against ground truth. On realistic
photos, Sonnet 5 and Opus 5 both read 100% of items, quantities and prices with
nothing invented; Sonnet costs half. `effort` changed the bill by 41% and the
accuracy by nothing, so it stays `low`. Haiku 4.5 was rejected for inventing
items even on clean photos — the one error a guest cannot catch, because it
lands on their share looking like everything else.

One trap the benchmark walked into, worth remembering if it is ever rebuilt:
the generator printed the *unit* price in the right-hand column while the
subtotal summed *line* totals. No real receipt does that — the right column is
always the line total — so every model divided by the quantity, correctly, and
was scored wrong for it. The test was measuring its own bug. Receipts vary in
whether the sub-line spells out `3 x 48.00` or only `buc: 3`; the right column
does not vary.

## Not built yet

Payments and https universal links.

Invitation links currently use the app's own scheme, which is not clickable in
messaging apps and does nothing for someone without the app installed. Making
invitations work for real needs a domain, universal links, and a web version
of the guest flow.
