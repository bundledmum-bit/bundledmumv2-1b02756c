import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";
import iconCoral from "@/assets/logos/BM-ICON-CORAL.svg";

export default function AdminLogin() {
  const { signIn } = useAdmin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const resolveTarget = async (): Promise<string> => {
    const next = params.get("next");
    if (next && next.startsWith("/admin/")) return next;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return "/admin";
      const { data } = await (supabase.from("admin_users") as any)
        .select("role")
        .eq("auth_user_id", uid)
        .maybeSingle();
      const role = String(data?.role || "").trim().toLowerCase();
      return role === "picker" ? "/admin/picking" : "/admin";
    } catch {
      return "/admin";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    const target = await resolveTarget();
    setLoading(false);
    navigate(target);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: "#FFF8F4" }}>
      {/* Decorative circles */}
      <div className="absolute w-[500px] h-[500px] rounded-full -top-[200px] -right-[200px] opacity-10" style={{ background: "#2D6A4F" }} />
      <div className="absolute w-[300px] h-[300px] rounded-full -bottom-[100px] -left-[100px] opacity-10" style={{ background: "#F4845F" }} />

      <div className="w-full max-w-sm mx-auto p-8 relative z-10">
        <div className="text-center mb-8">
          <img src={iconCoral} alt="BundledMum" className="w-14 h-14 mx-auto mb-4" />
          <img src={logoGreen} alt="BundledMum" className="h-8 mx-auto mb-3" />
          <p className="text-text-med text-sm font-body">Sign in to manage your store</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5 font-body">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest transition-all font-body" />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5 font-body">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest transition-all font-body" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-xl py-3 font-semibold text-sm text-white transition-all disabled:opacity-50 font-body"
            style={{ background: loading ? "#1A4A33" : "linear-gradient(135deg, #2D6A4F, #1A4A33)" }}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>
        <p className="text-center text-[11px] text-text-light mt-6 font-body">🔒 Secured admin access only</p>
      </div>
    </div>
  );
}
