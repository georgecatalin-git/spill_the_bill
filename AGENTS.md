# Split — shared restaurant bills

## Before writing any code

Expo has changed. Read the versioned docs at
https://docs.expo.dev/versions/v54.0.0/ rather than relying on memory.

## What the app does

One person (the **admin**) creates a table at a restaurant and shares an
invitation link. **Guests** join with just a name — no account, no email, no
password — and each person taps the items they actually consumed. Everyone's
share is worked out from those selections.

The receipt is the single source of truth. Guests claim their own items, and
that is still the default path.

The host may also record an order **on somebody's behalf**, through
`admin_set_participant_claim`. This was once forbidden outright, and the rule
was quietly costing more than it protected: a table only worked if everyone
installed the app and joined, and anyone who did not was simply absent from the
bill — their share fell to whoever did. With this, one phone is enough. The host
adds people by name and writes down what they ordered, the way a waiter's pad
works.

The protection survives where it matters: a guest who *is* in the app can still
change what was put on their share. `claim_item` and `remove_item_claim` are
untouched. The host records; they do not get the last word.

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

**An order can be added straight onto somebody.** The add form offers who it
is for, and "Nobody yet" is the default — an unclaimed line is still the normal
case and still what guests tick for themselves. Choosing a person creates the
item and puts it on their share in one action, because a waiter taking an order
does one thing: "a beer for George" split across adding a line and then
assigning it is how the second half gets forgotten. It reloads once at the end,
so the table never flickers through a state where the beer exists and belongs
to nobody.

It composes two things that already existed — `createBillItem` and
`admin_set_participant_claim` — and adds no new rule. The guest can still
change what was put on their share; `claim_item` and `remove_item_claim` are
untouched, as they have been since the host was first allowed to record for
others.

**Adding by hand asks for no quantity.** A round is three taps of "beer"
rather than one line of three: faster while the order is happening, and each
drink is then claimable on its own, with no "3 of 4 claimed" for anybody to
work out. The split lands in exactly the same place. The field survives in the
*edit* form, because the scanner does produce quantities — a line reading
"3 Cola 7.50" comes back as three — and those must stay correctable. It also
survives on the review screen, where somebody is checking a scan against the
paper in their hand and the printed quantities matter.

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
  reconcile/             matches the receipt against the running tab
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
| `20260826260000_leaving_a_table_revokes_reading` | a guest who left stops seeing the table |
| `20260826280000_split_the_rest_evenly` | when nobody remembers who had what |
| `20260826300000_share_the_rest_by_value` | the same, but divided by value rather than by the piece |
| `20260826320000_host_assigns_items` | the host records orders for people who have no app |
| `20260826340000_remaining_excludes_the_tip` | "remaining" stops counting the tip as unowned |
| `20260826360000_restaurants_have_admins` | assignment per account — superseded, see the next but one |
| `20260826380000_the_receipt_names_its_own_restaurant` | the fiscal code on the receipt is checked against the restaurant |
| `20260826400000_the_receipt_may_only_have_a_name` | the name as fallback, when the paper is a pre-bill and carries no code |
| `20260826420000_a_table_is_opened_where_the_restaurant_is` | assignment out, perimeter in — both later removed, see below |
| `20260826440000_search_by_name_and_demand_the_code` | perimeter out; the picker becomes a search box and the fiscal code becomes required |
| `20260826460000_a_restaurant_without_a_code_cannot_scan` | the missing-code refusal moves before the API call |
| `20260826480000_the_scanner_just_scans` | the whole receipt check comes back out; the scanner reads and nothing else |
| `20260827000000_an_account_belongs_to_a_restaurant` | the account *is* the restaurant's; a table cannot be opened anywhere else |
| `20260827020000_accounts_can_be_deleted` | an account can be removed, and the restaurant keeps its tables |
| `20260827040000_a_code_on_the_table_opens_a_table` | a customer opens a table with the code printed in the restaurant |
| `20260827060000_a_linked_account_ignores_other_codes` | a restaurant's own account cannot be sent elsewhere by a code |
| `20260827080000_the_receipt_must_belong_to_the_session` | the fiscal code on the paper must be the session restaurant's |
| `20260827100000_restaurants_have_a_lifecycle_and_tables` | PENDING → ACTIVE → SUSPENDED → INACTIVE, and one code per physical table |
| `20260827120000_one_code_per_restaurant` | physical tables out; one permanent code per restaurant, the table is what the guests call it |
| `20260827140000_the_code_is_the_only_way_in` | the account-to-restaurant link goes; a table can only be opened with the printed code |
| `20260827160000_accounts_are_not_guests` | a scanned-in customer is a session identity, not an account |
| `20260827180000_a_restaurant_has_one_admin` | `restaurants.admin_user_id`, and a restaurant admin sees its splits |
| `20260827200000_one_definition_of_which_restaurant` | `venue_by_code` dropped; the picker asks the same function the gate does |
| `20260827220000_a_restaurant_admin_has_a_dashboard` | the restaurant sees its own figures, code and details |
| `20260827240000_a_new_bill_can_be_read_back` | a SELECT policy must read the row's columns, not look the row up |

