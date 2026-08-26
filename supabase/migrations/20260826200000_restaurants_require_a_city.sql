-- ---------------------------------------------------------------------------
-- The city stops being optional
--
-- Uniqueness is the name AND the city, so a nameless city is a hole in the
-- guarantee: NULLs are not equal to each other in a unique index, and the
-- index works around that by collapsing a missing city to ''. That works, but
-- it means two rows can still look identical to a person while differing to
-- Postgres — "Loft" with no city and "Loft, Cluj" are the same place typed
-- twice, and nothing catches it.
--
-- The column was left nullable only because the rows backfilled from the old
-- free-text field predated it. Those rows are gone, every remaining restaurant
-- has a city, and the form has required one since it was written. So the
-- column can finally say what the app already means.
--
-- The default is deliberately absent: a city has to be a real answer, not a
-- blank one that passes NOT NULL. The check enforces that.
-- ---------------------------------------------------------------------------

update public.restaurants
  set city = 'Unknown'
  where city is null or trim(city) = '';

alter table public.restaurants
  alter column city set not null;

alter table public.restaurants
  drop constraint if exists restaurants_city_not_blank;

alter table public.restaurants
  add constraint restaurants_city_not_blank check (length(trim(city)) > 0);

comment on column public.restaurants.city is
  'Which town this branch is in. Required, and half of what makes a restaurant unique — see restaurants_name_city_key.';
