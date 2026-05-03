import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";
import iconCoral from "@/assets/logos/BM-ICON-CORAL.svg";

/**
 * Password recovery handler. Supabase fires a PASSWORD_RECOVERY auth event
 * when the user lands with the recovery token in the URL fragment; the
 * App-level listener routes them here. We just need to confirm a session
 * exists, then collect a new password and call updateUser.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect which Supabase email flow brought the user here. App.tsx's
  // listener forwards a ?flow= query param when it can read the hash;
  // fall back to the live hash in case the listener didn't fire (e.g.
  // direct landing while Supabase is still parsing the fragment).
  const flow = useMemo<"invite" | "recovery">(() => {
    const fromQuery = searchParams.get("flow");
    if (fromQuery === "invite") return "invite";
    if (fromQuery === "recovery") return "recovery";
    const hash = typeof window !== "undefined" ? window.location.hash || "" : "";
    if (hash.includes("type=invite")) return "invite";
    return "recovery";
  }, [searchParams]);
  const isInvite = flow === "invite";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!data.session);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const passwordTooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && confirm.length >= 8 && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    toast.success("Password updated successfully.");
    // Invitees already have a valid session and should land in the admin
    // dashboard; recovery users get sent back to /admin/login to sign in
    // fresh with the new password.
    setTimeout(() => navigate(isInvite ? "/admin" : "/admin/login"), 2000);
  };

  if (checking) return null;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: "#FFF8F4" }}>
      <div className="absolute w-[500px] h-[500px] rounded-full -top-[200px] -right-[200px] opacity-10" style={{ background: "#2D6A4F" }} />
      <div className="absolute w-[300px] h-[300px] rounded-full -bottom-[100px] -left-[100px] opacity-10" style={{ background: "#F4845F" }} />

      <div className="w-full max-w-sm mx-auto p-8 relative z-10">
        <div className="text-center mb-8">
          <img src={iconCoral} alt="BundledMum" className="w-14 h-14 mx-auto mb-4" />
          <img src={logoGreen} alt="BundledMum" className="h-8 mx-auto mb-3" />
          <h1 className="pf text-xl font-bold text-foreground mb-2">
            {isInvite ? "Welcome to BundledMum" : "Reset Your Password"}
          </h1>
          {hasSession ? (
            <p className="text-text-med text-sm font-body">
              {isInvite
                ? "Create a password to access your admin account."
                : "Enter your new password below."}
            </p>
          ) : (
            <p className="text-text-med text-sm font-body">
              This link has expired. Please request a new {isInvite ? "invite" : "password reset"}.
            </p>
          )}
        </div>

        {hasSession ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-foreground block mb-1.5 font-body">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest transition-all font-body"
              />
              {passwordTooShort && (
                <p className="text-destructive text-xs mt-1 font-body">Must be at least 8 characters.</p>
              )}
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground block mb-1.5 font-body">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest transition-all font-body"
              />
              {mismatch && (
                <p className="text-destructive text-xs mt-1 font-body">Passwords do not match.</p>
              )}
            </div>
            {error && <p className="text-destructive text-sm font-body">{error}</p>}
            <button
              type="submit"
              disabled={!valid || submitting}
              className="w-full rounded-xl py-3 font-semibold text-sm text-white transition-all disabled:opacity-50 font-body"
              style={{ background: submitting ? "#1A4A33" : "linear-gradient(135deg, #2D6A4F, #1A4A33)" }}
            >
              {submitting ? "Updating password…" : "Set New Password"}
            </button>
          </form>
        ) : (
          <Link
            to="/admin/login"
            className="block w-full text-center rounded-xl py-3 font-semibold text-sm text-white transition-all font-body"
            style={{ background: "linear-gradient(135deg, #2D6A4F, #1A4A33)" }}
          >
            Go to admin login
          </Link>
        )}
      </div>
    </div>
  );
}