Regenerate types after any schema change:

```bash
npx supabase gen types typescript --project-id <project-id> > lib/database/types.ts
```

Four Postgres traps this project has already been bitten by, worth
remembering:

- **A SELECT policy that has to *find* the row cannot also guard the row's own
  creation.** Every insert PostgREST makes is `INSERT ... RETURNING`, so the
  SELECT policy runs on the new row — and a `STABLE SECURITY DEFINER` helper
  that looks the row up by id does not see it yet, because it is not committed.
  The whole insert then comes back as 403. `is_bill_admin(id)` did exactly this
  when it replaced `is_table_admin(table_id)` in the bills read policy: bills
  stopped being creatable at all. Read the row's own columns
  (`table_id`), never look the row up.

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

`leave_table` revokes reading, not only writing. Every write path checked
`is_active`, but `resolve_guest_session` did not — and every read goes through
it, so a guest who left kept the item list, everyone's name, what each person
owed, who had paid, and the path to the receipt photo. Permanently, since the
token is never rotated. The check now lives in the resolver: one place to be
right, and no way to add a sixteenth reader that forgets.

Two callers pass `p_require_active => false` and must keep doing so.
`validate_guest_session` *reports* the flag — that is how the app offers "you
left, join again?" instead of a dead end — and `leave_table` stays idempotent.
Rejoining is unaffected: `join_table` reactivates an existing token without
going through the resolver.

**When nobody remembers.** Five people, seventy beers, four hours: by the end
nobody can say whether they had seven or fifteen, and the bill will not close
while units are unclaimed. `split_remaining_evenly` is the honest way out —
pick nobody, and what is left is shared between everyone still at the table.

It divides **value, not pieces**. The first version split leftover units, and
that was fine for beer and wrong for everything else: one pork neck left
between twelve people cannot be cut into twelfths, so the whole 62 lei landed
on whoever sorted first, and "why me?" had no good answer.

The remainder becomes a **shared line** instead — the same mechanism a dessert
platter uses. `quantity = 1` means "divide between whoever claims it",
`item_claim_shares` settles the odd cents by largest remainder, and no new
concept is needed anywhere. One pork neck between twelve is 5.17 each.

Two shapes, decided by whether anything was claimed: nothing claimed and the
line itself becomes the shared one, no duplicate row; something claimed and the
line is trimmed to what people owned up to while the rest splits off as its own
row. Totals are untouched either way — `apply_bill_item_total` recomputes
`total = quantity × unit_price`, which is why the split-off row carries the
whole remainder as its unit price. That is the only shape that survives the
trigger.

Refused below two people, in Postgres and not only in the picker: at a table of
one it would read as a split and behave as "claim the rest".

Admin only: it rewrites other people's claims. The UI does not ask *who* was
drinking, on purpose — the case this exists for is "we have no idea", and
asking re-opens the argument it is meant to end.

An item row carries its state as a coloured stripe: green once every unit has
an owner, amber while any is outstanding. It reads across a table without
anyone parsing a number, which is the moment it is needed.

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

**"Remaining" means unclaimed *items*, and only that.** What anybody can pick
off a receipt is the lines; the tip is split by headcount, and tax and service
are carried by the bill rather than chosen from it. Subtracting them from the
grand total produced a figure that could never reach zero — a fully claimed
1533.40 bill announced "Remaining 139.40", which was the tip, while the rows
underneath showed each person's slice of that same tip.

