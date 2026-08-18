-- =====================================================================
-- Birthday Countdown — shared wishes
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New
-- query → paste → Run). It is safe to run more than once.
--
-- The key thing to understand: the anon key that ships in the page is
-- public by design. Anyone can read it out of the JavaScript. So nothing
-- here relies on the key being secret — the rules below are what actually
-- stop a stranger deleting your wishes, and they are enforced by Postgres,
-- not by the page.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------

create table if not exists public.birthdays (
  id          text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  name        text not null    check (char_length(name) between 1 and 40),
  date        date not null    check (date > date '1900-01-01' and date < date '2100-01-01'),
  hue         int              check (hue >= 0 and hue < 360),

  -- The secret that proves you are the person who made this link. It is
  -- generated in the creator's browser, kept in their localStorage, and
  -- never appears in the URL. Note the column grants further down: anon
  -- can INSERT this column but cannot SELECT it, so it goes in and never
  -- comes back out.
  owner_key   text not null    check (char_length(owner_key) between 16 and 64),

  created_at  timestamptz not null default now()
);

create table if not exists public.wishes (
  id           uuid primary key default gen_random_uuid(),
  birthday_id  text not null references public.birthdays(id) on delete cascade,
  who          text not null check (char_length(who) between 1 and 40),
  word         text not null check (char_length(word) between 1 and 18),
  message      text          check (char_length(message) <= 240),
  emoji        text          check (char_length(emoji) <= 8),
  created_at   timestamptz not null default now()
);

create index if not exists wishes_birthday_idx
  on public.wishes (birthday_id, created_at desc);

-- The length limits above are deliberately the same numbers as the maxlength
-- attributes in index.html. The page enforces them so typing feels right; the
-- database enforces them so a script that skips the page cannot ignore them.

-- ---------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------

alter table public.birthdays enable row level security;
alter table public.wishes    enable row level security;

drop policy if exists "read any birthday"   on public.birthdays;
drop policy if exists "create a birthday"   on public.birthdays;
drop policy if exists "read any wish"       on public.wishes;
drop policy if exists "add a wish"          on public.wishes;

create policy "read any birthday" on public.birthdays for select using (true);
create policy "create a birthday" on public.birthdays for insert with check (true);
create policy "read any wish"     on public.wishes    for select using (true);
create policy "add a wish"        on public.wishes    for insert with check (true);

-- There is deliberately no UPDATE or DELETE policy on either table. With RLS
-- on, anything without a policy is refused, so the only way a row can be
-- deleted is the function below — which checks the owner key first.

-- ---------------------------------------------------------------------
-- column privileges
-- ---------------------------------------------------------------------

revoke all on public.birthdays from anon, authenticated;
revoke all on public.wishes    from anon, authenticated;

grant select (id, name, date, hue, created_at)
  on public.birthdays to anon, authenticated;
grant insert (id, name, date, hue, owner_key)
  on public.birthdays to anon, authenticated;

grant select (id, birthday_id, who, word, message, emoji, created_at)
  on public.wishes to anon, authenticated;
grant insert (birthday_id, who, word, message, emoji)
  on public.wishes to anon, authenticated;

-- ---------------------------------------------------------------------
-- deleting a wish: only the person who made the link
-- ---------------------------------------------------------------------

create or replace function public.delete_wish(p_wish_id uuid, p_owner_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists (
    select 1
    from public.wishes w
    join public.birthdays b on b.id = w.birthday_id
    where w.id = p_wish_id
      and b.owner_key = p_owner_key
  ) into allowed;

  if not allowed then
    return false;             -- wrong key, or no such wish: say no, say nothing else
  end if;

  delete from public.wishes where id = p_wish_id;
  return true;
end;
$$;

revoke all on function public.delete_wish(uuid, text) from public;
grant execute on function public.delete_wish(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- what this does NOT do
-- ---------------------------------------------------------------------
-- There is no rate limiting here. Postgres alone cannot do it well, and
-- anyone with the anon key can post wishes as fast as they like. For a
-- birthday link passed round a group chat that is fine. If a link ever gets
-- spammed, the fix is to delete the row — `delete from public.birthdays
-- where id = '<the id>'` — which takes its wishes with it.
