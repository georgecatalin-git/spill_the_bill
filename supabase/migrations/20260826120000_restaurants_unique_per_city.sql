-- ---------------------------------------------------------------------------
-- The same restaurant name in two different cities
--
-- The first version of this list keyed uniqueness on the name alone, which
-- silently assumed no two places ever share one. They do: a chain has a "Loft"
-- in Cluj and a "Loft" in Bucharest, and the second one was refused as a
-- duplicate of the first.
--
-- Uniqueness is now the pair — name AND city. "Loft, Cluj" and "Loft,
-- Bucharest" are two places; a second "Loft, Cluj" is still the duplicate the
-- list exists to prevent.
--
-- A missing city collapses to '' rather than NULL, deliberately: in a unique
-- index NULLs do not equal each other, so two nameless-city rows with the same
-- name would both be accepted and the guarantee would leak exactly where it is
-- needed. Every existing row predates the city field, which is why the column
-- stays nullable for now.
-- ---------------------------------------------------------------------------

drop index if exists public.restaurants_name_key;

create unique index if not exists restaurants_name_city_key
  on public.restaurants (lower(trim(name)), lower(trim(coalesce(city, ''))));

comment on column public.restaurants.city is
  'Which town this branch is in. Part of what makes a restaurant unique — see restaurants_name_city_key.';
