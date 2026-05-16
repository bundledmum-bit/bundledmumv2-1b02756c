import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import bmLogoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { track as pixelTrack, trackOnce as pixelTrackOnce } from "@/lib/metaPixel";
import { analytics } from "@/lib/ga";

/**
 * Passwordless email magic-link login.
 *
 * Three internal states:
 *  - idle:  email input + "Send me a login link"
 *  - sent:  confirmation card with resend (30s cooldown)
 *  - error: inline error + retry
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

  const sendLink = async () => {
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setErrorMessage("Please enter a valid email address.");
      setStage("error");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      // Magic-link emailRedirectTo MUST be the production URL — never
      // window.location.origin, since the Lovable preview environment
      // resolves that to a preview subdomain that breaks in production.
      const BASE = "https://bundledmum.com";
      const redirect = returnTo && returnTo !== "/account"
        ? `${BASE}/account?returnTo=${encodeURIComponent(returnTo)}`
        : `${BASE}/account`;
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: redirect },
      });
      if (error) throw error;
      pixelTrack("Lead", { lead_source: "account_login_magic_link", content_name: "Account sign-in magic link requested" });
      try {
        analytics.push({ event: "magic_link_requested", location: "account_login" });
      } catch { /* ignore */ }
      setStage("sent");
      setCooldown(30);
      toast.success("Login link sent — check your inbox.");
    } catch (e: any) {
      setErrorMessage(e?.message || "Couldn't send login link. Please try again.");
      setStage("error");
    } finally {
      setSubmitting(false);
    }
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
              <div className="text-4xl">✉️</div>
              <h1 className="pf text-xl font-bold">Check your inbox</h1>
              <p className="text-sm text-text-med leading-relaxed">
                We sent a login link to <b className="text-foreground">{email.trim().toLowerCase()}</b>.
                Click it to sign in — the link expires in 1 hour.
              </p>
              <div className="pt-2 text-xs text-text-light">
                Didn't get it?{" "}
                {cooldown > 0 ? (
                  <span>Resend in {cooldown}s</span>
                ) : (
                  <button onClick={sendLink} className="text-forest font-semibold hover:underline">Resend</button>
                )}
              </div>
              <button
                onClick={() => { setStage("idle"); setEmail(""); }}
                className="text-xs text-text-med hover:text-foreground pt-1"
              >
                Use a different email →
              </button>
            </div>
          ) : (
            <>
              <h1 className="pf text-xl font-bold text-center mb-1">Sign in to your account</h1>
              <p className="text-xs text-text-light text-center mb-5">
                We'll email you a magic link — no password needed.
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
                  onKeyDown={e => { if (e.key === "Enter" && !submitting) sendLink(); }}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-input pl-9 pr-3 py-3 text-sm bg-background outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                />
              </div>
              {stage === "error" && (
                <p className="text-xs text-destructive mb-2">{errorMessage}</p>
              )}

              <button
                onClick={sendLink}
                disabled={submitting || !email.trim()}
                className="w-full mt-3 rounded-pill bg-forest py-3 text-sm font-semibold text-primary-foreground hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 min-h-[44px]"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Send me a login link
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
