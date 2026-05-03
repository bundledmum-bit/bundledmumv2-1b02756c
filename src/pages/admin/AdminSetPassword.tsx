import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";
import iconCoral from "@/assets/logos/BM-ICON-CORAL.svg";

export default function AdminSetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        navigate("/admin/login");
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

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
    toast.success("Password set successfully");
    navigate("/admin");
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
          <h1 className="pf text-xl font-bold text-foreground mb-2">Set your password</h1>
          <p className="text-text-med text-sm font-body">
            Welcome to BundledMum admin. Choose a strong password — minimum 8 characters.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5 font-body">Password</label>
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
            {submitting ? "Setting password..." : "Set Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
