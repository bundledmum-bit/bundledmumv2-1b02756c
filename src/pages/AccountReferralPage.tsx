import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Copy, Gift, MessageCircle, Share2 } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { analytics } from "@/lib/ga";

interface ReferralRow {
  email: string;
  full_name: string | null;
  referral_code: string | null;
  referral_uses: number | null;
  referral_discount_amount: number | null;
  referral_credit_per_use: number | null;
  total_credits_earned: number | null;
  credits_available: number | null;
}

const fmt = (n: number | null | undefined) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;

export default function AccountReferralPage() {
  const { user } = useCustomerAuth();
  const email = user?.email || "";
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-referral", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_account_view")
        .select("email, full_name, referral_code, referral_uses, referral_discount_amount, referral_credit_per_use, total_credits_earned, credits_available")
        .eq("email", email)
        .maybeSingle();
      if (error) throw error;
      return data as ReferralRow | null;
    },
  });

  const code = data?.referral_code || "";
  const firstName = (data?.full_name || "").split(" ")[0] || "I";
  const discount = data?.referral_discount_amount || 0;
  const credit = data?.referral_credit_per_use || 0;

  const shareLink = `https://bundledmum.com${code ? `?ref=${code}` : ""}`;
  const waMessage = `Hey! I've been using BundledMum for my maternity shopping.${code ? ` Use my code ${code} for ${fmt(discount)} off your first order.` : ""} bundledmum.com`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  const copy = async (value: string, which: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      toast.success("Copied to clipboard");
      try {
        analytics.push({
          event: "referral_share",
          share_method: which === "code" ? "copy_code" : "copy_link",
        });
      } catch { /* ignore */ }
      setTimeout(() => setCopied(c => (c === which ? null : c)), 2000);
    } catch {
      toast.error("Couldn't copy — please copy manually.");
    }
  };

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-20 md:pb-10 px-4">
      <div className="max-w-[680px] mx-auto pt-6 space-y-4">
        <Link to="/account" className="inline-flex items-center gap-1 text-xs text-text-med hover:text-forest">
          <ArrowLeft className="w-3 h-3" /> Back to account
        </Link>

        <header>
          <h1 className="pf text-2xl font-bold flex items-center gap-2"><Gift className="w-5 h-5" /> Refer & Earn</h1>
          <p className="text-xs text-text-med mt-1">Share your code with friends — they save, you earn credit.</p>
        </header>

        {isLoading ? (
          <div className="bg-card border border-border rounded-card h-56 animate-pulse" />
        ) : !code ? (
          <div className="bg-card border border-border rounded-card p-6 text-center">
            <div className="text-3xl mb-2">🎁</div>
            <h2 className="pf text-lg mb-1">Referral unlocks after your first order</h2>
            <p className="text-sm text-text-med mb-4">Place your first order to get a personal referral code. Your friends get a discount, you earn credit.</p>
            <Link to="/bundles" className="inline-block rounded-pill bg-forest text-primary-foreground px-6 py-2.5 text-sm font-semibold hover:bg-forest-deep min-h-[44px]">
              Browse bundles →
            </Link>
          </div>
        ) : (
          <>
            {/* Code card */}
            <section className="bg-forest text-primary-foreground rounded-card p-5">
              <div className="text-[10px] uppercase tracking-widest font-semibold opacity-70">Your referral code</div>
              <div className="flex items-center justify-between gap-3 mt-2">
                <div className="font-mono text-2xl font-bold tracking-wider">{code}</div>
                <button
                  onClick={() => copy(code, "code")}
                  className="inline-flex items-center gap-1.5 bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold min-h-[40px]"
                >
                  <Copy className="w-3.5 h-3.5" /> {copied === "code" ? "Copied!" : "Copy"}
                </button>
              </div>
            </section>

            {/* How it works + stats */}
            <section className="bg-card border border-border rounded-card p-4">
              <h2 className="font-bold text-sm mb-2">How it works</h2>
              <ul className="text-xs text-text-med space-y-1 mb-3">
                <li>• Share your code with friends.</li>
                <li>• They get <b className="text-forest">{fmt(discount)}</b> off their first order.</li>
                <li>• You earn <b className="text-forest">{fmt(credit)}</b> credit for each order they place.</li>
              </ul>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Stat label="Times used"       value={String(data?.referral_uses || 0)} />
                <Stat label="Credits earned"   value={fmt(data?.total_credits_earned)} />
                <Stat label="Credits available" value={fmt(data?.credits_available)} highlight />
              </div>
            </section>

            {/* Share */}
            <section className="bg-card border border-border rounded-card p-4 space-y-2">
              <h2 className="font-bold text-sm flex items-center gap-1.5"><Share2 className="w-4 h-4" /> Share</h2>
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    try { analytics.push({ event: "referral_share", share_method: "whatsapp" }); } catch { /* ignore */ }
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-pill bg-[#25D366] text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 min-h-[44px]"
                >
                  <MessageCircle className="w-4 h-4" /> Share on WhatsApp
                </a>
                <button
                  onClick={() => copy(shareLink, "link")}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-pill border border-forest text-forest px-4 py-2.5 text-sm font-semibold hover:bg-forest/5 min-h-[44px]"
                >
                  <Copy className="w-4 h-4" /> {copied === "link" ? "Link copied!" : "Copy link"}
                </button>
              </div>
              <div className="text-[10px] text-text-light break-all">{shareLink}</div>
            </section>

            <p className="text-[11px] text-text-light text-center">
              Hi {firstName} 👋 — credits are applied automatically to your next order at checkout.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center ${highlight ? "bg-forest/10" : "bg-muted/50"}`}>
      <div className="text-[9px] uppercase tracking-widest font-semibold text-text-light">{label}</div>
      <div className={`font-bold mt-0.5 text-sm tabular-nums ${highlight ? "text-forest" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
