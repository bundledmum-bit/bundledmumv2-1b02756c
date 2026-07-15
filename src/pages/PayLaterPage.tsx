import { Link } from "react-router-dom";
import {
  ShoppingBag, ChevronDown, ChevronRight, ShieldCheck, CreditCard, CalendarClock,
  CheckCircle2, MessageCircle, Sparkles, Wallet, ClipboardCheck, PackageCheck,
} from "lucide-react";
import { useState } from "react";
import Seo from "@/components/Seo";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

const GREEN = "#2D6A4F";
const GREEN_DARK = "#1E5C44";
const CORAL = "#F4845F";
const HERO_GRADIENT = `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`;

// site_settings booleans can arrive as a real boolean or a "true"/"1" string.
const isOn = (v: unknown) => v === true || v === "true" || v === "1";

export default function PayLaterPage() {
  const { data: settings, isLoading } = useSiteSettings();
  const klumpEnabled = isOn(settings?.["payment_method_klump_enabled"]);
  const whatsappDigits = String(settings?.["whatsapp_number"] || "").replace(/\D/g, "");
  const waUrl = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent("Hi BundledMum! I'd like to ask about paying later with Klump.")}`
    : "";

  const scrollToSteps = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#FFF8F4] text-text-light">
        <div className="h-10 w-10 border-4 border-border border-t-forest rounded-full animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 md:pt-24 bg-white text-[#1A1A1A]">
      <Seo
        title="Pay Later with Klump | BundledMum"
        description="Spread the cost of your maternity and baby shopping into smaller payments with Klump, a licensed Nigerian Buy Now, Pay Later provider. Here is how it works."
      />

      {/* HERO */}
      <section className="relative overflow-hidden px-4 md:px-8 pt-10 md:pt-16 pb-14 md:pb-20 text-white" style={{ background: HERO_GRADIENT }}>
        <div className="max-w-[880px] mx-auto text-center space-y-5 md:space-y-6">
          <img src={bmLogoCoral} alt="BundledMum" className="h-8 md:h-9 mx-auto" />
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/15 px-3 py-1 text-[11px] md:text-xs font-bold uppercase tracking-wider">
            <Wallet className="w-3.5 h-3.5" /> Buy now, pay later
          </span>
          <h1 className="pf text-3xl md:text-5xl font-black leading-[1.08]">Get everything baby needs now. Pay in instalments.</h1>
          <p className="text-[15px] md:text-lg text-white/85 max-w-xl mx-auto leading-relaxed">
            BundledMum now lets you spread the cost of your maternity and baby shopping into smaller, manageable payments with Klump. Shop everything you need today, and pay over time.
          </p>

          {klumpEnabled ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
              <Link to="/shop" className="inline-flex items-center justify-center gap-1.5 rounded-pill px-7 py-3.5 text-sm md:text-base font-bold text-white min-h-[52px] min-w-[220px] shadow-lg shadow-black/10 hover:opacity-90 transition-opacity" style={{ backgroundColor: CORAL }}>
                <ShoppingBag className="w-4 h-4" /> Start Shopping
              </Link>
              <button onClick={scrollToSteps} className="inline-flex items-center justify-center gap-1.5 rounded-pill border-2 border-white/70 bg-transparent px-6 py-3.5 text-sm font-bold text-white min-h-[52px] min-w-[180px] hover:bg-white/10 transition-colors">
                See how it works <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <UnavailableNote waUrl={waUrl} />
          )}

          {klumpEnabled && (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] md:text-sm text-white/90 pt-2">
              <Tick>Powered by Klump</Tick>
              <Tick>Licensed Nigerian provider</Tick>
              <Tick>Order confirmed once approved</Tick>
            </div>
          )}
        </div>
      </section>

      {/* WHAT IT IS */}
      <section className="px-4 md:px-8 py-14 md:py-20" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[720px] mx-auto text-center space-y-4">
          <SectionKicker>What it is</SectionKicker>
          <h2 className="pf text-2xl md:text-4xl font-bold">Pay in bits, not all at once</h2>
          <p className="text-[15px] md:text-base leading-relaxed" style={{ color: "#5A5A5A" }}>
            Pay Later lets you split your order into smaller payments instead of paying everything at once. It is powered by Klump, a licensed Nigerian Buy Now, Pay Later provider. You get your full cart now, and you pay it off over time on a schedule that works for you.
          </p>
          {!klumpEnabled && (
            <div className="inline-flex items-start gap-2 rounded-card bg-white border border-black/10 px-4 py-3 text-left text-[13px]" style={{ color: "#5A5A5A" }}>
              <CalendarClock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: GREEN }} />
              <span>Pay Later is temporarily unavailable right now. You can still browse and shop, and we will let you know as soon as it is back.</span>
            </div>
          )}
        </div>
      </section>

      {/* STEP-BY-STEP */}
      <section id="how-it-works" className="px-4 md:px-8 py-14 md:py-20 bg-white">
        <div className="max-w-[820px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <SectionKicker>Step by step</SectionKicker>
            <h2 className="pf text-2xl md:text-4xl font-bold">How Pay Later works</h2>
            <p className="text-[15px] mt-3 max-w-xl mx-auto" style={{ color: "#5A5A5A" }}>Five simple steps, from cart to confirmed.</p>
          </div>

          <ol className="relative space-y-4 md:space-y-5">
            {/* Vertical connector line (desktop) */}
            <span className="hidden md:block absolute left-[27px] top-4 bottom-4 w-px" style={{ backgroundColor: "rgba(45,106,79,0.15)" }} aria-hidden />
            <StepCard n={1} Icon={ShoppingBag} title="Add what you need to your cart" body="Browse the shop and add your maternity and baby items to your cart, just like a normal order." />
            <StepCard n={2} Icon={ClipboardCheck} title="Go to checkout and add your details" body="Head to checkout and fill in your delivery details so we know where the order is going." />
            <StepCard n={3} Icon={CreditCard} title="Choose Pay Later with Klump" body="At the payment step, select Pay Later with Klump instead of paying the full amount upfront." />
            <StepCard n={4} Icon={ShieldCheck} title="Verify with Klump and pick a plan" body="You will be taken to Klump to verify your details and choose a repayment plan. Klump runs a quick eligibility check, and shows you the plan and any fees before you confirm." />
            <StepCard n={5} Icon={PackageCheck} title="Approved, and your order is confirmed" body="Once approved, your order is confirmed right away and we start preparing it. You then pay Klump back in instalments, on the plan you chose." />
          </ol>

          {klumpEnabled && (
            <div className="text-center pt-10 md:pt-14">
              <Link to="/shop" className="inline-flex items-center justify-center gap-1.5 rounded-pill px-8 py-4 text-base font-bold text-white min-h-[54px] shadow-lg shadow-black/5 hover:opacity-90 transition-opacity" style={{ backgroundColor: CORAL }}>
                <ShoppingBag className="w-4 h-4" /> Start Shopping
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* REASSURANCE / FAQ */}
      <section className="px-4 md:px-8 py-14 md:py-20" style={{ backgroundColor: "#FFF8F4" }}>
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <SectionKicker>Good to know</SectionKicker>
            <h2 className="pf text-2xl md:text-4xl font-bold">Your questions, answered</h2>
          </div>
          <div className="space-y-2.5">
            <Faq q="Is it safe?">
              Yes. Klump is a licensed Nigerian Buy Now, Pay Later provider. Your details are handled on Klump's own secure platform, and your BundledMum order is only confirmed once Klump approves you.
            </Faq>
            <Faq q="What can I pay for?">
              Your whole cart. Add everything you need for you and your baby, then choose Pay Later at checkout to spread the cost of the full order.
            </Faq>
            <Faq q="How do repayments work?">
              You repay Klump directly, on the schedule you pick with them. Klump shows you the plan and any fees clearly before you confirm, so you always know what you are agreeing to.
            </Faq>
            <Faq q="Do I need anything?">
              Just a valid Nigerian phone number and your details for Klump's quick eligibility check. It only takes a few minutes at checkout.
            </Faq>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-4 md:px-8 py-16 md:py-24 text-white" style={{ background: HERO_GRADIENT }}>
        <div className="max-w-[760px] mx-auto text-center space-y-5">
          <h2 className="pf text-3xl md:text-5xl font-black leading-tight">
            {klumpEnabled ? "Ready to shop now and pay later?" : "Browse now, and pay later soon"}
          </h2>
          <p className="text-[15px] md:text-lg text-white/85 max-w-xl mx-auto leading-relaxed">
            {klumpEnabled
              ? "Fill your cart with everything you need, choose Pay Later with Klump at checkout, and spread the cost over time."
              : "Pay Later is coming back shortly. In the meantime, fill your cart, and reach out any time if you have questions."}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-3">
            <Link to="/shop" className="inline-flex items-center justify-center gap-1.5 rounded-pill px-7 py-3.5 text-sm md:text-base font-bold text-white min-h-[52px] min-w-[220px] shadow-lg shadow-black/10 hover:opacity-90 transition-opacity" style={{ backgroundColor: CORAL }}>
              <ShoppingBag className="w-4 h-4" /> Start Shopping
            </Link>
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-pill border-2 border-white/70 bg-transparent px-6 py-3.5 text-sm font-bold text-white min-h-[52px] min-w-[200px] hover:bg-white/10 transition-colors">
                <MessageCircle className="w-4 h-4" /> Chat with us on WhatsApp
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

function UnavailableNote({ waUrl }: { waUrl: string }) {
  return (
    <div className="max-w-md mx-auto space-y-3 pt-1">
      <div className="inline-flex items-center gap-1.5 rounded-pill bg-white/15 px-3.5 py-2 text-[13px] font-semibold text-white">
        <CalendarClock className="w-4 h-4" /> Pay Later is temporarily unavailable
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
        <Link to="/shop" className="inline-flex items-center justify-center gap-1.5 rounded-pill px-6 py-3 text-sm font-bold text-white min-h-[48px] min-w-[180px] hover:opacity-90 transition-opacity" style={{ backgroundColor: CORAL }}>
          <ShoppingBag className="w-4 h-4" /> Browse the shop
        </Link>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-pill border-2 border-white/70 bg-transparent px-6 py-3 text-sm font-bold text-white min-h-[48px] min-w-[160px] hover:bg-white/10 transition-colors">
            <MessageCircle className="w-4 h-4" /> Ask us
          </a>
        )}
      </div>
    </div>
  );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 mb-3 text-[11px] md:text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: "rgba(45,106,79,0.08)", color: GREEN }}>
      <Sparkles className="w-3.5 h-3.5" /> {children}
    </div>
  );
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {children}
    </span>
  );
}

function StepCard({ n, Icon, title, body }: { n: number; Icon: any; title: string; body: string }) {
  return (
    <li className="relative flex items-start gap-4 rounded-2xl bg-white border border-black/5 shadow-sm p-4 md:p-5">
      <div className="relative flex-shrink-0">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md shadow-black/5" style={{ backgroundColor: GREEN }}>
          <Icon className="w-6 h-6" />
        </div>
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow" style={{ backgroundColor: CORAL }}>{n}</span>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <h3 className="font-bold text-base md:text-lg leading-snug">{title}</h3>
        <p className="text-sm md:text-[15px] mt-1 leading-relaxed" style={{ color: "#5A5A5A" }}>{body}</p>
      </div>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-black/5 rounded-2xl overflow-hidden shadow-sm">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 text-left min-h-[48px]" aria-expanded={open}>
        <span className="text-sm md:text-[15px] font-semibold">{q}</span>
        {open ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: GREEN }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: GREEN }} />}
      </button>
      {open && <div className="px-4 md:px-5 pb-4 text-sm leading-relaxed" style={{ color: "#5A5A5A" }}>{children}</div>}
    </div>
  );
}
