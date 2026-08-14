-- Keeps the receipt photo, so "I never ordered the wine" has an answer.
--
-- The photo is read once today and thrown away. Storing it turns the receipt
-- into the evidence it already claims to be: the single source of truth the
-- rest of this app is built around stays checkable after the meal, by the
-- people who were there.
--
-- The bucket is PRIVATE, and that is not paranoia. A restaurant receipt shows
-- the table, the time, what was eaten, sometimes the last four digits of a
-- card. A public bucket makes every one of those readable by anyone who
-- guesses a URL, forever. Access is granted per request instead, as a signed
-- link that expires.
--
-- Guests are the interesting case. Storage policies are evaluated against the
-- caller's account, and a guest has no account — so a policy cannot tell "a
-- guest at this table" from "any anonymous caller on the internet". They are
-- served by the `receipt-url` Edge Function instead, which resolves their
-- session token the same way every other guest read does and only then mints a
-- short-lived link.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

alter table public.bills
  add column if not exists receipt_path text;

comment on column public.bills.receipt_path is
  'Object path in the private `receipts` bucket, or null when no photo was kept. Never a URL — links are signed per request and expire.';

/**
 * Whether the caller owns the bill a receipt object belongs to.
 *
 * Objects are stored as `<bill_id>/<name>.jpg`, so the first path segment
 * identifies the bill. The cast is guarded: a malformed path must answer
 * "no", not raise — a policy that throws is a policy that fails open or
 * breaks unrelated writes, depending on where it is evaluated.
 */
create or replace function public.owns_receipt_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bill_id uuid;
begin
  begin
    v_bill_id := (storage.foldername(p_object_name))[1]::uuid;
  exception
    when others then
      return false;
  end;

  return public.is_bill_admin(v_bill_id);
end;
$$;

revoke execute on function public.owns_receipt_object(text) from public, anon;
grant execute on function public.owns_receipt_object(text) to authenticated;

-- The admin uploads and reads their own tables' receipts directly. Guests
-- reach nothing here; they go through the Edge Function.
drop policy if exists "Admins upload receipts for their bills" on storage.objects;
create policy "Admins upload receipts for their bills"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.owns_receipt_object(name));

drop policy if exists "Admins read receipts for their bills" on storage.objects;
create policy "Admins read receipts for their bills"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.owns_receipt_object(name));

drop policy if exists "Admins replace receipts for their bills" on storage.objects;
create policy "Admins replace receipts for their bills"
  on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.owns_receipt_object(name));

drop policy if exists "Admins delete receipts for their bills" on storage.objects;
create policy "Admins delete receipts for their bills"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.owns_receipt_object(name));

/**
 * The receipt photo for this guest's table, or null when there is none.
 *
 * Returns the storage path, not a link. Turning that into something a phone
 * can load needs the service key, which lives only in the Edge Function —
 * the path on its own grants nothing.
 */
create or replace function public.get_guest_receipt_path(p_session_token text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
  v_path text;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  select b.receipt_path into v_path
  from public.bills b
  where b.table_id = v_participant.table_id
  order by b.created_at
  limit 1;

  return v_path;
end;
$$;

revoke execute on function public.get_guest_receipt_path(text) from public;
grant execute on function public.get_guest_receipt_path(text) to anon, authenticated;

-- Deliberately no trigger to clean the object up when a bill is deleted.
--
-- The obvious version — `delete from storage.objects` in an after-delete
-- trigger — is wrong twice over. Supabase guards those tables with
-- `storage.protect_delete`, so the statement raises and takes the bill's
-- deletion down with it; and even forcing past the guard would only remove
-- Postgres's record of the file while the bytes stay in the bucket, which is
-- precisely the orphan the guard exists to prevent.
--
-- Photos are removed through the Storage API instead, by the side that owns
-- the session: `receipt-photo-service.ts` drops the previous object whenever
-- a receipt is replaced. Nothing deletes tables in this app yet; when that
-- arrives it must remove the photo through the same API before deleting the
-- row, and this comment is here so the next person does not reach for the
-- trigger that looks like it should work.
