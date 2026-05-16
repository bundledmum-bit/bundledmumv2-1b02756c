import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { analytics } from "@/lib/ga";

/**
 * Customer-facing GA4 auth instrumentation.
 *
 * - Pushes user_id to the dataLayer on initial mount when a Supabase
 *   session already exists, AND on subsequent SIGNED_IN events.
 * - Fires `login` (always) and `sign_up` (when the auth user was created
 *   within the last 60s) on SIGNED_IN.
 * - Fires `logout` and clears user_id on SIGNED_OUT.
 *
 * Admin / employee-portal sessions are explicitly excluded — the
 * pathname guard skips any /admin or /employee-portal route. This
 * matches the original spec: GA4 customer-funnel events should never
 * include admin activity.
 *
 * All calls wrapped in try/catch so analytics never breaks auth.
 */
export default function AuthAnalyticsListener() {
  // Refs survive re-mounts and prevent duplicate login/sign_up firing
  // when Supabase emits multiple SIGNED_IN events for the same session.
  const lastSignedInUserRef = useRef<string | null>(null);
  const initialSessionAppliedRef = useRef(false);

  useEffect(() => {
    const isCustomerContext = () => {
      if (typeof window === "undefined") return true;
      const path = window.location.pathname || "";
      return !path.startsWith("/admin") && !path.startsWith("/employee-portal");
    };

    const safe = (fn: () => void) => { try { fn(); } catch { /* ignore */ } };

    // 1) Hydrate user_id from an existing session on app mount.
    supabase.auth.getSession().then(({ data }) => {
      if (initialSessionAppliedRef.current) return;
      initialSessionAppliedRef.current = true;
      const userId = data.session?.user?.id;
      if (!userId) return;
      if (!isCustomerContext()) return;
      safe(() => analytics.push({ user_id: userId }));
    });

    // 2) React to auth state changes.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isCustomerContext()) return;

      if (event === "SIGNED_IN" && session?.user) {
        const userId = session.user.id;
        // Dedup: Supabase fires SIGNED_IN repeatedly (token refresh, tab
        // focus) for the same user. Only emit login/sign_up once per user.
        if (lastSignedInUserRef.current === userId) {
          // Still set user_id again (cheap, idempotent).
          safe(() => analytics.push({ user_id: userId }));
          return;
        }
        lastSignedInUserRef.current = userId;
        safe(() => analytics.push({ user_id: userId }));
        safe(() => analytics.push({ event: "login", method: "magic_link" }));

        // sign_up: detect first-time account by checking auth.user.created_at
        // within the last 60s. Magic-link flow creates the auth user on
        // first verification, so this window catches it reliably.
        const createdAt = session.user.created_at ? new Date(session.user.created_at) : null;
        if (createdAt && !Number.isNaN(createdAt.getTime())) {
          const isNew = Date.now() - createdAt.getTime() < 60_000;
          if (isNew) {
            safe(() => analytics.push({ event: "sign_up", method: "magic_link" }));
          }
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        lastSignedInUserRef.current = null;
        safe(() => analytics.push({ event: "logout" }));
        safe(() => analytics.push({ user_id: null }));
      }
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return null;
}
