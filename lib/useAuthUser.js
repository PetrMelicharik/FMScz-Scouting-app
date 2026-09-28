"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// undefined = still resolving the session, null = logged out, object = user.
// Distinguishing "loading" from "logged out" matters here — components use
// it to avoid flashing a login form before the stored session has had a
// chance to load.
export function useAuthUser() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return user;
}
