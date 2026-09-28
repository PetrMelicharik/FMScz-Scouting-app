-- FM Scouts — shortlist feature schema.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).

create extension if not exists pgcrypto;

create table if not exists shortlist_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  player_id integer not null,       -- matches the player's _id (row index in players.json)
  player_name text,
  club text,
  league text,
  position text,
  photo_url text,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, player_id)
);

alter table shortlist_players enable row level security;

-- Each user can only ever see, add or remove their OWN rows — this is what
-- makes it safe to use the public "anon" key directly in the frontend.
drop policy if exists "select own shortlist" on shortlist_players;
create policy "select own shortlist" on shortlist_players
  for select using (auth.uid() = user_id);

drop policy if exists "insert own shortlist" on shortlist_players;
create policy "insert own shortlist" on shortlist_players
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete own shortlist" on shortlist_players;
create policy "delete own shortlist" on shortlist_players
  for delete using (auth.uid() = user_id);
