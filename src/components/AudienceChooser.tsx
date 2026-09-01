import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import logoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";

/**
 * AUDIENCE CHOOSER — a one-screen "which of three things did you come for?"
 * overlay shown to ANY visitor who lands on the bare storefront homepage "/",
 * regardless of source (typed, bookmark, organic search, ad, referral link),
 * as long as they have no remembered choice.
 *
 * The only gate is: LANDING path is "/" AND it is a real landing (not internal
 * navigation) AND no choice is remembered. Specifically it NEVER shows:
 *   - on any path other than "/" (product pages, /quiz, /list/:token,
 *     /quote/:token, /marketplace and every deep link go straight through)
 *   - on internal navigation — clicking the logo/Home from within the site
 *     loads the homepage normally. Guaranteed by the module-level ENTRY.path
 *     snapshot: it is the LANDING path, and client-side route changes never
 *     re-run module init, so navigating to "/" later keeps the original
 *     (non-"/") ENTRY.path and the chooser stays hidden.
 *   - once a choice is remembered (guests: sessionStorage; signed-in customers:
 *     customers.audience_preference via the set_audience_preference RPC)
 *
 * It fires NO pixel events and fetches NO data before painting for guests, so
 * it appears instantly rather than as a loading wall.
 */

const SESSION_KEY = "bm_audience_choice";

// Snapshot the TRUE entry PATH once, at module load. This is what makes
// "first landing, not internal navigation" reliable: the module initialises
// exactly once per full page load; later client-side route changes (logo,
// Home link) never re-run this, so ENTRY.path keeps describing where the
// visitor actually landed.
const ENTRY = {
  path: typeof window !== "undefined" ? window.location.pathname : "",
};

/**
 * Synchronous eligibility from the immutable ENTRY snapshot + sessionStorage.
 * Everything here is instant (no network), so a guest sees the chooser paint
 * on first frame. The signed-in cross-session check is layered on top, async.
 * Source (ad/organic/referral) is intentionally NOT gated: the chooser now
 * shows for any real landing on "/".
 */
function syncEligible(): boolean {
  if (ENTRY.path !== "/") return false;
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
  // Whether the SIGNED-IN visitor is an active marketplace seller. Only ever
  // flips to true; drives the third option's label + destination. Never gates
  // rendering — the chooser paints with the default "Sell" label and upgrades
  // if/when this resolves true.
  const [isSeller, setIsSeller] = useState<boolean>(false);

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

  // Seller check — only for a SIGNED-IN visitor and only once the chooser is
  // actually shown. Guests (no user) never call it, so they see no loading
  // state and no failed/forbidden anon RPC. Fire-and-forget: it only upgrades
  // the third option's label; a false result or an error keeps the default.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    supabase.rpc("is_marketplace_seller").then(
      ({ data, error }: { data: unknown; error: unknown }) => {
        if (!cancelled && !error && data === true) setIsSeller(true);
      },
      () => { /* ignore — keep the default "Sell my baby items" label */ },
    );
    return () => { cancelled = true; };
  }, [open, user]);

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
      // An active seller goes to their dashboard; everyone else to onboarding.
      window.location.assign(isSeller ? "/marketplace/sell/dashboard" : "/marketplace/sell");
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
            title={isSeller ? "Go to your Seller Dashboard" : "Sell my baby items"}
            subtitle={isSeller ? "Manage your listings" : "Start selling"}
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
