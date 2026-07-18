import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Truck, Tag, Lock, CalendarDays, CalendarCheck, PackageOpen, Wallet,
  Clock, Sparkles, ChevronDown, ChevronRight, Check, Star, MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getBrandImage } from "@/lib/brandImage";
import { useSubscriptionSettings } from "@/hooks/useSubscription";
import { useSiteSettings, useTestimonials } from "@/hooks/useSupabaseData";
import { track as pixelTrack } from "@/lib/metaPixel";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

const GREEN = "#2D6A4F";
const GREEN_DARK = "#1E5C44";
const CORAL = "#F4845F";
const HERO_GRADIENT = `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`;

// site_settings values are jsonb strings; tolerate a double-encoded value.
const coerceSetting = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") { if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) { try { return JSON.parse(v); } catch { return v; } } return v; }
  return String(v);
};

export default function SubscribeLanding() {
  const { data: subSettings, isLoading: settingsLoading } = useSubscriptionSettings();
  const { data: site } = useSiteSettings();
  const { data: testimonials = [] } = useTestimonials(true);

  const enabled = subSettings?.subscription_enabled ?? false;
  const boxImage = coerceSetting(site?.["subscription_box_image_url"]).trim();

  const whatsapp = (site as any)?.whatsapp_number || "";
  const waUrl = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi BundledMum! I'd like to learn more about box subscriptions.")}`
    : "";

  // Real product images for the "peek inside a box" strip — pulled from
  // brands_public at runtime so the URLs are always real and current (never
  // invented). getBrandImage prefers the Supabase-stored image.
  const { data: peekProducts = [] } = useQuery({
    queryKey: ["subscribe-peek-products"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, brands:brands_public!brands_product_id_fkey(id, in_stock, image_url, stored_image_url, images)")
        .eq("is_active", true)
        .eq("is_subscribable", true)
        .limit(60);
      if (error) return [] as { img: string; name: string; slug: string | null }[];
      const out: { img: string; name: string; slug: string | null }[] = [];
      const seen = new Set<string>();
      for (const p of (data || []) as any[]) {
        // One image per product: prefer the first in-stock brand, else any brand.
        const brands = (p.brands || []) as any[];
        const brand = brands.find((b) => b.in_stock !== false) || brands[0];
        const img = brand ? (getBrandImage(brand) || brand.images?.[0] || null) : null;
        if (!img || seen.has(img)) continue; // never render a broken/duplicate image
        seen.add(img);
        out.push({ img, name: p.name || "", slug: p.slug || null });
      }
      return out;
    },
  });

  const scrollToHow = () => {
    const el = document.getElementById("how-it-works");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (settingsLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-text-light">Loading…</div>;
  }

  return (
    <div className="min-h-screen pt-20 md:pt-24 bg-white text-[#1A1A1A]">
      {/* SECTION 1 — HERO */}
      <section className="relative overflow-hidden px-4 md:px-8 pt-10 md:pt-16 pb-14 md:pb-20 text-white" style={{ background: HERO_GRADIENT }}>
        <div className="max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Copy */}
          <div className="text-center md:text-left space-y-5 md:space-y-6">
            <img src={bmLogoCoral} alt="BundledMum" className="h-8 md:h-9 mx-auto md:mx-0" />
            <h1 className="pf text-3xl md:text-5xl font-black leading-[1.08]">Never run out of the essentials again</h1>
            <p className="text-[15px] md:text-lg text-white/85 max-w-xl mx-auto md:mx-0 leading-relaxed">
              Build a set of monthly boxes for you and your baby — filled your way, delivered to your door. You pay <span className="font-semibold text-white">once, up front</span>. No card stored, no recurring charge, ever.
            </p>

            {enabled ? (
              <div className="flex flex-col sm:flex-row items-center md:items-start md:justify-start justify-center gap-2.5 pt-1">
                <Link
                  to="/subscriptions"
                  className="inline-flex items-center justify-center gap-1.5 rounded-pill px-7 py-3.5 text-sm md:text-base font-bold text-white min-h-[52px] min-w-[240px] shadow-lg shadow-black/10 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: CORAL }}
                >
                  Build your subscription <ChevronRight className="w-4 h-4" />
                </Link>
                <button
                  onClick={scrollToHow}
                  className="inline-flex items-center justify-center gap-1.5 rounded-pill border-2 border-white/70 bg-transparent px-6 py-3.5 text-sm font-bold text-white min-h-[52px] min-w-[180px] hover:bg-white/10 transition-colors"
                >
                  See how it works <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <ComingSoonInline />
            )}

            <div className="flex flex-wrap items-center md:justify-start justify-center gap-x-5 gap-y-2 text-[12px] md:text-sm text-white/90 pt-2">
              <TrustTick>Pay once — no recurring charge</TrustTick>
              <TrustTick>5% off + free delivery, every box</TrustTick>
              <TrustTick>Today's prices locked in</TrustTick>
            </div>
          </div>

          {/* Box image */}
          <div className="relative mx-auto w-full max-w-[420px]">
            <div className="rounded-[24px] overflow-hidden bg-white/10 border border-white/20 shadow-2xl shadow-black/30 aspect-square">
              {boxImage ? (
                <img src={boxImage} alt="A BundledMum monthly box" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/60 text-sm">BundledMum box</div>
              )}
            </div>
            <div className="absolute -bottom-3 -left-2 md:-left-4 rounded-pill bg-white text-forest px-4 py-2 text-xs md:text-sm font-bold shadow-lg flex items-center gap-1.5">
              <Tag className="w-4 h-4" style={{ color: CORAL }} /> 5% off + free delivery
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 — HOW IT WORKS */}
      <section id="how-it-works" className="px-4 md:px-8 py-14 md:py-20" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[1080px] mx-auto text-center">
          <SectionKicker>How it works</SectionKicker>
          <h2 className="pf text-2xl md:text-4xl font-bold mb-3">Four simple steps</h2>
          <p className="text-[15px] max-w-xl mx-auto mb-10 md:mb-14" style={{ color: "#7A7A7A" }}>
            You build it, we deliver it. No subscriptions to manage, no surprise charges.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            <Step n={1} Icon={CalendarDays} title="Choose your months" body="Pick how many months you want — minimum 2. That's how many boxes you'll build." />
            <Step n={2} Icon={PackageOpen} title="Build each box" body="Fill every box yourself with the products you want. The minimum value per box is ₦50,000." />
            <Step n={3} Icon={CalendarCheck} title="Pick your delivery day" body="Choose your first delivery date. Every box lands on that weekday, four weeks apart." />
            <Step n={4} Icon={Wallet} title="Pay once, up front" body="One payment covers every box. No card stored, no recurring charge — done." />
          </div>

          {enabled && (
            <div className="pt-10 md:pt-14">
              <Link
                to="/subscriptions"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill px-8 py-4 text-base font-bold text-white min-h-[54px] shadow-lg shadow-black/5 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: CORAL }}
              >
                Start your boxes <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3 — WHAT YOU GET */}
      <section className="px-4 md:px-8 py-14 md:py-20 bg-white">
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <SectionKicker>What you get</SectionKicker>
            <h2 className="pf text-2xl md:text-4xl font-bold">Everything works in your favour</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            <Benefit Icon={Tag} title="5% off every box" body="A standing 5% discount on every box you build — applied automatically at today's prices." />
            <Benefit Icon={Truck} title="Free delivery, always" body="Every box is delivered free, wherever you are. No minimum, no delivery fee, ever." />
            <Benefit Icon={Lock} title="Prices locked at signup" body="The prices you see today are locked in for every box — even if prices rise later." />
            <Benefit Icon={Sparkles} title="Build each box your way" body="Fill each month's box yourself. Nappies one month, formula the next — it's entirely your choice." />
            <Benefit Icon={Clock} title="Edit until 24h before" body="Change any box up to 24 hours before it's delivered, and top it up in the 48 hours before it ships." />
            <Benefit Icon={Wallet} title="Pay once, no surprises" body="One payment covers all your boxes up front. No stored card, no recurring charge, no renewals." />
          </div>
        </div>
      </section>

      {/* SECTION 4 — PEEK INSIDE (real product imagery) */}
      <section className="px-4 md:px-8 py-14 md:py-20" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <SectionKicker>Fill it your way</SectionKicker>
            <h2 className="pf text-2xl md:text-4xl font-bold mb-3">Hundreds of products, your call</h2>
            <p className="text-[15px] max-w-xl mx-auto" style={{ color: "#7A7A7A" }}>
              Nappies, wipes, formula, breast pads, maternity pads, vitamins and more — add exactly what you need to each box.
            </p>
          </div>

          {peekProducts.length > 0 && (
            <div className="bm-marquee-row">
              {/* Track holds the products TWICE (set + aria-hidden clone) so the
                  translateX(-50%) loop is seamless. */}
              <div className="bm-marquee-track">
                {[...peekProducts, ...peekProducts].map((p, i) => {
                  const isClone = i >= peekProducts.length;
                  const card = (
                    <div className="w-[112px] sm:w-[132px] md:w-[152px] aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-warm-cream border border-black/5 shadow-sm">
                      <img
                        src={p.img}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  );
                  return (
                    <div
                      key={i}
                      className={`shrink-0 mr-3 md:mr-4 ${isClone ? "bm-marquee-clone" : ""}`}
                      aria-hidden={isClone ? true : undefined}
                    >
                      {p.slug ? (
                        <Link to={`/products/${p.slug}`} className="block hover:opacity-90 transition-opacity" tabIndex={isClone ? -1 : undefined}>
                          {card}
                        </Link>
                      ) : (
                        card
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {enabled && (
            <div className="text-center mt-8 md:mt-10">
              <Link
                to="/subscriptions"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill px-6 py-3 text-sm font-bold text-white min-h-[48px] hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                Browse &amp; build your boxes <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 5 — TESTIMONIALS */}
      {testimonials.length > 0 && (
        <section className="px-4 md:px-8 py-14 md:py-20 bg-white">
          <div className="max-w-[1080px] mx-auto">
            <div className="text-center mb-10 md:mb-14">
              <SectionKicker>Loved by mums</SectionKicker>
              <h2 className="pf text-2xl md:text-4xl font-bold">Mothers trust BundledMum</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {testimonials.slice(0, 3).map((t: any, i: number) => (
                <figure key={i} className="rounded-2xl p-5 md:p-6 bg-white border border-black/5 shadow-sm" style={{ borderTop: `4px solid ${CORAL}` }}>
                  <div className="flex gap-0.5 mb-2" style={{ color: CORAL }}>
                    {Array.from({ length: Math.min(5, Math.max(1, Number(t.rating) || 5)) }).map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-current" />
                    ))}
                  </div>
                  <blockquote className="text-sm md:text-[15px] italic leading-relaxed text-[#1A1A1A]">"{t.quote}"</blockquote>
                  <figcaption className="text-[12px] mt-3 font-semibold" style={{ color: "#7A7A7A" }}>
                    — {t.customer_name}{t.customer_city ? `, ${String(t.customer_city).replace(/, Nigeria$/i, "")}` : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 6 — FAQ */}
      <section className="px-4 md:px-8 py-14 md:py-20" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <SectionKicker>Good to know</SectionKicker>
            <h2 className="pf text-2xl md:text-4xl font-bold">Common questions</h2>
          </div>
          <div className="space-y-2.5">
            <Faq q="How does a box subscription work?">
              You choose how many months you want (minimum 2) — that's how many boxes you get. You fill each box yourself with the products you want, and pay once, up front, for all of them.
            </Faq>
            <Faq q="Do you store my card or charge me again?">
              No. It's a single payment for all your boxes at signup. There's no stored card, no recurring charge and no renewals — nothing else is ever taken from you.
            </Faq>
            <Faq q="How much does each box need to be?">
              Each box must reach at least ₦50,000. You can add as much as you like above that. Every box gets 5% off and free delivery automatically.
            </Faq>
            <Faq q="When do my boxes arrive?">
              You pick your first delivery date, then each box is delivered every four weeks on that same weekday.
            </Faq>
            <Faq q="Can I change what's in a box?">
              Yes. You can edit any box up to 24 hours before it's delivered, and add items in the 48 hours before it ships. Each box can be completely different.
            </Faq>
            <Faq q="What if prices go up later?">
              The prices you see when you sign up are locked in for every box in your subscription, even if prices rise afterwards.
            </Faq>
            <Faq q="Do I need an account?">
              No — you can build and pay as a guest. We set up your account automatically after payment so you can manage your boxes.
            </Faq>
          </div>
        </div>
      </section>

      {/* SECTION 7 — FINAL CTA */}
      <section className="px-4 md:px-8 py-16 md:py-24 text-white" style={{ background: HERO_GRADIENT }}>
        <div className="max-w-[760px] mx-auto text-center space-y-5">
          <h2 className="pf text-3xl md:text-5xl font-black leading-tight">Ready to build your boxes?</h2>
          <p className="text-[15px] md:text-lg text-white/85 max-w-xl mx-auto leading-relaxed">
            Build a few months of essentials your way, pay once, and never scramble for nappies at 2am again.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-3">
            {enabled ? (
              <Link
                to="/subscriptions"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill px-7 py-3.5 text-sm md:text-base font-bold text-white min-h-[52px] min-w-[220px] shadow-lg shadow-black/10 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: CORAL }}
              >
                Build your subscription <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <ComingSoonInline />
            )}
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill border-2 border-white/70 bg-transparent px-6 py-3.5 text-sm font-bold text-white min-h-[52px] min-w-[180px] hover:bg-white/10 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Chat with us
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 mb-3 text-[11px] md:text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: "rgba(45,106,79,0.08)", color: GREEN }}>
      {children}
    </div>
  );
}

function TrustTick({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Check className="w-4 h-4 flex-shrink-0" /> {children}
    </span>
  );
}

function Benefit({ Icon, title, body }: { Icon: any; title: string; body: string }) {
  return (
    <article className="border border-black/5 rounded-2xl p-5 md:p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "rgba(45,106,79,0.1)", color: GREEN }}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-bold text-base md:text-lg">{title}</h3>
      <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "#7A7A7A" }}>{body}</p>
    </article>
  );
}

function Step({ n, Icon, title, body }: { n: number; Icon: any; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center text-center space-y-3.5">
      <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-white relative shadow-lg shadow-black/5" style={{ backgroundColor: GREEN }}>
        <Icon className="w-7 h-7" />
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow" style={{ backgroundColor: CORAL }}>{n}</span>
      </div>
      <h3 className="font-bold text-base md:text-lg">{title}</h3>
      <p className="text-sm max-w-[260px] leading-relaxed" style={{ color: "#7A7A7A" }}>{body}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-black/5 rounded-2xl overflow-hidden shadow-sm">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 text-left">
        <span className="text-sm md:text-[15px] font-semibold">{q}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: GREEN }} />
      </button>
      {open && <div className="px-4 md:px-5 pb-4 text-sm leading-relaxed" style={{ color: "#7A7A7A" }}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coming-soon waitlist inline card (swaps in when subscription_enabled=false)
// ---------------------------------------------------------------------------

function ComingSoonInline() {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const normalized = phone.replace(/\s+/g, "").trim();
    if (!/^\+?\d{10,15}$/.test(normalized)) {
      toast.error("Enter a valid phone number.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from("coming_soon_waitlist")
        .insert({ whatsapp_number: normalized });
      if (error) throw error;
      setSent(true);
      pixelTrack("Lead", { lead_source: "subscribe_waitlist", content_name: "Subscriptions coming-soon waitlist" });
      toast.success("You're on the list — we'll WhatsApp you the moment box subscriptions open.");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't add you to the list.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-md mx-auto bg-white/10 border border-white/30 rounded-pill px-4 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2">
        <Check className="w-4 h-4" /> You're on the waitlist
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto md:mx-0 space-y-2">
      <div className="text-center md:text-left text-sm font-bold text-white">Coming soon — join our waitlist</div>
      <div className="flex items-center gap-2">
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="WhatsApp number"
          inputMode="tel"
          className="flex-1 rounded-pill border-2 border-white/60 bg-white/10 text-white placeholder-white/60 px-4 py-3 text-sm outline-none min-h-[48px]"
        />
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-pill px-5 py-3 text-sm font-bold text-white min-h-[48px] disabled:opacity-60"
          style={{ backgroundColor: CORAL }}
        >
          Join
        </button>
      </div>
    </div>
  );
}
