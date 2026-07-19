import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export function useAdmin() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Admin status is resolved via the is_admin() RPC (source of truth: a row in
  // admin_users with is_active = true), NOT merely the presence of a session.
  // We keep the checked userId alongside the result so a result computed for a
  // previous session reads as "not yet resolved" - that closes the brief window
  // where a logged-in user could otherwise be treated as admin before the check.
  const [adminCheck, setAdminCheck] = useState<{ userId: string | null; isAdmin: boolean } | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;
  useEffect(() => {
    // No session means definitively not an admin, with nothing in flight.
    if (!userId) {
      setAdminCheck({ userId: null, isAdmin: false });
      return;
    }
    let active = true;
    supabase.rpc("is_admin").then(({ data, error }) => {
      if (!active) return;
      // Fail closed: an RPC error or any non-true result is treated as not admin.
      setAdminCheck({ userId, isAdmin: !error && data === true });
    });
    return () => { active = false; };
  }, [userId]);

  // Only trust an admin result that was computed for the current user.
  const isAdminResolved = adminCheck !== null && adminCheck.userId === userId;
  const isAdmin = isAdminResolved ? adminCheck.isAdmin : false;
  const isAdminLoading = loading || !isAdminResolved;

  return {
    session,
    user: session?.user ?? null,
    isAdmin,
    isAdminLoading,
    loading,
    signIn: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    signUp: async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
}
