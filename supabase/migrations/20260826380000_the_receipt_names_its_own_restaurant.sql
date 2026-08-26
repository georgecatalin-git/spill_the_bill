-- ---------------------------------------------------------------------------
-- The receipt names its own restaurant, and the app checks
--
-- Choosing the restaurant from a picker is a claim, not a fact. Somebody
-- sitting in Sub Tâmpa can pick Italien and scan the Sub Tâmpa receipt, and
-- until now nothing contradicted them: the items land on an Italien table and
-- the scan's cost lands on Italien's figures, which are the figures the owner
-- area exists to make trustworthy.
--
-- Nothing on a phone can prove where its owner is standing. But the receipt
-- can, because it is a physical object printed by one particular business and
-- it carries that business's fiscal code. The proof was already in the photo;
-- it was simply being thrown away with the rest of the header.
--
-- So `restaurants` gains the fiscal code, `parse-receipt` reads the one on the
-- receipt, and the two are compared. The owner has that code anyway — Romanian
-- B2B invoicing runs through e-Factura, which cannot issue without it.
--
-- The comparison lives here rather than in the Edge Function, for the reason
-- everything else does: two implementations of "is this the same code" would
-- eventually disagree, and the database is where the answer belongs.
--
-- It refuses only on a *contradiction*. A code that could not be read, or a
-- restaurant whose code has not been recorded yet, is not evidence of anything
-- and lets the scan through — turning away a real receipt because the photo
-- was blurry is a worse failure than the one being prevented, and it happens
-- to honest people at a table waiting to go home.
-- ---------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists tax_id text
    check (tax_id is null or length(trim(tax_id)) > 0);

comment on column public.restaurants.tax_id is
  'The fiscal code printed on this restaurant''s receipts (CUI/CIF). Null until the owner records it, which only means scans here cannot be checked.';

-- `restaurants` carries table-wide SELECT/INSERT/UPDATE for `authenticated`,
-- so this column is readable and writable without a new grant. That is true of
-- this table and NOT of `participants` or `profiles`, both of which grant by
-- column — see the notes in AGENTS.md before copying this anywhere.

-- ---------------------------------------------------------------------------
-- One definition of "the same fiscal code"
--
-- Receipts print it a dozen ways: `CUI: RO 12345678`, `C.I.F. 12345678`,
-- `CIF:RO12345678`. The digits are the code; everything else is decoration,
-- including the country prefix. Keeping only digits also survives the OCR
-- reading a full stop as a comma, which is the common way this would otherwise
-- produce a false accusation.
-- ---------------------------------------------------------------------------

create or replace function public.normalise_tax_id(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '');
$$;

comment on function public.normalise_tax_id(text) is
  'A fiscal code reduced to its digits, so two spellings of the same code compare equal.';

revoke execute on function public.normalise_tax_id(text) from public, anon;
grant execute on function public.normalise_tax_id(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The verdict
--
-- Four answers, and only one of them refuses:
--
--   no_table  the table is not this admin's — the same refusal the pre-flight
--             check already makes, restated so a late change of table cannot
--             slip past
--   unknown   nothing to compare; the restaurant has no code recorded, or the
--             photo did not show one
--   ok        the codes match
--   mismatch  the receipt was printed by a different business
--
-- On a mismatch it also reports which restaurant the receipt actually belongs
-- to, when that is one of ours. "This receipt is from Sub Tâmpa" turns a
-- refusal into an instruction, and the honest version of this mistake — the
-- host picked the wrong line in the picker — is the common one.
-- ---------------------------------------------------------------------------

create or replace function public.check_scan_receipt(
  p_table_id uuid,
  p_admin_id uuid,
  p_receipt_tax_id text
)
returns table (verdict text, chosen_name text, receipt_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chosen public.restaurants%rowtype;
  v_receipt text;
begin
  select r.* into v_chosen
  from public.tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.id = p_table_id and t.admin_id = p_admin_id;

  if v_chosen.id is null then
    return query select 'no_table'::text, null::text, null::text;
    return;
  end if;

  v_receipt := public.normalise_tax_id(p_receipt_tax_id);

  if public.normalise_tax_id(v_chosen.tax_id) is null or v_receipt is null then
    return query select 'unknown'::text, v_chosen.name, null::text;
    return;
  end if;

  if public.normalise_tax_id(v_chosen.tax_id) = v_receipt then
    return query select 'ok'::text, v_chosen.name, v_chosen.name;
    return;
  end if;

  return query
    select
      'mismatch'::text,
      v_chosen.name,
      (select r2.name from public.restaurants r2
       where public.normalise_tax_id(r2.tax_id) = v_receipt
       limit 1);
end;
$$;

comment on function public.check_scan_receipt(uuid, uuid, text) is
  'Whether the receipt in front of the camera was printed by the restaurant the table says it is at.';

revoke execute on function public.check_scan_receipt(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.check_scan_receipt(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The owner's figures gain the fiscal code
--
-- Not a statistic: it is the field the owner fills in, and it belongs on the
-- card they already edit the name and the town on. A restaurant without one is
-- a restaurant whose scans nobody can check, which is worth seeing at a glance.
--
-- The return type changes, and Postgres will not replace a function whose OUT
-- parameters moved — it has to be dropped, which drops its grants with it.
-- ---------------------------------------------------------------------------

drop function if exists public.owner_restaurant_stats();

create function public.owner_restaurant_stats()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  tax_id text,
  is_active boolean,
  tables_total integer,
  tables_active integer,
  bills_completed integer,
  participants_total integer,
  last_activity_at timestamptz,
  scans_this_month integer,
  scan_cost_micros_this_month bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can read usage statistics.';
  end if;

  return query
    select
      r.id,
      r.name,
      r.city,
      r.tax_id,
      r.is_active,
      (select count(*) from public.tables t
        where t.restaurant_id = r.id)::integer,
      (select count(*) from public.tables t
        where t.restaurant_id = r.id and t.status <> 'COMPLETED')::integer,
      (select count(*) from public.bills b
        join public.tables t on t.id = b.table_id
        where t.restaurant_id = r.id and b.status = 'COMPLETED')::integer,
      (select count(*) from public.participants p
        join public.tables t on t.id = p.table_id
        where t.restaurant_id = r.id)::integer,
      greatest(
        (select max(t.updated_at) from public.tables t where t.restaurant_id = r.id),
        (select max(b.updated_at) from public.bills b
          join public.tables t on t.id = b.table_id
          where t.restaurant_id = r.id)
      ),
      (select count(*) from public.receipt_scans s
        where s.restaurant_id = r.id
          and s.created_at >= date_trunc('month', now()))::integer,
      coalesce((select sum(s.cost_micros) from public.receipt_scans s
        where s.restaurant_id = r.id
          and s.created_at >= date_trunc('month', now())), 0)::bigint
    from public.restaurants r
    order by r.name;
end;
$$;

comment on function public.owner_restaurant_stats() is
  'Per-restaurant usage counts for the owner. Refuses anyone else, and returns no money and no personal data.';

revoke execute on function public.owner_restaurant_stats() from public, anon;
grant execute on function public.owner_restaurant_stats() to authenticated;
