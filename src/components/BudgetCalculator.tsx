import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fmt } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";

const SCOPES = [
  { id: "hospital-bag", emoji: "🏥", label: "Hospital Bag", sub: "Delivery day essentials" },
  { id: "hospital-bag+general", emoji: "🏥👶", label: "Hospital + Baby Prep", sub: "Delivery day + beyond" },
];

const MULTIPLES = [
  { id: "1", label: "One", emoji: "👶" },
  { id: "2", label: "Twins", emoji: "👶👶" },
  { id: "3", label: "Triplets+", emoji: "👶👶👶" },
];

const DELIVERY = [
  { id: "vaginal", label: "Vaginal", emoji: "🤱" },
  { id: "csection", label: "C-Section", emoji: "🏥" },
  { id: "both", label: "Unsure", emoji: "🤷‍♀️" },
];

// Quiz engine v4.8 tier price ranges. Admin can override via
// site_settings.calculator_base_prices.
const DEFAULT_BASE_PRICES: Record<string, [number, number]> = {
  starter:  [178000,  400000],
  standard: [400001,  900000],
  premium:  [900001,  2500000],
};

const DEFAULT_MODIFIERS = {
  csection_low: 8000, csection_high: 16000,
  both_low: 5000, both_high: 10000,
};

function calcRange(scope: string, multiples: string, delivery: string, basePrices: Record<string, [number, number]>, modifiers: Record<string, number>) {
  return Object.entries(basePrices).map(([tier, [lo, hi]]) => {
    let low = lo, high = hi;
    if (scope === "hospital-bag+general") { low *= 1.25; high *= 1.3; }
    const m = parseInt(multiples);
    if (m === 2) { low *= 1.2; high *= 1.3; }
    if (m >= 3) { low *= 1.4; high *= 1.5; }
    if (delivery === "csection") { low += (modifiers.csection_low || 0); high += (modifiers.csection_high || 0); }
    else if (delivery === "both") { low += (modifiers.both_low || 0); high += (modifiers.both_high || 0); }
    return {
      tier,
      label: tier === "starter" ? "🌱 Starter" : tier === "standard" ? "🌿 Standard" : "✨ Premium",
      items: tier === "starter" ? "28-45 items" : tier === "standard" ? "45-75 items" : "75-130 items, top brands",
      low: Math.round(low / 500) * 500,
      high: Math.round(high / 500) * 500,
      popular: tier === "standard",
    };
  });
}

export default function BudgetCalculator() {
  const [scope, setScope] = useState("");
  const [multiples, setMultiples] = useState("");
  const [delivery, setDelivery] = useState("");
  const navigate = useNavigate();
  const { data: settings } = useSiteSettings();

  const basePrices: Record<string, [number, number]> = (() => {
    try {
      const parsed = typeof settings?.calculator_base_prices === "object" ? settings.calculator_base_prices : JSON.parse(settings?.calculator_base_prices || "null");
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
    return DEFAULT_BASE_PRICES;
  })();

  const modifiers: Record<string, number> = (() => {
    try {
      const parsed = typeof settings?.calculator_modifiers === "object" ? settings.calculator_modifiers : JSON.parse(settings?.calculator_modifiers || "null");
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
    return DEFAULT_MODIFIERS;
  })();

  const allAnswered = scope && multiples && delivery;
  const ranges = allAnswered ? calcRange(scope, multiples, delivery, basePrices, modifiers) : null;

  const startQuiz = () => {
    const params = new URLSearchParams();
    if (scope) params.set("scope", scope);
    if (multiples) params.set("multiples", multiples);
    if (delivery) params.set("delivery", delivery);
    navigate(`/quiz?${params.toString()}`);
  };

  return (
    <div className="animate-float bg-primary-foreground/[0.07] backdrop-blur-lg border border-primary-foreground/[0.11] rounded-[24px] p-5 md:p-7 overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">🧮</span>
        <h3 className="pf text-primary-foreground text-[17px] font-semibold">What Will My Bundle Cost?</h3>
      </div>
      <p className="text-primary-foreground/50 text-[11px] mb-4">Answer 3 quick questions</p>

      {/* Q1: Scope */}
      <div className="mb-3">
        <p className="text-primary-foreground/70 text-xs font-semibold mb-1.5">What are you shopping for?</p>
        <div className="flex gap-2">
          {SCOPES.map(s => (
            <button key={s.id} onClick={() => setScope(s.id)}
              className={`flex-1 rounded-xl p-2.5 text-center text-[11px] font-semibold border-[1.5px] transition-all ${scope === s.id ? "border-coral bg-coral/20 text-primary-foreground" : "border-primary-foreground/20 text-primary-foreground/60 hover:border-primary-foreground/40"}`}>
              <div className="text-lg mb-0.5">{s.emoji}</div>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Q2: Multiples */}
      <div className="mb-3">
        <p className="text-primary-foreground/70 text-xs font-semibold mb-1.5">How many babies?</p>
        <div className="flex gap-2">
          {MULTIPLES.map(m => (
            <button key={m.id} onClick={() => setMultiples(m.id)}
              className={`flex-1 rounded-xl py-2 text-center text-[11px] font-semibold border-[1.5px] transition-all ${multiples === m.id ? "border-coral bg-coral/20 text-primary-foreground" : "border-primary-foreground/20 text-primary-foreground/60 hover:border-primary-foreground/40"}`}>
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Q3: Delivery */}
      <div className="mb-4">
        <p className="text-primary-foreground/70 text-xs font-semibold mb-1.5">Delivery method?</p>
        <div className="flex gap-2">
          {DELIVERY.map(d => (
            <button key={d.id} onClick={() => setDelivery(d.id)}
              className={`flex-1 rounded-xl py-2 text-center text-[11px] font-semibold border-[1.5px] transition-all ${delivery === d.id ? "border-coral bg-coral/20 text-primary-foreground" : "border-primary-foreground/20 text-primary-foreground/60 hover:border-primary-foreground/40"}`}>
              {d.emoji} {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {ranges && (
        <div className="animate-fade-in border-t border-primary-foreground/10 pt-3 mb-3">
          <p className="text-primary-foreground/60 text-[11px] font-semibold mb-2">💡 Your estimated bundle range:</p>
          <div className="space-y-1.5">
            {ranges.map(r => (
              <div key={r.tier} className={`rounded-lg px-3 py-2 ${r.popular ? "bg-coral/20 border border-coral/30" : "bg-primary-foreground/[0.06]"}`}>
                <div className="flex justify-between items-center">
                  <span className="text-primary-foreground text-xs font-bold">{r.label}</span>
                  <span className="text-coral font-bold text-xs">{fmt(r.low)} – {fmt(r.high)}</span>
                </div>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-primary-foreground/50 text-[10px]">{r.items}</span>
                  {r.popular && <span className="text-coral text-[9px] font-bold">Most Popular ⭐</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={startQuiz}
        className="block w-full rounded-pill bg-coral py-2.5 font-body font-semibold text-sm text-primary-foreground hover:bg-coral-dark interactive text-center">
        Build My Perfect List →
      </button>
      <p className="text-primary-foreground/30 text-[10px] text-center mt-1.5">Takes 60 seconds · Your answers carry over</p>
    </div>
  );
}
