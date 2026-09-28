import { createClient } from "@supabase/supabase-js";

// Public by design — the anon key is meant to be exposed in the browser
// bundle and is safe to commit because every table it can reach is locked
// down by Row Level Security policies (see supabase/shortlist.sql): a
// logged-in user can only ever see/insert/delete their OWN rows. The
// service_role key (full admin access, bypasses RLS) must never go here or
// anywhere in the frontend.
const SUPABASE_URL = "https://bdllfryuancwalzgdhwz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkbGxmcnl1YW5jd2FsemdkaHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTI2NjAsImV4cCI6MjEwNjE4ODY2MH0.chGdAKHtC12bVO5FvEqaNpKTdssKZkVvH1lfJFcPQLs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
