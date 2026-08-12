import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import bmLogoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { recordLoginEvent } from "@/lib/recordLoginEvent";
import { track as pixelTrack, trackOnce as pixelTrackOnce } from "@/lib/metaPixel";
import { analytics } from "@/lib/ga";
import { sanitizeOtpInput, isCompleteOtp, OTP_LENGTH } from "@/lib/otpCode";

// Matches the code's actual expiry (the same Supabase project setting this
// codebase has long documented as "1 hour" for the old magic link). Used
// only to decide whether a failed verify is worth calling "expired" — see
// the comment on verifyCode below for why this is an honest estimate, not
// something Supabase's API actually tells us.
const OTP_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Passwordless email sign-in, by 6-digit code (was a magic link — Supabase's
 * email template now sends {{ .Token }} instead of a link, so this page's
 * job changed from "wait for the browser to receive a redirect" to
 * "collect the code and verify it directly").
 *
 * Internal states:
 *  - idle:  email input + "Send me a code"
 *  - sent:  code input (resend available, 30s cooldown)
 *  - error: inline error on the email step + retry
 *
 * Transactional email links (order confirmations etc.) are UNCHANGED and
 * unrelated to this page — they still carry a real link, still verified by
 * Supabase's own client-side session pickup from the URL, nothing here
 * touches that mechanism.
 */
export default function AccountLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/account";
  const { isLoggedIn } = useCustomerAuth();

  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"idle" | "sent" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [cooldown, setCooldown] = useState(0);

  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string>("");
  const sentAtRef = useRef<number | null>(null);
  const lastFailedCodeRef = useRef<string | null>(null);

  // If already logged in, bounce straight back to returnTo.
  useEffect(() => {
    if (isLoggedIn) {
      // Meta Pixel CompleteRegistration — one fire per browser even if the
      // user opens /account/login multiple times.
      pixelTrackOnce("account_register", "CompleteRegistration", { status: "success" });
      navigate(returnTo, { replace: true });
    }
  }, [isLoggedIn, navigate, returnTo]);

  // Resend cooldown — ticks down once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // New-device sign-in alert: fires once per GENUINE new sign-in, not on every
  // load. SIGNED_IN only fires when a sign-in flow (here, entering the code)
  // actually just completed; a page load that finds an already-valid session
  // fires INITIAL_SESSION instead, which this deliberately ignores. Same
  // shared customer account as the marketplace login, same wiring there too.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") recordLoginEvent(supabase);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendCode = async () => {
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setErrorMessage("Please enter a valid email address.");
      setStage("error");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: addr });
      if (error) throw error;
      pixelTrack("Lead", { lead_source: "account_login_otp", content_name: "Account sign-in code requested" });
      try {
        analytics.push({ event: "otp_requested", location: "account_login" });
      } catch { /* ignore */ }
      sentAtRef.current = Date.now();
      lastFailedCodeRef.current = null;
      setOtp("");
      setOtpError("");
      setStage("sent");
      setCooldown(30);
      toast.success("Code sent — check your inbox.");
    } catch (e: any) {
      setErrorMessage(e?.message || "Couldn't send your code. Please try again.");
      setStage("error");
    } finally {
      setSubmitting(false);
    }
  };

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
  const verifyCode = async (value: string) => {
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
  };

  const onOtpChange = (raw: string) => {
    const clean = sanitizeOtpInput(raw);
    setOtp(clean);
    if (otpError) setOtpError("");
    if (isCompleteOtp(clean)) verifyCode(clean);
  };

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-20 md:pb-10 px-4">
      <div className="max-w-[420px] mx-auto pt-8">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-text-med hover:text-forest mb-4">
          <ArrowLeft className="w-3 h-3" /> Back to home
        </Link>

        <div className="bg-card border border-border rounded-card shadow-card p-6">
          <img src={bmLogoGreen} alt="BundledMum" className="h-8 mx-auto mb-4" />

          {stage === "sent" ? (
            <div className="text-center space-y-3">
              <div className="text-4xl">🔢</div>
              <h1 className="pf text-xl font-bold">Enter your code</h1>
              <p className="text-sm text-text-med leading-relaxed">
                We sent a 6-digit code to <b className="text-foreground">{email.trim().toLowerCase()}</b>.
                Enter it below to sign in.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                autoFocus
                value={otp}
                onChange={e => onOtpChange(e.target.value)}
                onPaste={e => { e.preventDefault(); onOtpChange(e.clipboardData.getData("text")); }}
                disabled={verifying}
                placeholder="000000"
                maxLength={OTP_LENGTH}
                className="w-full text-center text-2xl font-bold tracking-[0.5em] rounded-lg border border-input py-3 pl-[0.5em] bg-background outline-none focus:ring-2 focus:ring-ring min-h-[44px] disabled:opacity-60"
              />
              {verifying && <p className="text-xs text-text-med">Checking...</p>}
              {otpError && <p className="text-xs text-destructive">{otpError}</p>}
              <div className="pt-2 text-xs text-text-light">
                Didn't get it?{" "}
                {cooldown > 0 ? (
                  <span>Resend in {cooldown}s</span>
                ) : (
                  <button onClick={sendCode} className="text-forest font-semibold hover:underline">Resend</button>
                )}
              </div>
              <button
                onClick={() => { setStage("idle"); setEmail(""); setOtp(""); setOtpError(""); }}
                className="text-xs text-text-med hover:text-foreground pt-1"
              >
                Use a different email →
              </button>
            </div>
          ) : (
            <>
              <h1 className="pf text-xl font-bold text-center mb-1">Sign in to your account</h1>
              <p className="text-xs text-text-light text-center mb-5">
                We'll email you a 6-digit code — no password needed.
              </p>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Email address</label>
              <div className="relative mb-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (stage === "error") setStage("idle"); }}
                  onKeyDown={e => { if (e.key === "Enter" && !submitting) sendCode(); }}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-input pl-9 pr-3 py-3 text-sm bg-background outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                />
              </div>
              {stage === "error" && (
                <p className="text-xs text-destructive mb-2">{errorMessage}</p>
              )}

              <button
                onClick={sendCode}
                disabled={submitting || !email.trim()}
                className="w-full mt-3 rounded-pill bg-forest py-3 text-sm font-semibold text-primary-foreground hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 min-h-[44px]"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Send me a code
              </button>

              <p className="text-[11px] text-text-light text-center mt-4 leading-relaxed">
                By signing in you agree to our{" "}
                <Link to="/terms" className="underline">Terms</Link> and{" "}
                <Link to="/privacy" className="underline">Privacy Policy</Link>.
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-text-light mt-4">
          Need help? <Link to="/contact" className="text-forest font-semibold hover:underline">Contact support</Link>
        </p>
      </div>
    </div>
  );
}