Three places computed it and two disagreed with the third. `bill_summaries` was
right (`subtotal - assigned`); `get_bill_assignment_summary` and the overview
screen each did `total - assigned` on their own. The screen now reads the
view's figure instead of recomputing, which is the general rule here: one
definition, in the database.

The percentage had the same fault — assigned over *total* never reaches 100% on
a bill with a tip, so a finished receipt read as ninety percent done.

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

**It is written for the restaurant's own staff**, because that is who the
account belongs to. It used to read as though the host were one of the diners —
"invite your friends" — which stopped being true when the restaurant became a
property of the account rather than something picked per table. The guests
still tick their own items; they are simply not the ones who start.

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

## A restaurant has one admin

`restaurants.admin_user_id` — one account, set by the platform owner from the
restaurant's own card. **The direction matters.** The first attempt was
`profiles.restaurant_id`, an account pointing at a restaurant, which allowed
many accounts per restaurant with nothing enforcing "one", and framed the fact
as a property of the person. This is one-to-one by construction and says what
is true: a restaurant has an administrator.

It is **displayed** on the account list and **edited** only on the restaurant
card, which is why there is no "link account to restaurant" anywhere. Only the
owner may write it, and `owner_set_restaurant_admin` refuses a guest session
identity outright — an anonymous profile can never administer anything.

**A restaurant admin can also act on them.** Reading a restaurant's splits
without being able to touch them turned out to be worse than not seeing them:
the screens offer every action, and each one came back 403 — add an item,
add somebody to the table, all refused, with nothing on screen to explain it.
The restaurant owns the split, and its admin is the waiter helping the table,
which is the same person the host-records-orders flow was written for.

That is widened in `is_table_admin`, `is_bill_admin` and `is_bill_item_admin`
rather than across a dozen policies. Those three already mean "may act on
this", and every write path asks one of them, so widening them once keeps the
answer in one place. Each still derives the restaurant from the row.

**A restaurant admin sees their restaurant's splits.** That took widening three
read policies, not one: `admin_table_summaries` is `security_invoker`, so
without `bills` and `participants` the sessions would have listed with every
figure at zero. `administers_restaurant` and `administers_table` are the two
questions those policies ask, both `SECURITY DEFINER`, both deriving the
restaurant from the row rather than from anything the client sent.

Verified live: the Italien admin sees Italien and Italien's session; a guest
sees the restaurant behind their own split and that split alone; the platform
owner sees everything.

**`tables.admin_id` is still whoever opened the split**, usually a guest, and
is deliberately not touched by any of this. It is what lets them act on their
own bill.

**The restaurant's own screen** is the `Restaurant` tab, shown only to an
account that administers one. `my_restaurant()` finds the row **by** the
caller — there is no restaurant id the app sends, so there is none a client
could tamper with, and the hidden tab is a convenience rather than the
protection.

It carries the figures, the Split code, and the details the restaurant may
correct itself. `restaurant_admin_update_details` writes **name, town and
address only**: the fiscal code is what every scanned receipt is checked
against, so a restaurant that could change it could start accepting another
company's bills, and the status is what says whether they are a paying
customer. Both stay with the platform owner, and RLS refuses a restaurant
admin's direct UPDATE on `restaurants` outright — verified as the
`authenticated` role: zero rows changed.

The Dashboard splits open splits from closed ones, because they are read for
different reasons: one is tonight's work, the other is the record. A restaurant
admin sees every split at their restaurant there, not only the ones they opened
— that is what widening the read policy on `tables` bought.

## The printed code is the only way a table is opened

An account used to be linked to a restaurant — `profiles.restaurant_id`, set by
the owner — and a table could only be opened where the account belonged. That
was the right answer while there was nothing else to prove which restaurant you
were at. Once every restaurant had a printed code, it stopped being one: the
code is open to anybody holding it, so the link restricted **only the accounts
the owner trusted** and left everyone else free. A control that binds the
trusted and nobody else is worse than none.

So the link is gone, and with it `my_restaurant_id`,
`owner_set_admin_restaurant`, the clause it added to the restaurants read
policy, and the restaurant dropdown on the Accounts screen.

