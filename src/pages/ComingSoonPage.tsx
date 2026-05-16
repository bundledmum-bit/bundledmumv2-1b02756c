import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { track as pixelTrack } from "@/lib/metaPixel";
import { analytics } from "@/lib/ga";

const NG_PHONE = /^(?:\+234|0)(70|71|80|81|90|91|80|81|70|90)\d{8}$/;

function unwrap(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return String(v);
}

export default function ComingSoonPage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["coming_soon_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", [
          "coming_soon_enabled",
          "coming_soon_heading",
          "coming_soon_subtext",
          "coming_soon_cta_label",
          "coming_soon_logo_url",
          "coming_soon_bg_color",
          "coming_soon_accent_color",
          "coming_soon_input_placeholder",
          "brand_logo_url",
        ]);
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
    staleTime: 60_000,
  });

  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "Coming Soon | BundledMum";
  }, []);

  const enabled = useMemo(() => {
    const v = settings?.coming_soon_enabled;
    return v === true || v === "true" || v === 1 || v === "1";
  }, [settings]);

  if (!isLoading && settings && !enabled) {
    return <Navigate to="/" replace />;
  }

  const heading = unwrap(settings?.coming_soon_heading) || "We're launching soon.";
  const subtext = unwrap(settings?.coming_soon_subtext) || "";
  const ctaLabel = unwrap(settings?.coming_soon_cta_label) || "Notify me on WhatsApp";
  const logoUrl = unwrap(settings?.coming_soon_logo_url) || unwrap(settings?.brand_logo_url);
  const bg = unwrap(settings?.coming_soon_bg_color) || "#FFF8F4";
  const accent = unwrap(settings?.coming_soon_accent_color) || "#F4845F";
  const placeholder = unwrap(settings?.coming_soon_input_placeholder) || "Enter your WhatsApp number e.g. 08012345678";

  const normalise = (raw: string) => {
    const digits = raw.replace(/[^\d+]/g, "");
    if (digits.startsWith("+234")) return digits;
    if (digits.startsWith("234")) return `+${digits}`;
    if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
    return digits;
  };

  const validate = (raw: string) => {
    const cleaned = raw.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("+234")) return cleaned.length === 14;
    if (cleaned.startsWith("0")) return cleaned.length === 11;
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(phone)) {
      toast.error("Please enter a valid Nigerian WhatsApp number");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("coming_soon_waitlist").insert({
        whatsapp_number: normalise(phone),
      });
      if (error) throw error;
      setDone(true);
      setPhone("");
      pixelTrack("Lead", { lead_source: "coming_soon_waitlist", content_name: "Site-wide coming-soon waitlist" });
      try { analytics.push({ event: "generate_lead", form_name: "coming_soon_waitlist" }); } catch { /* ignore */ }
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <BMLoadingAnimation size={160} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-12" style={{ background: bg }}>
      <div className="w-full max-w-xl text-center">
        {logoUrl ? (
          <img src={logoUrl} alt="BundledMum" className="h-16 md:h-20 mx-auto mb-8 object-contain" />
        ) : (
          <div className="pf font-bold text-3xl md:text-4xl mb-8" style={{ color: accent }}>BundledMum</div>
        )}

        <h1 className="pf text-2xl md:text-[34px] leading-tight font-bold text-foreground mb-4">
          {heading}
        </h1>
        {subtext && (
          <p className="font-body text-text-med text-base md:text-lg leading-relaxed mb-8 max-w-lg mx-auto">
            {subtext}
          </p>
        )}

        {done ? (
          <div className="mx-auto max-w-md rounded-2xl border-2 p-6 animate-fade-up" style={{ borderColor: accent, background: `${accent}12` }}>
            <div className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: accent }}>
              <Check className="w-6 h-6 text-white" />
            </div>
            <p className="pf text-lg font-semibold text-foreground">You're on the list!</p>
            <p className="font-body text-sm text-text-med mt-1">
              We'll WhatsApp you the moment we go live 🎉
            </p>
            <button
              onClick={() => setDone(false)}
              className="mt-4 text-xs font-semibold underline underline-offset-4 opacity-70 hover:opacity-100"
              style={{ color: accent }}
            >
              Add another number
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-3">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-pill border-2 border-border bg-white px-5 py-3.5 text-base font-body focus:border-foreground/30 outline-none transition-colors"
              style={{ borderColor: "rgba(0,0,0,0.08)" }}
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-pill px-6 py-3.5 font-body font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: accent }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? "Saving..." : ctaLabel}
            </button>
            <p className="text-xs text-text-light mt-3">
              We'll only message you about the launch. No spam, ever.
            </p>
          </form>
        )}
      </div>

      <footer className="mt-12 text-xs text-text-light font-body">
        © {new Date().getFullYear()} BundledMum
      </footer>
    </div>
  );
}
