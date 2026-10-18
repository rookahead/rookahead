-- Rookahead accounts. Run in the Supabase SQL editor; safe to run again after changes.

create table if not exists public.user_stores (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key in ('settings', 'puzzles', 'games', 'reviews')),
  data jsonb not null check (pg_column_size(data) < 2000000),
  rev integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_stores enable row level security;

drop policy if exists "Own rows: read" on public.user_stores;
drop policy if exists "Own rows: insert" on public.user_stores;
drop policy if exists "Own rows: update" on public.user_stores;
drop policy if exists "Own rows: delete" on public.user_stores;
create policy "Own rows: read" on public.user_stores for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own rows: insert" on public.user_stores for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own rows: update" on public.user_stores for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own rows: delete" on public.user_stores for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_stores from anon;
grant select, insert, update, delete on public.user_stores to authenticated;

-- Deletes the signed-in user; their rows go with them (on delete cascade).
create or replace function public.delete_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- Usernames: one per account, unique ignoring case, fixed once chosen.
create table if not exists public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username text not null check (
    username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$'
    and lower(username) not in ('admin', 'administrator', 'rookahead', 'support', 'help', 'moderator', 'mod', 'staff', 'system', 'root', 'guest', 'anonymous', 'null', 'undefined', 'stockfish', 'computer', 'lichess', 'chesscom')
  ),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "Own profile: read" on public.profiles;
drop policy if exists "Own profile: create" on public.profiles;
create policy "Own profile: read" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Own profile: create" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);

revoke all on public.profiles from anon;
grant select, insert on public.profiles to authenticated;

-- Whether a username is free, for the sign-up form (anyone may ask; usernames will be public anyway).
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

grant execute on function public.username_available(text) to anon, authenticated;