**What replaced it is stricter, not looser.** The old trigger was load-bearing
in a way that is easy to miss: the RLS policy on `tables` is
`admin_id = auth.uid()`, so any signed-in caller could always INSERT a row
naming any restaurant, and what stopped them was the trigger refusing unlinked
accounts. `prevent_unauthorised_table` now refuses **every** insert that did
not come through `create_table_at_venue`, which proved the restaurant from a
printed code. The owner stays exempt, for demos.

`create_table_at_venue` grants that permission through a transaction-local
setting and **clears it immediately after the insert**. `is_local` means "until
the end of the transaction", not "until the end of the statement" — PostgREST
gives each request its own, so nothing could reach it from a phone, but a
permission that outlives what it was granted for is what a later change trips
over. The test that found this was inserting a second table in the same
transaction.

**When a restaurant dashboard is built, it will need a membership relation** —
account to restaurant, with a role — because there is currently nothing that
scopes an admin to a restaurant's data. Nothing does today: `admin_table_summaries`
shows an admin their *own* tables, never the restaurant's. Build it as
membership set during onboarding, not as a picker somebody chooses from.

## A restaurant has a lifecycle, and tables

`is_active` said only yes or no. A place entered during a demo but not yet
signed, one whose contract ended, and one taken down for a problem are three
different things, and onboarding needs to tell them apart — so `status` is now
the truth: **PENDING · ACTIVE · SUSPENDED · INACTIVE**, and new restaurants
start PENDING.

**`is_active` survives as a generated column** off `status`. Everything that
already read it — both triggers on `tables`, the search box, the code
resolver, the receipt gate, the owner's figures — keeps working untouched, and
the two cannot drift apart, which is the failure a second boolean would have
invited. Read `is_active` freely; write `status`, through
`owner_set_restaurant_status`.

Only ACTIVE serves, and **only a restaurant with `tax_id` may be ACTIVE** — a
check constraint, because without a code no receipt of theirs could ever be
validated.

**One code per restaurant, and no furniture.** `restaurants.venue_code` is a
single permanent code, printed as many times as the place likes — on the door,
on every table, on the menu. `resolve_venue_code` turns it into the restaurant,
and a code that does not exist answers exactly like a restaurant that is not
ACTIVE, so guessing teaches a stranger nothing.

Physical tables were built and removed the same day. A restaurant with thirty
tables would have had to enter thirty rows and print thirty different stickers
before it could use Split at all, and at fifty restaurants that becomes
somebody's job. Nothing about the security model depended on them: the
restaurant was always derived from the code, and the receipt always had to
carry that restaurant's fiscal code.

**What the guests type — "12", "Terasa 3" — lands in `tables.name`**, where
free text has always lived. It is a label on a session, not an entity. Two
groups who both type 12 get two separate sessions, because a session's identity
is its id and never its name; that is what stops one group walking into
another's bill by typing the same number.

Two kinds of code, and the difference matters: the restaurant's is **permanent**
and says where you are, while a session's `invite_code` is **temporary** and
says which bill to join.

## The receipt must belong to the session

The QR says which restaurant the session is at. **The receipt has to prove the
bill is from there.** Without the second half, a customer opens a table at
Italien with Italien's own code — legitimately — photographs a receipt from
somewhere that has never heard of Split, and the lines land on Italien's table:
the other place gets the product for nothing, and Italien's figures fill with
somebody else's dinner.

`attach_receipt_to_bill` is the gate, and every check is in it:

- the restaurant is **derived from the session**, never accepted from a caller
- it must be active, the table not closed, and `tables.expires_at` in the future
- `normalise_tax_id(receipt) = normalise_tax_id(restaurant)` — digits only, so
  spelling and a misread full stop cannot accuse an honest customer
- the receipt's date must be no older than two hours before the session opened
  and not in the future
- a unique index on `(receipt_tax_id, receipt_number, receipt_issued_at)` makes
  a receipt single-use across sessions — while re-scanning it into the *same*
  session stays a normal retry

**Where the values come from is the whole point.** The fiscal code is read off
the photo inside `parse-receipt` and travels to Postgres with the service key;
it never passes through the phone. The four `bills.receipt_*` columns carry no
UPDATE grant for `authenticated` — the table-wide UPDATE was revoked and the
app's own columns granted back by name — so a client cannot write a receipt
identity of its own choosing either.

