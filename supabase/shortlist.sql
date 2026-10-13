-- FM Scouts — shortlist feature schema.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).

create extension if not exists pgcrypto;

create table if not exists shortlist_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  player_id integer not null,       -- row index in players.json at the time of adding (informational only — it shifts on db updates)
  player_key text,                  -- stable identity: normalized name + date of birth (see lib/normalize.js)
  player_name text,
  club text,
  league text,
  position text,
  photo_url text,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists shortlist_players_user_key_idx
  on shortlist_players (user_id, player_key)
  where player_key is not null;

alter table shortlist_players enable row level security;

-- Each user can only ever see, add or remove their OWN rows — this is what
-- makes it safe to use the public "anon" key directly in the frontend.
drop policy if exists "select own shortlist" on shortlist_players;
create policy "select own shortlist" on shortlist_players
  for select using (auth.uid() = user_id);

drop policy if exists "insert own shortlist" on shortlist_players;
create policy "insert own shortlist" on shortlist_players
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own shortlist" on shortlist_players;
create policy "update own shortlist" on shortlist_players
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own shortlist" on shortlist_players;
create policy "delete own shortlist" on shortlist_players
  for delete using (auth.uid() = user_id);
