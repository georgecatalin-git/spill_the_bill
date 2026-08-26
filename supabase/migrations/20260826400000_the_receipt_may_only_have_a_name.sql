-- ---------------------------------------------------------------------------
-- When the receipt has no fiscal code, the name is the next best witness
--
-- The previous migration compared fiscal codes, and a Romanian *bon fiscal* is
-- required by law to carry one. But the paper people actually photograph is
-- often the *nota de plată* — the pre-bill the waiter brings first, which is
-- not a fiscal document and frequently prints nothing but the restaurant's
-- name. Sometimes not even that.
--
-- So the name becomes the fallback witness, under a rule that never guesses:
--
--   refuse only when the receipt positively identifies a DIFFERENT restaurant
--   that is already on the list.
--
-- That is the whole safety property. A name we do not recognise proves
-- nothing — it may well be the legal entity behind the chosen restaurant,
-- "GASTRO INVEST SRL" on the receipt for the place everyone calls Italien — so
-- it lets the scan through. Only a name that resolves to a restaurant the
-- owner has entered, and that is not the one the table says it is at, is
-- evidence.
--
-- And it must resolve to exactly ONE. A chain defeats this otherwise: "Loft"
-- is both Loft Cluj and Loft București, the unique index allows precisely that,
-- and a receipt saying LOFT would otherwise be read as proof that a table at
-- one branch is holding the other branch's receipt. Ambiguous is not evidence.
--
-- The fiscal code still wins whenever both sides have one. It is exact; the
-- name is a heuristic wearing a safety rail.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- One definition of "the same business name"
--
-- Deliberately conservative. Stripping more — dropping words like "restaurant"
-- or "pizzeria" — would make two different places normalise to the same string,
-- and a collision here does not cause a missed catch, it causes a false
-- accusation against somebody holding a real receipt.
--
-- `unaccent` is not installed on this project and would be an extension for
-- one line, so the Romanian diacritics are translated by hand. Both encodings
-- of ș and ț are covered: the comma-below characters and the older
-- cedilla ones, which is what many receipt printers still emit.
-- ---------------------------------------------------------------------------

create or replace function public.normalise_business_name(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(translate(coalesce(p_value, ''), 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststAAISTST')),
            '[^a-z0-9]+', ' ', 'g'
          ),
          -- Legal forms carry no identity: the same place prints "SC LOFT SRL"
          -- on the fiscal receipt and "Loft" on the pre-bill.
          '\y(sc|srl|srld|sa|pfa|ii|snc|scs)\y', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function public.normalise_business_name(text) is
  'A business name reduced to comparable form. Conservative on purpose: over-stripping would make two real places collide and accuse an honest customer.';

revoke execute on function public.normalise_business_name(text) from public, anon;
grant execute on function public.normalise_business_name(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The verdict, now reading both witnesses
-- ---------------------------------------------------------------------------

drop function if exists public.check_scan_receipt(uuid, uuid, text);

create or replace function public.check_scan_receipt(
  p_table_id uuid,
  p_admin_id uuid,
  p_receipt_tax_id text,
  p_receipt_name text
)
returns table (verdict text, chosen_name text, receipt_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chosen public.restaurants%rowtype;
  v_tax text;
  v_name text;
  v_named public.restaurants%rowtype;
  v_matches integer;
begin
  select r.* into v_chosen
  from public.tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.id = p_table_id and t.admin_id = p_admin_id;

  if v_chosen.id is null then
    return query select 'no_table'::text, null::text, null::text;
    return;
  end if;

  v_tax := public.normalise_tax_id(p_receipt_tax_id);
  v_name := public.normalise_business_name(p_receipt_name);

  -- 1. The fiscal code, when both sides have one. Exact, and it decides.
  if v_tax is not null and public.normalise_tax_id(v_chosen.tax_id) is not null then
    if public.normalise_tax_id(v_chosen.tax_id) = v_tax then
      return query select 'ok'::text, v_chosen.name, v_chosen.name;
    else
      return query
        select 'mismatch'::text, v_chosen.name,
          coalesce(
            (select r2.name from public.restaurants r2
             where public.normalise_tax_id(r2.tax_id) = v_tax limit 1),
            nullif(trim(coalesce(p_receipt_name, '')), '')
          );
    end if;
    return;
  end if;

  -- 2. A code we have never seen, on a restaurant whose code is not recorded,
  --    is not evidence of anything. Fall through to the name.
  if v_name is null then
    return query select 'unknown'::text, v_chosen.name, null::text;
    return;
  end if;

  -- 3. The receipt names the restaurant we are sitting at. Good enough.
  if v_name = public.normalise_business_name(v_chosen.name) then
    return query select 'ok'::text, v_chosen.name, v_chosen.name;
    return;
  end if;

  -- 4. Does the name resolve to exactly one OTHER restaurant on the list?
  --    Exactly one, because a chain shares a name across towns and an
  --    ambiguous answer is not proof.
  select count(*) into v_matches
  from public.restaurants r2
  where public.normalise_business_name(r2.name) = v_name;

  if v_matches = 1 then
    select r2.* into v_named
    from public.restaurants r2
    where public.normalise_business_name(r2.name) = v_name;

    if v_named.id <> v_chosen.id then
      return query select 'mismatch'::text, v_chosen.name, v_named.name;
      return;
    end if;
  end if;

  -- 5. A name we do not recognise. It may well be the legal entity behind the
  --    restaurant everyone calls something shorter, so it proves nothing and
  --    the scan goes through.
  return query select 'unknown'::text, v_chosen.name, null::text;
end;
$$;

comment on function public.check_scan_receipt(uuid, uuid, text, text) is
  'Whether the receipt was printed by the restaurant the table says it is at. Refuses only on positive evidence of a different, known restaurant.';

revoke execute on function public.check_scan_receipt(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.check_scan_receipt(uuid, uuid, text, text) to service_role;
