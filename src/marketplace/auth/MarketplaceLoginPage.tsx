import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { safeReturnTo } from "./marketplaceLogin";

/**
 * Marketplace login. Passwordless magic link only, using the SAME shared Supabase
 * client and customer auth as the storefront (no second client, no password, no
 * signup). It lives inside /marketplace so a marketplace visitor never gets handed
 * off to the storefront login.
 *
 * THE FIX: emailRedirectTo points back into the MARKETPLACE login
 * (https://bundledmum.com/marketplace/login?returnTo=...), not the storefront
 * /account page. The magic link lands here, the shared client establishes the
 * session from the URL, and we forward to the original marketplace destination
 * (default: browse). For this to work in production the pattern
 * https://bundledmum.com/marketplace/** MUST be in the Supabase Auth "Redirect
 * URLs" allow-list, otherwise Supabase silently falls back to the site URL.
 */
export default function MarketplaceLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Default destination is the marketplace orders list, never the storefront.
  const returnTo = safeReturnTo(params.get("returnTo") || "/orders");
  const { isLoggedIn, loading } = useCustomerAuth();

  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"idle" | "sent" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Already logged in (or the magic link just established the session): forward to
  // where they were headed, never to the storefront.
  useEffect(() => {
    if (!loading && isLoggedIn) navigate(returnTo, { replace: true });
  }, [loading, isLoggedIn, navigate, returnTo]);

  // Resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function sendLink() {
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setErrorMessage("Please enter a valid email address.");
      setStage("error");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      // Hardcode the production base, never window.location.origin (the preview
      // host resolves to a subdomain that breaks in production). Land back on the
      // marketplace login, which then forwards to returnTo.
      const BASE = "https://bundledmum.com";
      const redirect = `${BASE}/marketplace/login?returnTo=${encodeURIComponent(returnTo)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: redirect },
      });
      if (error) throw error;
      setStage("sent");
      setCooldown(30);
    } catch (e) {
      setErrorMessage((e as { message?: string })?.message || "We could not send your link. Please try again.");
      setStage("error");
    } finally {
      setSubmitting(false);
    }
  }

  // While auth is resolving, or right after the magic link lands, show a spinner
  // rather than flashing the form before the redirect.
  if (loading || isLoggedIn) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  }

  return (
    <>
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><h1 style={{ flex: 1 }}>Sign in</h1></div>
          <p className="sub">The marketplace uses your BundledMum account. No password, we email you a link.</p>
        </div>
      </div>

      <div className="mkt-sell-body">
        {stage === "sent" ? (
          <div className="mkt-heldbox">
            <div className="hb-title">Check your email</div>
            <div className="hb-line"><span className="hb-tick">✓</span>We sent a link to {email.trim().toLowerCase()}. Open it on this phone and it brings you straight back to BundledMum Marketplace.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
              {cooldown > 0
                ? <span style={{ font: "400 12px/1 'Lato', sans-serif", color: "var(--mkt-muted)" }}>Resend in {cooldown}s</span>
                : <button className="mkt-sell-head-link" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "700 12px/1 'Lato', sans-serif", color: "var(--mkt-green)" }} onClick={sendLink}>Resend the link</button>}
              <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "400 12px/1 'Lato', sans-serif", color: "var(--mkt-muted)" }} onClick={() => { setStage("idle"); setEmail(""); }}>Use a different email</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mkt-field">
              <span className="mkt-uplabel">Email address</span>
              <input
                className={stage === "error" ? "mkt-input error" : "mkt-input"}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (stage === "error") setStage("idle"); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !submitting) sendLink(); }}
                placeholder="you@example.com"
              />
            </div>

            {stage === "error" && <div className="mkt-errbox"><span className="m">!</span><span>{errorMessage}</span></div>}

            <button className="mkt-primary" disabled={submitting || !email.trim()} onClick={sendLink}>
              {submitting ? "Sending..." : "Email me a login link"}
            </button>
            <p style={{ font: "400 12px/1.5 'Lato', sans-serif", color: "var(--mkt-muted)", textAlign: "center", margin: 0 }}>
              New here? The same link signs you in and sets up your account.
            </p>
          </>
        )}
      </div>
    </>
  );
}
