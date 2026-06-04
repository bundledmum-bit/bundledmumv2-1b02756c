import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Truck, Tag, Calendar, RefreshCw, Lock, Shield,
  PackageOpen, CalendarCheck, Smile,
  ChevronDown, ChevronRight, Check, Star, MessageCircle,
  Baby, HeartPulse,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscriptionSettings } from "@/hooks/useSubscription";
import { useSiteSettings, useTestimonials } from "@/hooks/useSupabaseData";
import { track as pixelTrack } from "@/lib/metaPixel";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

const GREEN = "#2D6A4F";
const GREEN_DARK = "#1E5C44";
const CORAL = "#F4845F";

export default function SubscribeLanding() {
  const { data: subSettings, isLoading: settingsLoading } = useSubscriptionSettings();
  const { data: site } = useSiteSettings();
  const { data: testimonials = [] } = useTestimonials(true);

  const whatsapp = (site as any)?.whatsapp_number || "";
  const waUrl = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi BundledMum! I'd like to learn more about subscriptions.")}`
    : "";

  const discountPct = subSettings?.discount_pct ?? 10;
  const enabled = subSettings?.subscription_enabled ?? false;

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
      <section
        className="relative px-4 md:px-8 pt-10 md:pt-16 pb-14 md:pb-20 text-white"
        style={{ background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 100%)` }}
      >
        <div className="max-w-[880px] mx-auto text-center space-y-6">
          <img src={bmLogoCoral} alt="BundledMum" className="h-9 md:h-10 mx-auto" />
          <h1 className="pf text-3xl md:text-5xl font-black leading-tight">Never Run Out of the Essentials Again</h1>
          <p className="text-sm md:text-lg text-white/85 max-w-xl mx-auto leading-relaxed">
            Subscribe to your maternity and baby supplies. Choose your delivery day. We handle the rest.
          </p>

          {enabled ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <Link
                to="/subscriptions"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill px-6 py-3 text-sm font-bold text-white min-h-[48px] min-w-[240px] hover:opacity-90"
                style={{ backgroundColor: CORAL }}
              >
                Start My Subscription <ChevronRight className="w-4 h-4" />
              </Link>
              <button
                onClick={scrollToHow}
                className="inline-flex items-center justify-center gap-1.5 rounded-pill border-2 border-white/80 bg-transparent px-6 py-3 text-sm font-bold text-white min-h-[48px] min-w-[200px] hover:bg-white/10"
              >
                See How It Works <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <ComingSoonInline />
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] md:text-sm text-white/90 pt-3">
            <TrustTick>Free delivery on every order</TrustTick>
            <TrustTick>Cancel anytime after 4 deliveries</TrustTick>
            <TrustTick>{discountPct}% off every item</TrustTick>
          </div>
        </div>
      </section>

      {/* SECTION 2 — THE PROBLEM */}
      <section className="px-4 md:px-8 py-12 md:py-16" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[640px] mx-auto text-center space-y-4">
          <h2 className="pf text-2xl md:text-3xl font-bold">Running out of nappies at 2am is not a vibe.</h2>
          <p className="text-[15px] leading-relaxed" style={{ color: "#7A7A7A" }}>
            You have enough to think about. Between feeds, appointments, and barely sleeping — the last thing you need is to realise you are down to your last pack of breast pads.
          </p>
          <p className="text-[15px] leading-relaxed" style={{ color: "#7A7A7A" }}>
            <b className="text-[#1A1A1A]">BundledMum subscriptions</b> mean your essentials arrive automatically, on a day that works for you, before you run out.
          </p>
        </div>
      </section>

      {/* SECTION 3 — BENEFITS */}
      <section className="px-4 md:px-8 py-12 md:py-16 bg-white">
        <div className="max-w-[1080px] mx-auto">
          <h2 className="pf text-2xl md:text-3xl font-bold text-center mb-8">Everything a subscription should be</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Benefit
              Icon={Truck}
              title="Free Delivery. Always."
              body="Every single subscription delivery is free. No minimum order, no exceptions. That is money back in your pocket every month."
            />
            <Benefit
              Icon={Tag}
              title={`${discountPct}% Off Every Order`}
              body={`Subscribers save ${discountPct}% on every delivery at today's price for the whole cycle. The savings add up fast.`}
            />
            <Benefit
              Icon={Calendar}
              title="You Choose Your Delivery Day"
              body="Monday? Saturday? Whatever works for your week. Pick a day and we show up. Every time. Change it any time from your account."
            />
            <Benefit
              Icon={RefreshCw}
              title="Set It and Forget It"
              body="Pay upfront for your cycle of deliveries. We fulfil them automatically on your day. No reordering. No remembering. No stress."
            />
            <Benefit
              Icon={Lock}
              title="Today's Price, Locked In"
              body="The price you subscribe at is what you pay for every delivery in that cycle — even if prices rise. Renew at current prices, but within each cycle, you are protected."
            />
            <Benefit
              Icon={Shield}
              title="No Nasty Surprises"
              body="Minimum 4 deliveries, then cancel any time. No hidden fees. No long contracts. You are always in control."
            />
          </div>
        </div>
      </section>

      {/* SECTION 4 — HOW IT WORKS */}
      <section id="how-it-works" className="px-4 md:px-8 py-12 md:py-16" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[960px] mx-auto text-center">
          <h2 className="pf text-2xl md:text-3xl font-bold mb-8">Three steps. Then it just runs.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <Step n={1} Icon={PackageOpen} title="Pick Your Essentials" body="Browse consumable products — nappies, wipes, breast pads, formula, maternity pads and more. Tick what you need, set quantities." />
            <Step n={2} Icon={CalendarCheck} title="Choose Your Schedule" body="Weekly, every 2 weeks, or monthly. Pick your delivery day. Pay upfront for your cycle." />
            <Step n={3} Icon={Smile} title="We Deliver. You Rest." body="Your box arrives on your chosen day, automatically, every cycle. Free delivery, every time." />
          </div>

          {enabled && (
            <div className="pt-10">
              <Link
                to="/subscriptions"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill px-8 py-4 text-base font-bold text-white min-h-[52px] hover:opacity-90"
                style={{ backgroundColor: CORAL }}
              >
                Start My Subscription <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 5 — WHAT YOU CAN SUBSCRIBE TO */}
      <section className="px-4 md:px-8 py-12 md:py-16 bg-white">
        <div className="max-w-[960px] mx-auto">
          <h2 className="pf text-2xl md:text-3xl font-bold text-center mb-8">From nappies to nipple cream</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CategoryBlock title="For Baby" items={[
              { emoji: "🍼", label: "Baby Formula" },
              { emoji: "👶", label: "Nappies" },
              { emoji: "🧻", label: "Baby Wipes" },
              { emoji: "💊", label: "Vitamin D Drops" },
              { emoji: "🧴", label: "Nappy Rash Cream" },
            ]} />
            <CategoryBlock title="For Mum" items={[
              { emoji: "🩺", label: "Maternity Pads" },
              { emoji: "👙", label: "Breast Pads" },
              { emoji: "🤱", label: "Nipple Cream" },
              { emoji: "🧤", label: "Disposable Underwear" },
              { emoji: "💊", label: "Prenatal Vitamins" },
            ]} />
          </div>
          <p className="text-xs text-center mt-6" style={{ color: "#7A7A7A" }}>
            Choose exactly which products go in your box. Add or swap items before each renewal.
          </p>
          {enabled && (
            <div className="text-center mt-6">
              <Link
                to="/subscriptions"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill px-5 py-3 text-sm font-bold text-white min-h-[44px] hover:opacity-90"
                style={{ backgroundColor: GREEN }}
              >
                See All Subscribable Products <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 6 — VS SINGLE PURCHASE */}
      <section className="px-4 md:px-8 py-12 md:py-16" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[880px] mx-auto">
          <h2 className="pf text-2xl md:text-3xl font-bold text-center mb-8">Why subscribe instead of reordering?</h2>

          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-black/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-5 py-3 font-semibold" style={{ color: "#7A7A7A" }}></th>
                  <th className="text-center px-5 py-3 font-semibold" style={{ color: "#7A7A7A" }}>Regular order</th>
                  <th className="text-center px-5 py-3 font-bold text-white" style={{ backgroundColor: GREEN }}>Subscribe</th>
                </tr>
              </thead>
              <tbody>
                <CompareRow label="Free delivery"       reg={<>✗ <span className="text-xs text-[#7A7A7A]">(paid)</span></>}   sub="✓ Always" />
                <CompareRow label="Discount"            reg="✗"                                                              sub={`✓ ${discountPct}% off`} />
                <CompareRow label="Choose delivery day" reg="✗"                                                              sub="✓" />
                <CompareRow label="Auto-delivery"       reg={<>✗ <span className="text-xs text-[#7A7A7A]">you reorder</span></>} sub="✓ Automatic" />
                <CompareRow label="Price protection"    reg="✗"                                                              sub="✓ Locked per cycle" />
                <CompareRow label="Never run out"       reg="✗"                                                              sub="✓" />
              </tbody>
            </table>
          </div>

          {/* Mobile — stacked cards */}
          <div className="md:hidden grid grid-cols-2 gap-3">
            <MobileCompareCol title="Regular" rows={[
              <>✗ <span className="text-[11px]">paid delivery</span></>,
              "✗ No discount",
              "✗ Fixed slot",
              <>✗ <span className="text-[11px]">you reorder</span></>,
              "✗ No protection",
              "✗ Runs out",
            ]} tone="grey" />
            <MobileCompareCol title="Subscribe" rows={[
              "✓ Always free",
              `✓ ${discountPct}% off`,
              "✓ Your day",
              "✓ Automatic",
              "✓ Locked per cycle",
              "✓ Stocked up",
            ]} tone="green" />
          </div>

          <p className="text-center text-sm mt-6" style={{ color: "#7A7A7A" }}>
            The maths is simple. The peace of mind is priceless.
          </p>

          {enabled && (
            <div className="text-center mt-6">
              <Link
                to="/subscriptions"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill px-6 py-3 text-sm font-bold text-white min-h-[48px] hover:opacity-90"
                style={{ backgroundColor: CORAL }}
              >
                Subscribe &amp; Save <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 7 — TESTIMONIALS */}
      {testimonials.length > 0 && (
        <section className="px-4 md:px-8 py-12 md:py-16 bg-white">
          <div className="max-w-[960px] mx-auto">
            <h2 className="pf text-2xl md:text-3xl font-bold text-center mb-8">Mothers trust BundledMum</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {testimonials.slice(0, 3).map((t: any, i: number) => (
                <figure
                  key={i}
                  className="relative pl-5 pr-4 py-4 rounded-xl"
                  style={{ backgroundColor: "#FFF8F4", borderLeft: `4px solid ${CORAL}` }}
                >
                  <div className="flex gap-0.5 mb-1" style={{ color: CORAL }}>
                    {Array.from({ length: Math.min(5, Math.max(1, Number(t.rating) || 5)) }).map((_, j) => (
                      <Star key={j} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                  <blockquote className="text-sm italic leading-relaxed text-[#1A1A1A]">"{t.quote}"</blockquote>
                  <figcaption className="text-[11px] mt-2" style={{ color: "#7A7A7A" }}>
                    — {t.customer_name}{t.customer_city ? `, ${String(t.customer_city).replace(/, Nigeria$/i, "")}` : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 8 — FAQ */}
      <section className="px-4 md:px-8 py-12 md:py-16" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[720px] mx-auto">
          <h2 className="pf text-2xl md:text-3xl font-bold text-center mb-8">Common questions</h2>
          <div className="space-y-2">
            <Faq q="How many deliveries do I pay for?">
              A minimum of 4 deliveries per cycle. You can choose up to 13 deliveries for weekly, 7 for every 2 weeks, or 6 for monthly — all paid upfront at the start of each cycle.
            </Faq>
            <Faq q="Can I cancel?">
              Yes. After your minimum 4 deliveries, cancel any time from your account. Your remaining paid deliveries will still arrive. No refund is issued for deliveries already paid for.
            </Faq>
            <Faq q="What if prices change?">
              Your price is locked for each cycle you pay for. If product prices go up, you pay the locked rate until your cycle ends. Renewal charges at current prices at that time.
            </Faq>
            <Faq q="Can I change what is in my box?">
              Yes. You can add new products any time, and swap brands or quantities before each cycle renews. Items already in a current cycle cannot be removed mid-cycle.
            </Faq>
            <Faq q="Is delivery really free?">
              Yes. Every subscription delivery is free, no matter what is in your box or where you are in Lagos.
            </Faq>
            <Faq q="What payment methods work?">
              Card payment only — this lets us charge automatically each cycle. Bank transfer is not available for subscriptions.
            </Faq>
          </div>
        </div>
      </section>

      {/* SECTION 9 — FINAL CTA */}
      <section
        className="px-4 md:px-8 py-14 md:py-20 text-white"
        style={{ background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 100%)` }}
      >
        <div className="max-w-[720px] mx-auto text-center space-y-4">
          <h2 className="pf text-2xl md:text-4xl font-black leading-tight">Your supplies. Your schedule. Your peace of mind.</h2>
          <p className="text-sm md:text-base text-white/85 max-w-xl mx-auto">
            Join BundledMum Subscribe and stop worrying about running out.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-3">
            {enabled ? (
              <Link
                to="/subscriptions"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill px-6 py-3 text-sm font-bold text-white min-h-[48px] min-w-[220px] hover:opacity-90"
                style={{ backgroundColor: CORAL }}
              >
                Start My Subscription <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <ComingSoonInline />
            )}
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill border-2 border-white/80 bg-transparent px-6 py-3 text-sm font-bold text-white min-h-[48px] min-w-[200px] hover:bg-white/10"
              >
                <MessageCircle className="w-4 h-4" /> Chat With Us
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

function TrustTick({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Check className="w-3.5 h-3.5" /> {children}
    </span>
  );
}

function Benefit({ Icon, title, body }: { Icon: any; title: string; body: string }) {
  return (
    <article className="border border-black/10 rounded-2xl p-5 bg-white">
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(45,106,79,0.1)", color: GREEN }}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-bold text-base">{title}</h3>
      <p className="text-sm mt-1 leading-relaxed" style={{ color: "#7A7A7A" }}>{body}</p>
    </article>
  );
}

function Step({ n, Icon, title, body }: { n: number; Icon: any; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center text-center space-y-3">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-white relative"
        style={{ backgroundColor: GREEN }}
      >
        <Icon className="w-6 h-6" />
        <span
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white"
          style={{ backgroundColor: CORAL }}
        >
          {n}
        </span>
      </div>
      <h3 className="font-bold text-base">{title}</h3>
      <p className="text-sm max-w-[240px] leading-relaxed" style={{ color: "#7A7A7A" }}>{body}</p>
    </div>
  );
}

function CategoryBlock({ title, items }: { title: string; items: Array<{ emoji: string; label: string }> }) {
  return (
    <div>
      <h3 className="pf text-lg font-bold mb-3 flex items-center gap-2">
        {title === "For Baby" ? <Baby className="w-5 h-5" style={{ color: GREEN }} /> : <HeartPulse className="w-5 h-5" style={{ color: GREEN }} />}
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {items.map(({ emoji, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: GREEN, color: GREEN, backgroundColor: "white" }}
          >
            <span>{emoji}</span> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CompareRow({ label, reg, sub }: { label: string; reg: React.ReactNode; sub: React.ReactNode }) {
  return (
    <tr className="border-t border-black/5">
      <td className="px-5 py-3 text-sm font-semibold">{label}</td>
      <td className="px-5 py-3 text-center text-sm" style={{ color: "#7A7A7A" }}>{reg}</td>
      <td className="px-5 py-3 text-center text-sm font-semibold" style={{ color: GREEN }}>{sub}</td>
    </tr>
  );
}

function MobileCompareCol({ title, rows, tone }: { title: string; rows: React.ReactNode[]; tone: "grey" | "green" }) {
  const headerBg = tone === "green" ? GREEN : "#E5E5E5";
  const headerColor = tone === "green" ? "white" : "#1A1A1A";
  const color = tone === "green" ? GREEN : "#7A7A7A";
  return (
    <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 text-center text-xs font-bold" style={{ backgroundColor: headerBg, color: headerColor }}>{title}</div>
      <ul className="divide-y divide-black/5">
        {rows.map((r, i) => (
          <li key={i} className="px-3 py-2 text-xs text-center" style={{ color }}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-semibold">{q}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: GREEN }} />
      </button>
      {open && <div className="px-4 pb-3 text-sm leading-relaxed" style={{ color: "#7A7A7A" }}>{children}</div>}
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
      toast.success("You're on the list — we'll WhatsApp you the moment subscriptions open.");
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
    <div className="max-w-md mx-auto space-y-2">
      <div className="text-center text-sm font-bold text-white">Coming Soon — join our waitlist</div>
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

