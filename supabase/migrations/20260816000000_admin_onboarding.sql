-- ---------------------------------------------------------------------------
-- Admin onboarding state
--
-- Whether an admin has been through (or dismissed) the first-run tutorial.
-- It lives on the profile rather than on the device so signing in somewhere
-- else does not replay a tutorial the admin has already seen.
--
-- Guests have no profile row and no policy on this table, so the column is
-- unreachable for them by construction.
--
-- No grants are needed: profiles carries table-wide SELECT/UPDATE, which a new
-- column inherits. (A column-level grant would NOT be inherited — that trap is
-- why participants has its explicit column list.)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

comment on column public.profiles.onboarding_completed is
  'True once the admin has finished or skipped the first-run tutorial. Replaying from Settings does not clear it.';
