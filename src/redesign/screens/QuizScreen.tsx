/**
 * QUIZ screen — redesign prototype v1 (budget step shown).
 * Audit buckets wired here:
 *  (a) budget question label -> site_settings.quiz_label_budget
 *  (a) minimum budget helper -> site_settings.quiz_min_budget
 *  (a) CTA label -> site_settings.quiz_cta_label
 *  (b) preset budget tier cards (Essential/Complete/Luxe + ₦ ranges): production quiz uses a
 *      free-text budget input + run_quiz_recommendation, NOT preset budget tiers. The tier ranges
 *      have no backing column. Flagged for backend decision.
 *  (c) "Step 2 of 5", progress bar, Back/Continue buttons, tier icons -> hardcoded
 */
import React from "react";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { C, serif, naira, NavProps, IconBack, IconClose, IconArrow } from "../shared";

const strip = (s: any) => (typeof s === "string" ? s.replace(/^"|"$/g, "") : s);

export default function QuizScreen({ go }: NavProps) {
  const { data: settings } = useSiteSettings();
  const budgetLabel = strip(settings?.quiz_label_budget) || "WHAT IS YOUR BUDGET?";
  const minBudget = Number(strip(settings?.quiz_min_budget)) || 80000;
  const ctaLabel = strip(settings?.quiz_cta_label) || "Build My List";

  // (b) Preset budget tiers have no backing column today.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn("[redesign:quiz] TODO(bucket-b): preset budget tiers (Essential/Complete/Luxe + ranges) have no backing column; production uses a free-text budget input.");
  }

  const tiers = [
    { name: "Essential", range: `${naira(minBudget)} – ₦400k · the must-haves`, popular: false },
    { name: "Complete", range: "₦400k – ₦900k · fully packed", popular: true },
    { name: "Luxe", range: "₦900k – ₦2.5M · premium brands", popular: false },
  ];

  return (
    <div style={{ background: C.cream }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 16px", background: "#fff", borderBottom: "1px solid #F0E8DA" }}>
        <button onClick={() => go("home")} style={{ background: "none", border: "none", cursor: "pointer" }}><IconBack color="#2A2A26" strokeWidth={1.9} /></button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Build my bundle</span>
        <button onClick={() => go("home")} style={{ background: "none", border: "none", cursor: "pointer" }}><IconClose color="#2A2A26" strokeWidth={1.9} /></button>
      </header>

      <div style={{ padding: "18px 18px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, color: C.greenDark }}>Step 2 of 5</span>
          <span style={{ color: "#8A8576" }}>Budget</span>
        </div>
        <div style={{ height: 6, background: C.line, borderRadius: 99, overflow: "hidden", marginBottom: 26 }}>
          <div style={{ width: "40%", height: "100%", background: C.green, borderRadius: 99 }} />
        </div>
        <h1 style={{ fontFamily: serif, fontSize: 27, fontWeight: 700, color: C.ink, lineHeight: 1.12, marginBottom: 8, textTransform: "capitalize" }}>{budgetLabel.toLowerCase()}</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.body, marginBottom: 22 }}>We'll match you with bundles and brands that fit comfortably within it.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tiers.map((t, i) => (
            <button key={i} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", borderWidth: t.popular ? 2 : 1, borderStyle: "solid", borderColor: t.popular ? C.green : C.line, borderRadius: 18, padding: 18, textAlign: "left", cursor: "pointer", width: "100%", position: "relative" }}>
              {t.popular && <span style={{ position: "absolute", top: 14, right: 14, background: C.coral, color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 999 }}>Popular</span>}
              <span style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 13, background: t.popular ? C.green : C.greenWash, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={t.popular ? "#fff" : C.green} strokeWidth={1.6}><path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7z" /><path d="M9 7V5.5A3 3 0 0 1 12 2.5 3 3 0 0 1 15 5.5V7" /></svg>
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: C.ink }}>{t.name}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "#8A8576" }}>{t.range}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 0, zIndex: 60, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)", borderTop: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", marginTop: 24 }}>
        <button onClick={() => go("home")} style={{ background: "#F3EFE6", color: C.greenDark, border: "none", fontSize: 15, fontWeight: 600, padding: "14px 20px", borderRadius: 14, cursor: "pointer" }}>Back</button>
        <button onClick={() => go("shop")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: C.green, color: "#fff", border: "none", fontSize: 15, fontWeight: 600, padding: 14, borderRadius: 14, cursor: "pointer" }}>
          {ctaLabel} <IconArrow size={17} color="#fff" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
