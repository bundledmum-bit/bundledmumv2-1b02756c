import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { fmt } from "@/lib/cart";
import { analytics } from "@/lib/ga";

interface Props {
  referralCode: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
}

export default function ReferralSection({ referralCode, paymentMethod, paymentStatus }: Props) {
  const [copied, setCopied] = useState(false);
  const { data: settings } = useSiteSettings();
  const referralAmount = parseInt(settings?.referral_credit_amount || settings?.referral_amount) || 2000;

  // Brief "generating" state — auto-dismiss after 3 seconds if code is still null
  const [showGenerating, setShowGenerating] = useState(!referralCode);
  useEffect(() => {
    if (referralCode) { setShowGenerating(false); return; }
    const id = window.setTimeout(() => setShowGenerating(false), 3000);
    return () => window.clearTimeout(id);
  }, [referralCode]);

  const isPendingTransfer = paymentMethod === "transfer" && paymentStatus !== "paid";

  const link = referralCode ? `https://bundledmum.com/?ref=${referralCode}` : "";

  const fireReferralShare = (method: "copy_code" | "copy_link" | "whatsapp") => {
    try { analytics.push({ event: "referral_share", share_method: method }); } catch { /* ignore */ }
  };

  const handleCopy = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast.success("Referral code copied!");
    fireReferralShare("copy_code");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!referralCode) return;
    const text = `I just packed my hospital bag with BundledMum and loved it! 🎁 Use my referral code ${referralCode} to get ${fmt(referralAmount)} off your first bundle: ${link}`;
    fireReferralShare("whatsapp");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleInstagram = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(`Use my BundledMum referral code: ${referralCode} — Get ${fmt(referralAmount)} off! ${link}`);
    toast.success("Link copied! Paste it in your Instagram bio or story.");
    fireReferralShare("copy_link");
  };

  // If no code and generating message has timed out, hide the entire section
  if (!referralCode && !showGenerating) return null;

  return (
    <div className="bg-forest-light border-2 border-forest/20 rounded-card p-5 md:p-8">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">🎁</span>
        <h3 className="pf text-lg md:text-xl text-forest font-bold">Share & Earn</h3>
      </div>
      <p className="text-text-med text-sm mb-4">
        Share your code and earn <span className="font-bold text-forest">{fmt(referralAmount)} credit</span> when a friend places their first order!
      </p>

      <div className="bg-card rounded-xl p-4 mb-3 text-center">
        <p className="text-text-light text-[11px] mb-1.5">Your referral code:</p>
        {referralCode ? (
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono font-bold text-xl tracking-wider text-forest">{referralCode}</span>
            <button onClick={handleCopy} className="flex-shrink-0 rounded-pill bg-forest px-3 py-1.5 text-[11px] font-semibold text-primary-foreground interactive flex items-center gap-1">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1">
            <div className="h-4 w-4 border-2 border-border border-t-forest rounded-full animate-spin" />
            <span className="text-text-med text-sm">Generating your code...</span>
          </div>
        )}
      </div>

      {/* Payment status disclaimer */}
      {isPendingTransfer ? (
        <div className="bg-[#FFF8E1] border border-[#F59E0B]/40 rounded-xl p-3.5 mb-3 text-[13px] text-[#78350F] leading-relaxed">
          <span className="font-semibold">⏳ Your referral code will become active once your payment is received and your order is confirmed.</span>{" "}
          You can share it now — your friends can save it and use it as soon as it goes live.
        </div>
      ) : referralCode ? (
        <div className="bg-forest/5 border border-forest/20 rounded-xl p-3.5 mb-3 text-[13px] text-forest leading-relaxed">
          <span className="font-semibold">✅ Your referral code is active!</span>{" "}
          Share it with friends and earn {fmt(referralAmount)} credit every time someone orders using your code.
        </div>
      ) : null}

      <div className="flex gap-2">
        <button onClick={handleWhatsApp} disabled={!referralCode}
          className="flex-1 rounded-pill bg-[#25D366] text-primary-foreground py-2.5 text-xs font-semibold interactive disabled:opacity-50">
          📱 Share on WhatsApp
        </button>
        <button onClick={handleInstagram} disabled={!referralCode}
          className="flex-1 rounded-pill bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-primary-foreground py-2.5 text-xs font-semibold interactive disabled:opacity-50">
          📷 Share on Instagram
        </button>
      </div>
    </div>
  );
}
