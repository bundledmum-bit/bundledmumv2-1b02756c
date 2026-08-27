import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import logoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";

/**
 * AUDIENCE CHOOSER — a one-screen "which of three things did you come for?"
 * overlay shown ONLY to visitors who land directly on the storefront homepage
 * ("/") by typing the domain / a bookmark, or from an organic search result.
 *
 * It is deliberately gated hard so it NEVER interferes with paid traffic or
 * internal navigation:
 *   - only when the LANDING path was "/" (captured once at page load, so
 *     clicking the logo/Home later can never trigger it — internal SPA
 *     navigation does not change ENTRY)
 *   - only when the landing URL carried NO ad/referral params
 *     (fbclid, gclid, utm_source, utm_medium, utm_campaign, ref)
 *   - only when the referrer was empty (typed/bookmark) or a search engine
 *   - only once per session (guests: sessionStorage) or ever (signed-in
 *     customers: customers.audience_preference via the set_audience_preference
 *     RPC)
 *
 * It fires NO pixel events and fetches NO data before painting for guests, so
 * it appears instantly rather than as a loading wall.
 */

const SESSION_KEY = "bm_audience_choice";

// Snapshot the TRUE entry state once, at module load. This is what makes
// "first landing, not internal navigation" reliable: the module initialises
// exactly once per full page load; later client-side route changes (logo,
// Home link) never re-run this, so ENTRY keeps describing how the visitor
// actually arrived.
const ENTRY = {
  path: typeof window !== "undefined" ? window.location.pathname : "",
  search: typeof window !== "undefined" ? window.location.search : "",
  referrer: typeof document !== "undefined" ? document.referrer : "",
};

const AD_PARAMS = ["fbclid", "gclid", "utm_source", "utm_medium", "utm_campaign", "ref"];
const SEARCH_ENGINE_HOSTS = ["google.", "bing.", "yahoo.", "duckduckgo.", "ecosia."];

function hasAdParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return AD_PARAMS.some((k) => params.has(k));
}

function referrerIsDirectOrSearch(referrer: string): boolean {
  if (!referrer) return true; // typed / bookmark
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return SEARCH_ENGINE_HOSTS.some((s) => host.includes(s));
  } catch {
    return false;
  }
}

/**
 * Synchronous eligibility from the immutable ENTRY snapshot + sessionStorage.
 * Everything here is instant (no network), so a guest sees the chooser paint
 * on first frame. The signed-in cross-session check is layered on top, async.
 */
function syncEligible(): boolean {
  if (ENTRY.path !== "/") return false;
  if (hasAdParams(ENTRY.search)) return false;
  if (!referrerIsDirectOrSearch(ENTRY.referrer)) return false;
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
  } catch {
    /* private mode — treat as not-yet-chosen */
  }
  return true;
}

type Choice = "new" | "used" | "sell";

export default function AudienceChooser() {
  const { user, loading: authLoading } = useCustomerAuth();
  // Decide eligibility ONCE, from the entry snapshot. useState initialiser runs
  // a single time, so remounts (theme, etc.) can't re-trigger the overlay.
  const [eligible] = useState<boolean>(syncEligible);
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;

    // Guest → show immediately. Signed-in → only after confirming they have
    // no saved preference, so a returning customer never sees a flash.
    if (authLoading) return; // wait for auth to resolve before deciding
    if (!user) {
      setOpen(true);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("customers")
          .select("audience_preference")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data?.audience_preference) {
          // Already chose on a previous visit — remember for this session too
          // and never show.
          try { sessionStorage.setItem(SESSION_KEY, data.audience_preference); } catch { /* ignore */ }
          return;
        }
        setOpen(true);
      } catch {
        // If the lookup fails, fall back to showing it (a signed-in cold
        // organic visitor still deserves the chooser); the session guard stops
        // it repeating once they choose.
        if (!cancelled) setOpen(true);
      }
    })();

    return () => { cancelled = true; };
  }, [eligible, authLoading, user]);

  if (!eligible || !open) return null;

  const remember = (choice: Choice) => {
    try { sessionStorage.setItem(SESSION_KEY, choice); } catch { /* ignore */ }
    // Persist for signed-in customers across sessions (fire-and-forget; the
    // overlay closes/navigates immediately regardless of the result).
    if (user) {
      supabase.rpc("set_audience_preference", { p_choice: choice }).then(
        () => {},
        () => {},
      );
    }
  };

  const choose = (choice: Choice) => {
    remember(choice);
    if (choice === "used") {
      // Full-page navigation: the marketplace is a separate app tree selected
      // from window.location at mount, so the client router cannot reach it.
      window.location.assign("/marketplace");
    } else if (choice === "sell") {
      window.location.assign("/marketplace/sell");
    } else {
      // "new" — stay on the storefront homepage, just dismiss.
      setOpen(false);
    }
  };

  const justBrowsing = () => {
    // Treat "just browsing" as choosing the storefront so it does not reappear
    // this session.
    remember("new");
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What did you come for?"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "#FFF8F4",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        overflowY: "auto",
        fontFamily: "'Nunito', system-ui, -apple-system, Arial, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <img src={logoGreen} alt="BundledMum" style={{ height: 44, width: "auto", marginBottom: 20 }} />
        <h1
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: 22,
            lineHeight: 1.3,
            fontWeight: 900,
            color: "#2D6A4F",
          }}
        >
          What brings you to BundledMum today?
        </h1>
        <p style={{ margin: "10px 0 22px", textAlign: "center", fontSize: 15, color: "#5b5b5b", fontWeight: 600 }}>
          Pick one and we'll take you straight there.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <ChooserCard
            emoji="🛍️"
            title="Shop new baby & maternity items"
            subtitle="Browse our shop"
            accent="#2D6A4F"
            onClick={() => choose("new")}
          />
          <ChooserCard
            emoji="♻️"
            title="Buy used baby items"
            subtitle="Visit the marketplace"
            accent="#F4845F"
            onClick={() => choose("used")}
          />
          <ChooserCard
            emoji="🏷️"
            title="Sell my baby items"
            subtitle="Start selling"
            accent="#F4845F"
            onClick={() => choose("sell")}
          />
        </div>

        <button
          type="button"
          onClick={justBrowsing}
          style={{
            marginTop: 20,
            background: "none",
            border: "none",
            color: "#2D6A4F",
            fontSize: 14,
            fontWeight: 800,
            textDecoration: "underline",
            cursor: "pointer",
            padding: 8,
          }}
        >
          Just browsing →
        </button>
      </div>
    </div>
  );
}

function ChooserCard({
  emoji,
  title,
  subtitle,
  accent,
  onClick,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        background: "#FFFFFF",
        border: `2px solid ${accent}`,
        borderRadius: 16,
        padding: "16px 18px",
        cursor: "pointer",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        transition: "transform 0.05s ease",
      }}
    >
      <span aria-hidden style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: "#1A1A1A" }}>{title}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{subtitle}</span>
      </span>
    </button>
  );
}