**No fallback when the code cannot be read.** "We could not find it, so we
accept" is the hole every version of this check has eventually been defeated
through. The refusal is an instruction instead: photograph the whole fiscal
receipt.

**An active restaurant must have `tax_id`**, enforced by a check constraint,
because a restaurant with no code has nothing for a receipt to be compared
against and every scan there would be refused. Rather than let that happen
quietly, the constraint says it out loud.

**What this deliberately does not cover:** items typed in by hand. There is no
receipt to compare and nothing to compare it against. That path costs nothing
to serve, which is why it stays open — but do not describe the rule as though
it closed it.

`tables` is the session. It gained `expires_at` (twelve hours) rather than
being duplicated by a second entity with the same job; the existing statuses
were left alone, because nothing in this rule needs them renamed.

## Typed, not listed — and no scan without the code

Two attempts at "may this person open a table here" were built and removed on
the same day. Both are worth knowing about, because the reasons they failed are
the reasons the current shape looks the way it does.

**Per-account assignment** (`restaurant_admins`) let the owner grant each
account access to each restaurant. It worked. It was a full-time job at five
hundred restaurants, and it still could not stop an assigned admin from opening
a table somewhere else.

**A location perimeter** checked the phone's position against coordinates
captured on site. It answered the right question — and it could only be
switched on by standing in the restaurant. For a client in Arad, six hundred
kilometres away, that is a car journey to configure a checkbox. A control you
cannot enable remotely is not a control.

What is there now is deliberately modest about what it proves.

**The picker is a search box.** `search_restaurants` matches on
`normalise_business_name`, so case, diacritics, punctuation and "SC … SRL" are
all free — "SUB TÂMPA", "sub tampa" and "SC Sub Tampa SRL" all reach the same
row — but the name has to be right. Prefix match from three characters, ten
results at most.

This is **not** a security measure and must not be described as one: typing
"Italien" is exactly as easy as choosing it from a list. It buys two other
things. The customer list stops being readable in one piece — the `restaurants`
SELECT policy is no longer `using (true)`, only the owner and
`admin_has_table_at` see rows — and a name box still works at five hundred
restaurants where a dropdown does not.

**The fiscal code is the rule.** It is the one witness the client cannot
report: it is read off the photo, on the server. So it is now required on both
sides.

- The restaurant must have `tax_id` recorded. The owner's Add and Edit forms
  refuse to save without it, and `resolve_scan_restaurant` reports whether it
  is there — asked **before** the API call, because the answer never changes
  during service and paying for each refusal would be paying for a typo.
- The photo must show a code. `no_receipt_code` says so in the way that helps:
  no code visible usually means the *nota de plată*, so ask for the *bon
  fiscal*.

The name survives only as a supporting witness: it can still convict a receipt
that names a different known restaurant, but its absence never refuses.

**Know what this costs before changing it.** Requiring the code means a genuine
receipt photographed badly is refused until retaken, and it means the pre-bill
cannot be used at all. If a restaurant's *nota de plată* does print its CUI,
none of that bites; if it does not, splitting can only happen once the fiscal
receipt is out. That is a question about paper, answerable only in the
restaurant, and it is the first thing to check before loosening this rule.

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

**Failed scans count too**, and "failed" includes a reply with no items. A
refusal, a truncated answer, and a photo of a laptop all spent the tokens and
left the admin with nothing. The empty reply is the interesting one: it is a
*correct* answer — there was no receipt in the picture — but counting it as a
success would make "failed scans" a number that quietly excludes the most
common way scanning wastes money.

**The scan is attributed server-side, and an unattributable scan does not
happen.** The app sends `table_id`; the restaurant is resolved from it, so a
client cannot bill its scans to somebody else. `table_id` was optional at
first, and that was the hole: a scan sent without one — or with a made-up uuid
— ran, spent tokens, and then vanished, because `record_receipt_scan` had no
restaurant to attribute it to and dropping the row is the right call once the
money is already gone. So the question moved to *before* the API call.
`resolve_scan_restaurant` answers "which restaurant, if any" and the Edge
Function refuses on null — which also covers somebody else's table, since the
answer there is the same null. That function is granted to `service_role`
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

