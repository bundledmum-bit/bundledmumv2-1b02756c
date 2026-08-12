import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { recordLoginEvent } from "@/lib/recordLoginEvent";
import { safeReturnTo, LOGIN_REASON_COPY, LOGIN_REASON_ICON, type LoginReason } from "./marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";
import { sanitizeOtpInput, isCompleteOtp, OTP_LENGTH } from "@/lib/otpCode";

// Matches the code's actual expiry (the same ~1hr Supabase project setting
// this codebase has long documented for the old magic link). Used only to
// decide whether a failed verify is worth calling "expired" — see the
// comment on verifyCode below for why this is an honest estimate, not
// something Supabase's API actually tells us.
const OTP_EXPIRY_MS = 60 * 60 * 1000;

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
 * Marketplace login. Passwordless email sign-in by 6-digit code, using the
 * SAME shared Supabase client and customer auth as the storefront (no second
 * client, no password, no signup). It lives inside /marketplace so a
 * marketplace visitor never gets handed off to the storefront login.
 *
 * WAS a magic link (emailRedirectTo pointing back into /marketplace/login);
 * Supabase's email template now sends {{ .Token }} instead of a link, so
 * sign-in here means collecting the 6-digit code and calling verifyOtp
 * directly rather than waiting for a redirect. signInWithOtp is still the
 * right call to trigger sending it — only what happens after has changed.
 *
 * The email hash-error handling below (linkFailed) is DELIBERATELY kept —
 * someone who still has an old, pre-switch magic-link email sitting in their
 * inbox and taps it will still redirect back here with a failed-token hash,
 * and this still explains it correctly. Transactional links (order
 * confirmations etc.) are a completely separate flow and land on their own
 * pages, never here — untouched by this change.
 *
 * Shell redesigned per the Claude Design file "BundledMum Marketplace.dc.html"
 * (screens L1-L7). Same eight-headline reason system as before; what changed
 * is presentation: a reason-specific icon-in-circle, the CTA is always
 * enabled and validates on submit rather than staying disabled until the
 * field looks right, the empty space below the form is now a "why we sign
 * you in this way" card instead of blank cream, and the sent state has its
 * own full-bleed identity instead of borrowing .mkt-heldbox. Desktop
 * (≥1024px) gets a real two-pane shell rather than a centered mobile card —
 * see .mkt-login-rail in marketplace.css.
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
  const subline = reason?.sub || "The marketplace uses your BundledMum account. No password, we email you a code.";
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
  const [linkFailed, setLinkFailed] = useState(false);

  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const sentAtRef = useRef<number | null>(null);
  const lastFailedCodeRef = useRef<string | null>(null);

  // A tapped OLD, pre-switch magic link that Supabase rejects (expired, or
  // already used —
  // an ordinary occurrence, not just a preview-bot scenario) redirects back
  // here with #error=...&error_code=...&error_description=... instead of a
  // session. Supabase's own client deliberately does NOT surface that as an
  // auth event or a getSession() error (it does not want a failed URL login
  // to look like a session was lost), so without this the page just quietly
  // shows the plain sign-in form again with no explanation at all — this is
  // what a "clicked the link, landed back here signed out" report turns out
  // to be. Read once on mount, then strip the hash so a refresh or share of
  // this URL doesn't re-trigger the message.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const hashParams = new URLSearchParams(hash.slice(1));
    if (hashParams.get("error") || hashParams.get("error_code") || hashParams.get("error_description")) {
      setLinkFailed(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const emailLooksValid = EMAIL_RE.test(email.trim());
  // A failed submit is a format problem (still on this screen, input itself
  // is wrong) vs a send problem (a valid address that the API rejected) —
  // the two get different treatment below, same as the design file's L3/L5.
  const isFormatError = stage === "error" && !emailLooksValid;
  const isSendError = stage === "error" && emailLooksValid;

  // Already logged in (or the code just established the session): forward to
  // where they were headed, never to the storefront.
  useEffect(() => {
    if (!loading && isLoggedIn) navigate(returnTo, { replace: true });
  }, [loading, isLoggedIn, navigate, returnTo]);

  // New-device sign-in alert: fires once per GENUINE new sign-in, not on every
  // load. SIGNED_IN only fires when a sign-in flow (here, entering the code)
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

  async function sendCode() {
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) {
      setStage("error");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: addr });
      if (error) throw error;
      sentAtRef.current = Date.now();
      lastFailedCodeRef.current = null;
      setOtp("");
      setOtpError("");
      setStage("sent");
      setCooldown(30);
      setLinkFailed(false);
    } catch (e) {
      setErrorMessage((e as { message?: string })?.message || "We could not send your code. Please try again.");
      setStage("error");
    } finally {
      setSubmitting(false);
    }
  }

  function useDifferentEmail() {
    setStage("idle");
    setEmail("");
    setCooldown(0);
    setOtp("");
    setOtpError("");
  }

  // verifyOtp fails with the same generic "token has expired or is invalid"
  // for a genuinely expired code, an already-used one, and a plain wrong
  // one — Supabase's own API does not distinguish them (confirmed against
  // their troubleshooting docs). So "expired" is an honest, disclosed
  // inference from OUR OWN send timestamp against the known ~1hr window,
  // not something the API tells us directly; and "wrong" vs "already used"
  // is told apart by whether this is a repeat of a code that JUST failed
  // (clearly still wrong) or the first attempt at a fresh-looking code that
  // still fails (more likely stale/already used somewhere else) — the
  // closest honest three-way split actually available.
  async function verifyCode(value: string) {
    if (!isCompleteOtp(value)) {
      setOtpError(`Enter all ${OTP_LENGTH} digits of the code.`);
      return;
    }
    setVerifying(true);
    setOtpError("");
    try {
      const addr = email.trim().toLowerCase();
      const { error } = await supabase.auth.verifyOtp({ email: addr, token: value, type: "email" });
      if (error) throw error;
      // Success: the isLoggedIn effect above handles the redirect.
    } catch {
      const elapsed = sentAtRef.current ? Date.now() - sentAtRef.current : 0;
      if (elapsed > OTP_EXPIRY_MS) {
        setOtpError("That code has expired. Send yourself a new one below.");
      } else if (lastFailedCodeRef.current === value) {
        setOtpError("That code isn't right. Check the digits and try again.");
      } else {
        setOtpError("That code has already been used, or the digits aren't quite right. Check your email for the most recent one, or request a new code below.");
      }
      lastFailedCodeRef.current = value;
      setOtp("");
    } finally {
      setVerifying(false);
    }
  }

  function onOtpChange(raw: string) {
    const clean = sanitizeOtpInput(raw);
    setOtp(clean);
    if (otpError) setOtpError("");
    if (isCompleteOtp(clean)) verifyCode(clean);
  }

  // While auth is resolving, or right after the code verifies, show a spinner
  // rather than flashing the form before the redirect.
  if (loading || isLoggedIn) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  }

  return (
    <div className="mkt-login-page">
      <MarketplaceTitle title={stage === "sent" ? "Enter your code" : "Sign in"} />
      <div className={stage === "sent" ? "mkt-login-rail sent" : "mkt-login-rail"}>
        {stage === "sent" ? (
          <>
            <div className="mkt-login-sent-icon">🔢</div>
            <h2>Almost there</h2>
            <p>Enter the 6-digit code we just emailed you, it brings you right back here.</p>
          </>
        ) : (
          <>
            <div className="mkt-login-rail-brand">BundledMum <small>Marketplace</small></div>
            <h2>A safer way to buy and sell used baby and children's things</h2>
            <ul>
              <li><span className="ic">✓</span>Money held until you confirm the item arrived</li>
              <li><span className="ic">✓</span>Every seller verified, every listing checked first</li>
              <li><span className="ic">✓</span>No password, just a code to your own inbox</li>
            </ul>
          </>
        )}
      </div>

      <div className="mkt-login-formcol">
        {stage === "sent" ? (
          <div className="mkt-login-sent">
            <div className="mkt-login-sent-icon">🔢</div>
            <h1>Check {email.trim().toLowerCase()}</h1>
            <p className="lead">Enter the 6-digit code we sent you below to finish signing in.</p>
            <input
              className="mkt-login-otp-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              autoFocus
              value={otp}
              onChange={(e) => onOtpChange(e.target.value)}
              onPaste={(e) => { e.preventDefault(); onOtpChange(e.clipboardData.getData("text")); }}
              disabled={verifying}
              placeholder="000000"
              maxLength={OTP_LENGTH}
            />
            <div className="mkt-login-sent-card">
              {verifying ? (
                <div className="waiting"><span className="dot" /><span>Checking your code...</span></div>
              ) : otpError ? (
                <p className="note err">{otpError}</p>
              ) : (
                <>
                  <div className="waiting"><span className="dot" /><span>Waiting for your code</span></div>
                  <hr />
                  <p className="note">Not there in a minute or two? Check spam, or resend below.</p>
                </>
              )}
            </div>
            <button className="mkt-login-sent-resend" disabled={cooldown > 0} onClick={sendCode}>
              {cooldown > 0 ? `Resend code in ${fmtCooldown(cooldown)}` : "Resend the code"}
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

            {linkFailed && (
              <div className="mkt-login-senderr"><span className="m">!</span><span>That link has expired or was already used. Please send yourself a new one below.</span></div>
            )}

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
                  onKeyDown={(e) => { if (e.key === "Enter" && !submitting) sendCode(); }}
                  placeholder="you@email.com"
                />
                {!isFormatError && emailLooksValid && email.trim() && <span className="tick">✓</span>}
              </div>
              {isFormatError && (
                <div className="mkt-login-fielderr"><span className="m">!</span><span>That doesn't look like a full email address, check for a typo</span></div>
              )}
            </div>

            <button className="mkt-login-cta" disabled={submitting} onClick={sendCode}>
              {submitting ? "Sending..." : "Send my sign in code"}
            </button>

            {isSendError ? (
              <div className="mkt-login-senderr"><span className="m">!</span><span>{errorMessage}</span></div>
            ) : (
              <div className="mkt-login-howitworks">
                <div className="t">Why we sign you in this way</div>
                <div className="row"><span className="ic">✓</span><span>No password to create or forget, just a code to your email</span></div>
                <div className="row"><span className="ic">✓</span><span>Only you can see a code sent to your own inbox</span></div>
                <div className="row"><span className="ic">✓</span><span>We only ever ask at moments like this one, browsing stays open to everyone</span></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
