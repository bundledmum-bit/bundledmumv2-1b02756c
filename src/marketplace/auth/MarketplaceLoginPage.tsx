import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { recordLoginEvent } from "@/lib/recordLoginEvent";
import { safeReturnTo, LOGIN_REASON_COPY, LOGIN_REASON_ICON, type LoginReason } from "./marketplaceLogin";

/** True for any string that is actually one of our known reason keys,
 * narrowing an arbitrary URL param down to a safe lookup key. An unknown or
 * missing reason (typed the URL directly, an old bookmarked link, a gate
 * that forgot to pass one) always falls through to the generic copy below,
 * never a blank space or a broken layout. */
function isKnownReason(r: string | null): r is LoginReason {
  return !!r && Object.prototype.hasOwnProperty.call(LOGIN_REASON_COPY, r);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fmtCooldown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
 *
 * Shell redesigned per the Claude Design file "BundledMum Marketplace.dc.html"
 * (screens L1-L7). Same mechanism and the same eight-headline system as
 * before; what changed is presentation: a reason-specific icon-in-circle,
 * the CTA is always enabled and validates on submit rather than staying
 * disabled until the field looks right, the empty space below the form is
 * now a "why we sign you in this way" card instead of blank cream, and the
 * sent state has its own full-bleed identity instead of borrowing
 * .mkt-heldbox. Desktop (≥1024px) gets a real two-pane shell rather than a
 * centered mobile card — see .mkt-login-rail in marketplace.css.
 */
export default function MarketplaceLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Default destination is the marketplace orders list, never the storefront.
  const returnTo = safeReturnTo(params.get("returnTo") || "/orders");
  const { isLoggedIn, loading } = useCustomerAuth();

  // Contextual copy (what sent them here, and why), falling back to a
  // sensible general message for a bare /login (typed URL, old bookmark,
  // or the header's own "Log in" link, which has no specific action).
  const reasonParam = params.get("reason");
  const knownReason = isKnownReason(reasonParam) ? reasonParam : null;
  const reason = knownReason ? LOGIN_REASON_COPY[knownReason] : null;
  const heading = reason?.lead || "Sign in";
  const subline = reason?.sub || "The marketplace uses your BundledMum account. No password, we email you a link.";
  const icon = LOGIN_REASON_ICON[knownReason ?? "generic"];
  // returnTo is always the exact page whose auth gate sent us here (every
  // gate passes itself), so it doubles as "back" — literally to the listing
  // for the offer flow, which is the one case worth a specific label.
  const backLabel = knownReason === "offer" ? "Back to listing" : "Back";
  const goBack = knownReason ? () => navigate(returnTo) : () => navigate(-1);

  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"idle" | "sent" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const emailLooksValid = EMAIL_RE.test(email.trim());
  // A failed submit is a format problem (still on this screen, input itself
  // is wrong) vs a send problem (a valid address that the API rejected) —
  // the two get different treatment below, same as the design file's L3/L5.
  const isFormatError = stage === "error" && !emailLooksValid;
  const isSendError = stage === "error" && emailLooksValid;

  // Already logged in (or the magic link just established the session): forward to
  // where they were headed, never to the storefront.
  useEffect(() => {
    if (!loading && isLoggedIn) navigate(returnTo, { replace: true });
  }, [loading, isLoggedIn, navigate, returnTo]);

  // New-device sign-in alert: fires once per GENUINE new sign-in, not on every
  // load. SIGNED_IN only fires when a sign-in flow (here, the magic link)
  // actually just completed; a page load that finds an already-valid session
  // fires INITIAL_SESSION instead, which this deliberately ignores.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") recordLoginEvent(supabase);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function sendLink() {
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) {
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

  function useDifferentEmail() {
    setStage("idle");
    setEmail("");
    setCooldown(0);
  }

  // While auth is resolving, or right after the magic link lands, show a spinner
  // rather than flashing the form before the redirect.
  if (loading || isLoggedIn) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  }

  return (
    <div className="mkt-login-page">
      <div className={stage === "sent" ? "mkt-login-rail sent" : "mkt-login-rail"}>
        {stage === "sent" ? (
          <>
            <div className="mkt-login-sent-icon">✉</div>
            <h2>Almost there</h2>
            <p>Your link is on its way. Tap it from the same device or a different one, it brings you right back here.</p>
          </>
        ) : (
          <>
            <div className="mkt-login-rail-brand">BundledMum <small>Marketplace</small></div>
            <h2>A safer way to buy and sell used baby things</h2>
            <ul>
              <li><span className="ic">✓</span>Money held until you confirm the item arrived</li>
              <li><span className="ic">✓</span>Every seller verified, every listing checked first</li>
              <li><span className="ic">✓</span>No password, just a link to your own inbox</li>
            </ul>
          </>
        )}
      </div>

      <div className="mkt-login-formcol">
        {stage === "sent" ? (
          <div className="mkt-login-sent">
            <div className="mkt-login-sent-icon">✉</div>
            <h1>Check {email.trim().toLowerCase()}</h1>
            <p className="lead">Tap the link we sent, it'll bring you right back here and finish signing you in.</p>
            <div className="mkt-login-sent-card">
              <div className="waiting"><span className="dot" /><span>Waiting for you to tap it</span></div>
              <hr />
              <p className="note">Not there in a minute or two? Check spam, or resend below.</p>
            </div>
            <button className="mkt-login-sent-resend" disabled={cooldown > 0} onClick={sendLink}>
              {cooldown > 0 ? `Resend link in ${fmtCooldown(cooldown)}` : "Resend the link"}
            </button>
            <button className="mkt-login-sent-diff" onClick={useDifferentEmail}>Use a different email</button>
          </div>
        ) : (
          <div className="mkt-login-form">
            <button className="mkt-login-back" onClick={goBack}>‹ {backLabel}</button>
            <div className="mkt-login-icon" style={{ background: icon.bg, color: icon.fg }}>{icon.glyph}</div>
            <div className="mkt-login-headtext">
              <h1 className="mkt-login-headline">{heading}</h1>
              <p className="mkt-login-subline">{subline}</p>
            </div>

            <div className="mkt-login-fieldgroup">
              <span className="mkt-login-uplabel">Email address</span>
              <div className="mkt-login-inputwrap">
                <input
                  className={`mkt-login-input${isFormatError ? " error" : emailLooksValid && email.trim() ? " valid" : ""}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (stage === "error") setStage("idle"); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !submitting) sendLink(); }}
                  placeholder="you@email.com"
                />
                {!isFormatError && emailLooksValid && email.trim() && <span className="tick">✓</span>}
              </div>
              {isFormatError && (
                <div className="mkt-login-fielderr"><span className="m">!</span><span>That doesn't look like a full email address, check for a typo</span></div>
              )}
            </div>

            <button className="mkt-login-cta" disabled={submitting} onClick={sendLink}>
              {submitting ? "Sending..." : "Send my sign in link"}
            </button>

            {isSendError ? (
              <div className="mkt-login-senderr"><span className="m">!</span><span>{errorMessage}</span></div>
            ) : (
              <div className="mkt-login-howitworks">
                <div className="t">Why we sign you in this way</div>
                <div className="row"><span className="ic">✓</span><span>No password to create or forget, just a link to your email</span></div>
                <div className="row"><span className="ic">✓</span><span>Only you can open a link sent to your own inbox</span></div>
                <div className="row"><span className="ic">✓</span><span>We only ever ask at moments like this one, browsing stays open to everyone</span></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