## The receipt check that was built and removed

For one day the scanner compared the fiscal code on the photo against
`restaurants.tax_id`, with the printed name as a fallback, and refused a
receipt from anywhere else. It is gone, and the reason is worth keeping.

It worked. It was not worth living with. Finding out that a photo shows no
fiscal code costs a full scan — the paper has to be read before anything can be
said about it — so every honest picture cropped to the item lines was paid for
and then refused. A restaurant whose code nobody had typed in could not scan at
all. Meanwhile the thing it prevented is worth about a cent, once: somebody
refused gets nothing and stops trying.

Two rules from it, if it is ever rebuilt:

- **Refuse only on contradiction, never on absence.** A code that could not be
  read is not evidence. The version that refused on a missing code is what made
  the ordinary case fail.
- **Never charge to discover the paper was wrong.** Any check that needs the
  photo read first has already spent the money by the time it can refuse.

`normalise_business_name` survives it and is now what the restaurant search box
runs on. `normalise_tax_id`, `check_scan_receipt` and `restaurants.tax_id` were
dropped in `20260826480000_the_scanner_just_scans`; the migrations that built
them are still in the tree and describe the design in full.

Nothing on a phone can prove where its owner is standing — geofencing was tried
and removed the same day, for a different reason: it could only be configured
from inside the restaurant, which is a six-hundred-kilometre drive for a client
in Arad. What remains is that a table can only name a restaurant the owner
entered, and that every scan is attributed to one.

## The receipt reconciles against the running tab

Items can be typed as they are ordered, so a table keeps its own tab through the
meal rather than waiting for paper. When the receipt arrives it is **compared**
against what was noted and the differences are shown — not replaced, not
appended. "The receipt wins" and "concatenate both lists" were both considered
and are the reason the question was worth asking.

`lib/reconcile/` is the matcher and the plan: pure TypeScript, no network, no
database, nothing that decides money. It proposes, a person confirms on
`app/reconcile-items.tsx`, and the confirmed decisions become ordinary item
writes. Postgres still computes every total, exactly as it always has.

**The screen is only reached when the bill already has items.** A table that
noted nothing has nothing to compare, and goes from the scan straight to the
bill as it always did — a diff listing every line as "new" is a step that asks a
question with one answer. `review-items` makes that call after the scan is
confirmed, so what gets reconciled is the corrected reading of the paper, not
the raw one.

**Matching is set to set, never row to row.** This is the shape everything else
follows from. Adding an item by hand makes one row per drink, so a round of
three beers is three rows on the tab; the till prints one line reading
`3 x 8,00`. Some tills do the opposite, and print three. So both sides are
grouped into products and compared as quantities and line totals — a row-to-row
matcher fails on the very first round of the evening.

**A matched group keeps its tab rows.** Claims hang off `bill_items.id`, so
deleting a row to put the receipt's version in its place silently deletes what
somebody ticked. Nothing here ever proposes that; a match adopts the receipt's
*numbers* onto the rows that already exist.

**Three bands, and the middle one is the point.** Above 0.75 a match is taken as
fact, below 0.45 it is not a match. In between the app asks. Resolving the
middle band by taking the higher score is how a bare "vin" gets silently
attached to the Chardonnay instead of the house red — and when one typed line
scores against two printed ones that do not match *each other*, the group is
reported as ambiguous rather than guessed at.

**A guessed match is confirmed as a match before any number follows from it.**
A `likely` group defaults to "match by hand", not to a price. Offering "take the
receipt" there settles money on the strength of a maybe, and "keep the tab"
settles it just as firmly the other way. This was found by a case that produced
the right groups and the wrong total: one typed "snitel cu cartofi" against a
printed dish and its garnish, where accepting both defaults billed the garnish
twice.

**How names are compared**, in `normalise.ts` and `similarity.ts`:

- The **size is pulled out of the name** and is decisive. "BERE 0.33" and
  "BERE 0.5" are two products at two prices, and leaving "0" and "5" among the
  words makes them identical. `0.5`, `500ml`, `50cl`, `300g` and a bare decimal
  all reduce to ml or g, so "0.33" and "330 ml" are one bottle.
