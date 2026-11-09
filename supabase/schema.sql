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

-- Usernames: one per account, unique ignoring case; changeable in Settings (see the grant below).
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

-- Profile photos: one small WebP per account at avatars/<user id>/avatar.webp (public, like usernames),
-- its address on the profile with ?v= so a new upload isn't served from caches.
alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or length(avatar_url) < 500);

drop policy if exists "Own profile: update" on public.profiles;
create policy "Own profile: update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
grant update (avatar_url) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatars: read own" on storage.objects;
drop policy if exists "Avatars: upload own" on storage.objects;
drop policy if exists "Avatars: replace own" on storage.objects;
drop policy if exists "Avatars: delete own" on storage.objects;
create policy "Avatars: read own" on storage.objects for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatars: upload own" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatars: replace own" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatars: delete own" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Settings → Profile: an account may rename itself (the same rules and uniqueness apply).
grant update (username) on public.profiles to authenticated;

-- "Report this verdict": anyone, signed in or not, may send one. Nobody can read them back through
-- the API; read them in the dashboard (Table Editor → verdict_reports).
create table if not exists public.verdict_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  fen text not null check (length(fen) < 100),
  move text not null check (move ~ '^[a-h][1-8][a-h][1-8][qrbn]?$'),
  san text not null check (length(san) < 10),
  verdict text not null check (length(verdict) < 20),
  opinion text not null check (opinion in ('harsh', 'generous', 'other')),
  note text not null default '' check (length(note) <= 500),
  start_fen text not null check (length(start_fen) < 100),
  moves text not null check (length(moves) < 4000),
  side_line boolean not null default false,
  depth smallint not null check (depth between 1 and 40),
  engine text not null check (engine in ('full', 'lite')),
  review jsonb not null default '{}' check (pg_column_size(review) < 2000),
  build text check (length(build) < 20)
);
create index if not exists verdict_reports_created_at on public.verdict_reports (created_at);

alter table public.verdict_reports enable row level security;

drop policy if exists "Anyone: send" on public.verdict_reports;
create policy "Anyone: send" on public.verdict_reports for insert to anon, authenticated with check (user_id is null or user_id = (select auth.uid()));

revoke all on public.verdict_reports from anon, authenticated;
grant insert on public.verdict_reports to anon, authenticated;

-- A ceiling on reports per hour, so a script can't fill the database.
create or replace function public.verdict_reports_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.verdict_reports where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many reports right now' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists verdict_reports_limit on public.verdict_reports;
create trigger verdict_reports_limit before insert on public.verdict_reports for each row execute function public.verdict_reports_limit();

-- Usage log: what signed-in accounts do, so we can see who comes back. One row per event: who, what,
-- when, and on what (app, phone or desktop). Never moves, games or anything typed. Accounts may add
-- their own rows but nobody can read them through the API; read them in the dashboard, through the
-- views in the `stats` schema below (SQL editor: select * from stats.opens_per_day).
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  event text not null check (event in ('open', 'review_start', 'review_done', 'puzzle_solved', 'explain', 'bot_game')),
  detail text not null default '' check (detail ~ '^[a-z0-9-]{0,20}$'),
  platform text not null check (platform in ('app', 'phone', 'desktop'))
);
create index if not exists usage_events_user_at on public.usage_events (user_id, at);
create index if not exists usage_events_at on public.usage_events (at);

alter table public.usage_events enable row level security;

drop policy if exists "Own rows: add" on public.usage_events;
create policy "Own rows: add" on public.usage_events for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.usage_events from anon, authenticated;
grant insert on public.usage_events to authenticated;

-- A ceiling per account, so one script can't fill the table: rows past 300 an hour are dropped quietly.
create or replace function public.usage_events_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.usage_events where user_id = new.user_id and at > now() - interval '1 hour') >= 300 then
    return null;
  end if;
  new.at := now();
  return new;
end;
$$;

drop trigger if exists usage_events_limit on public.usage_events;
create trigger usage_events_limit before insert on public.usage_events for each row execute function public.usage_events_limit();

-- Read-outs for the dashboard. The `stats` schema isn't served by the API, so only the dashboard sees them.
-- Days are counted in India time.
create schema if not exists stats;
revoke all on schema stats from public, anon, authenticated;

