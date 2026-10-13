-- FM Scouts — shortlist update v2: stable player identity.
-- Run ONCE in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run. Your existing shortlist rows are kept — nothing is deleted.
--
-- Why: player_id was the player's row number in players.json, which shifts
-- whenever new players are added to db.xlsx, so the shortlist started
-- pointing at different players. player_key (name + date of birth) doesn't
-- change between database updates.

-- 1) New column for the stable key.
alter table shortlist_players add column if not exists player_key text;

-- 2) player_id is only informational now (row numbers change), so it must
--    no longer be unique — otherwise adding a new player whose current row
--    number equals an old, stale player_id would fail.
alter table shortlist_players drop constraint if exists shortlist_players_user_id_player_id_key;

-- 3) Each person at most once per user.
create unique index if not exists shortlist_players_user_key_idx
  on shortlist_players (user_id, player_key)
  where player_key is not null;

-- 4) Allow users to UPDATE their own rows — the app uses this to fill in
--    player_key on older entries automatically (and for notes later).
drop policy if exists "update own shortlist" on shortlist_players;
create policy "update own shortlist" on shortlist_players
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