- **Containment carries most of the weight**, because the typed name is almost
  always a fragment of the printed one — "bere" against "BERE URSUS 0.5" would
  score 0.33 on plain overlap and be thrown away.
- **Every token is weighted by how rare it is** across the lines being compared.
  "gratar" printed on six lines says almost nothing; "ceafa" printed on one says
  everything. Without this, "PUI LA GRATAR" and "CEAFA LA GRATAR" share
  two words in three.
- **Edit distance counts a swapped pair as one mistake**, not two. Names are
  four to six letters, where that single point decides everything: plain
  Levenshtein puts "bere" and "beer" as far apart as two different drinks.
- A **synonym table** covers what none of the above can reach — "mititei" for
  "mici", "AQUA" for "apa". It is a starting point. The real answer is a
  per-restaurant table learned from confirmed matches, so a place that prints
  "AQUA CARPATICA" for what everyone types as "apa plata" is told once.

**Some receipt lines are not something anybody ordered**, and adding them as
items would be wrong in both directions at once: service and tip already have
their own columns and would be counted twice, and a discount cannot be stored at
all — `unit_price_cents` is checked `>= 0`, because an item that costs less than
nothing is not a thing that was eaten. The SGR deposit is the one that surprises
people and is the most Romanian: 50 bani a bottle, its own printed line, and
real money on the split. It goes on the bill; it is only classified so it is
recognised rather than matched hopelessly against the drinks.

**Defaults are chosen by what they cost when wrong.** A line on the tab that the
receipt does not charge for is removed when nobody has claimed it — nobody loses
anything and the restaurant is not billing it — and kept when somebody has,
because removing it rewrites their share without them, and a line missing from
the paper is just as likely to be a line the scan missed. The same reasoning
refuses to trim a surplus unit when there are no unclaimed units to trim.

**Deciding and writing are separate, and the deciding is pure.** `plan.ts`
turns answered groups into a list of creates, updates and deletes;
`reconcile-service.ts` only sends them. That split exists because this is
where a claim gets lost if anything is wrong, and a function that merely
*returns* the writes can be run against a real table's rows and read before a
single one goes out. Deletes are sent first, so a row leaving and an identical
row arriving never briefly double the table.

**Nothing is ever deleted to make room.** Five beers becoming fifteen is five
updates and ten inserts, not eight deletes and fifteen inserts — the row George
had already ticked is the same row afterwards, renamed and repriced. Surplus
units are shed only from rows nobody claimed; when every one is claimed the
surplus stays and `keptClaimedSurplus` reports it, because the difference
belongs on the totals rather than quietly taken off a person.

Verified end to end against the live database on 2026-08-27, on a table at
Italien holding five typed "bere" (one claimed) and three "pornstar" (two
claimed), against a receipt reading `Beri Ursus 0.5 × 15` and
`PORN STAR MARTINI × 3`: the subtotal Postgres computed afterwards was 33000,
exactly the receipt, and all three claims survived.

**The printed name is adopted everywhere, agreement included.** A row typed
"pornstar" against a line printed "PORN STAR MARTINI" is the same drink at the
same price, and the name people will be checking against is the one on the
paper. So `agreed` means *the figures agree*, not *nothing is written*: such a
group emits a rename and nothing else. A row already named right is left alone
rather than written for nothing, and choosing "keep the tab" is a person saying
the receipt is wrong about that group — its name is not taken either.

`lib/reconcile/cases.ts` is the specification: every shape the two can disagree
in, and every write those answers turn into, as cases that run.

```bash
npm run check:reconcile
```

When a case fails, read the case before touching a threshold. The receipt
benchmark was once measuring its own bug, and an expectation bent to make the
code pass is the same mistake wearing different clothes.

**Known limits.** One typed line against a dish and its garnish printed apart
is surfaced for a human rather than merged. A second receipt for the same table
has nothing marking which items came from the first, so the two would be
reconciled against each other. `confirmed_total_cents` is written by nothing on
this path yet, which is where the few cents a non-dividing line total leaves
over should eventually land.

## Not built yet

Payments and https universal links.

Invitation links currently use the app's own scheme, which is not clickable in
messaging apps and does nothing for someone without the app installed. Making
invitations work for real needs a domain, universal links, and a web version
of the guest flow.