-- Per day: how many accounts opened the app, how many opens, and what got done.
create or replace view stats.opens_per_day as
select
  (at at time zone 'Asia/Kolkata')::date as day,
  count(distinct user_id) filter (where event = 'open') as people,
  count(*) filter (where event = 'open') as opens,
  count(*) filter (where event = 'review_done') as reviews,
  count(*) filter (where event = 'puzzle_solved') as puzzles,
  count(*) filter (where event = 'explain') as explains,
  count(*) filter (where event = 'bot_game') as bot_games
from public.usage_events
group by 1
order by 1 desc;

-- Per account: when they first and last showed up, on how many days, and what they do.
create or replace view stats.per_user as
select
  coalesce(p.username, u.email) as who,
  min(e.at) as first_seen,
  max(e.at) as last_seen,
  count(distinct (e.at at time zone 'Asia/Kolkata')::date) as days,
  count(*) filter (where e.event = 'open') as opens,
  count(*) filter (where e.event = 'review_start') as reviews_started,
  count(*) filter (where e.event = 'review_done') as reviews_done,
  count(*) filter (where e.event = 'puzzle_solved') as puzzles,
  count(*) filter (where e.event = 'explain') as explains,
  count(*) filter (where e.event = 'bot_game') as bot_games,
  string_agg(distinct e.platform, ', ') as platforms
from public.usage_events e
join auth.users u on u.id = e.user_id
left join public.profiles p on p.id = e.user_id
group by e.user_id, p.username, u.email
order by last_seen desc;

-- Everything, newest first, with names: for looking at one person's visits.
create or replace view stats.recent as
select (e.at at time zone 'Asia/Kolkata') as at_ist, coalesce(p.username, u.email) as who, e.event, e.detail, e.platform
from public.usage_events e
join auth.users u on u.id = e.user_id
left join public.profiles p on p.id = e.user_id
order by e.at desc;

-- Public profiles: off until you turn it on (Profile → Make public), and only what the page shows is here:
-- your app copies your ratings and counts in as they change. Your username, photo and joined date come
-- from `profiles`; nobody reads either table directly, only the public_profile() function below. Turning
-- it off deletes your row.
create table if not exists public.public_profiles (
  id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  stats jsonb not null default '{}' check (jsonb_typeof(stats) = 'object' and pg_column_size(stats) < 2000),
  updated_at timestamptz not null default now()
);

alter table public.public_profiles enable row level security;

drop policy if exists "Own row: read" on public.public_profiles;
drop policy if exists "Own row: create" on public.public_profiles;
drop policy if exists "Own row: update" on public.public_profiles;
drop policy if exists "Own row: delete" on public.public_profiles;
create policy "Own row: read" on public.public_profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Own row: create" on public.public_profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Own row: update" on public.public_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Own row: delete" on public.public_profiles for delete to authenticated using ((select auth.uid()) = id);

revoke all on public.public_profiles from anon, authenticated;
grant select, insert, update, delete on public.public_profiles to authenticated;

-- A public profile by username (any case), for anyone; nothing for a username that isn't public.
create or replace function public.public_profile(name text)
returns table (username text, avatar_url text, joined timestamptz, stats jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.avatar_url, p.created_at, pp.stats, pp.updated_at
  from public.profiles p
  join public.public_profiles pp on pp.id = p.id
  where lower(p.username) = lower(name);
$$;

revoke execute on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;

-- "Report this profile": anyone may send one, about a public profile's name or photo. Nobody can read them
-- back through the API; read them in the dashboard (Table Editor → profile_reports).
create table if not exists public.profile_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  username text not null check (length(username) <= 20),
  reason text not null check (reason in ('name', 'photo', 'other')),
  note text not null default '' check (length(note) <= 500)
);
create index if not exists profile_reports_created_at on public.profile_reports (created_at);

alter table public.profile_reports enable row level security;

drop policy if exists "Anyone: send" on public.profile_reports;
create policy "Anyone: send" on public.profile_reports for insert to anon, authenticated with check (user_id is null or user_id = (select auth.uid()));

revoke all on public.profile_reports from anon, authenticated;
grant insert on public.profile_reports to anon, authenticated;

-- A ceiling on reports per hour, so a script can't fill the database.
create or replace function public.profile_reports_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.profile_reports where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many reports right now' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_reports_limit on public.profile_reports;
create trigger profile_reports_limit before insert on public.profile_reports for each row execute function public.profile_reports_limit();
-- Only the trigger runs it: not callable through the API.
revoke execute on function public.profile_reports_limit() from public, anon, authenticated;
