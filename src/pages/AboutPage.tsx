import { Link } from "react-router-dom";
import { usePage } from "@/hooks/usePage";

// ---------------------------------------------------------------------------
// Block-shape types — mirror the JSONB stored in pages.body_blocks for /about.
// Kept inline (rather than exported) because no other page uses this schema
// today; the editor in AdminPages.tsx imports the same defaults below.
// ---------------------------------------------------------------------------

interface AboutHero {
  emoji: string;
  headline: string;
  subtitle: string;
}
interface AboutValue {
  icon: string;
  title: string;
  body: string;
}
interface AboutCta {
  heading: string;
  body: string;
  button_label: string;
  button_link: string;
}
export interface AboutBlocks {
  hero: AboutHero;
  paragraphs: string[];
  values: AboutValue[];
  cta: AboutCta;
}

// Defaults — visually identical to the previous hardcoded About page. Used
// when pages.body_blocks is null AND exported so the admin editor can seed a
// fresh form with the same values.
export const ABOUT_DEFAULTS: AboutBlocks = {
  hero: {
    emoji: "🌿",
    headline: "Our Story",
    subtitle: "BundledMum was born from a very real moment of overwhelm.",
  },
  paragraphs: [
    "When our founder was preparing for her first baby in Lagos, she spent weeks figuring out what to pack. Every list she found was either too generic, too foreign, or too expensive for the Nigerian context.",
    "She wanted a curated, honest, properly Nigerian answer to the question every expectant mum asks: **\"What do I actually need?\"**",
    "So she built it. BundledMum is the resource she wished she had — a quiz that understands your budget and your baby, and recommends exactly what you need. Nothing more, nothing less.",
  ],
  values: [
    { icon: "🌿", title: "Curated for Nigeria", body: "Every product is selected for the Nigerian market — our climate, our budget ranges, our preferences." },
    { icon: "❤️", title: "Mum-First Always", body: "We never stock anything we wouldn't give to our own families. Quality and safety are non-negotiable." },
    { icon: "💬", title: "Real Support", body: "Our WhatsApp support team includes mums who've used these products. Real advice, not scripts." },
  ],
  cta: {
    heading: "Ready to Build Your Bundle?",
    body: "Join hundreds of Nigerian mums who've made hospital prep stress-free.",
    button_label: "Start the Quiz →",
    button_link: "/quiz",
  },
};

// Render `**bold**` as <strong class="text-forest">…</strong>. Splitting on a
// capturing regex preserves the matched groups so we can interleave plain
// text and bold spans in JSX without dangerouslySetInnerHTML.
function renderParagraph(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={i} className="text-forest">{m[1]}</strong>;
    return <span key={i}>{part}</span>;
  });
}

// Lightweight shape guard — accepts a body_blocks JSON value if it has the
// minimum required keys. Falls through to defaults otherwise so a malformed
// row never breaks the page.
function coerceBlocks(raw: any): AboutBlocks {
  if (!raw || typeof raw !== "object") return ABOUT_DEFAULTS;
  const hero = raw.hero && typeof raw.hero === "object" ? raw.hero : ABOUT_DEFAULTS.hero;
  const paragraphs = Array.isArray(raw.paragraphs) && raw.paragraphs.length > 0
    ? raw.paragraphs.filter((p: any) => typeof p === "string")
    : ABOUT_DEFAULTS.paragraphs;
  const values = Array.isArray(raw.values) && raw.values.length > 0
    ? raw.values.slice(0, 3).map((v: any, i: number) => ({
        icon: v?.icon ?? ABOUT_DEFAULTS.values[i]?.icon ?? "",
        title: v?.title ?? ABOUT_DEFAULTS.values[i]?.title ?? "",
        body: v?.body ?? ABOUT_DEFAULTS.values[i]?.body ?? "",
      }))
    : ABOUT_DEFAULTS.values;
  const cta = raw.cta && typeof raw.cta === "object" ? { ...ABOUT_DEFAULTS.cta, ...raw.cta } : ABOUT_DEFAULTS.cta;
  return {
    hero: { ...ABOUT_DEFAULTS.hero, ...hero },
    paragraphs,
    values: values.length === 3 ? values : ABOUT_DEFAULTS.values,
    cta,
  };
}

export default function AboutPage() {
  const { data: dbPage } = usePage("about");
  const blocks = coerceBlocks(dbPage?.body_blocks);
  const { hero, paragraphs, values, cta } = blocks;
  const isInternal = cta.button_link.startsWith("/");

  return (
    <div className="min-h-screen pt-[68px]">
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-5 md:px-10 py-12 md:py-24">
        <div className="max-w-[780px] mx-auto text-center">
          <div className="text-5xl mb-4">{hero.emoji}</div>
          <h1 className="pf text-3xl md:text-[50px] text-primary-foreground mb-3.5">{hero.headline}</h1>
          <p className="text-primary-foreground/70 text-[15px] md:text-[17px] leading-[1.8]">{hero.subtitle}</p>
        </div>
      </div>
      <div className="max-w-[780px] mx-auto px-5 md:px-10 py-10 md:py-[72px]">
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className={`text-text-med text-[15px] md:text-[17px] leading-[1.9] ${i === paragraphs.length - 1 ? "mb-9" : "mb-5"}`}
          >
            {renderParagraph(p)}
          </p>
        ))}
        <div className="grid md:grid-cols-3 gap-3.5 md:gap-5 mb-9">
          {values.map((v, i) => (
            <div key={`${v.title}-${i}`} className="bg-warm-cream rounded-[18px] p-5 md:p-6 text-center">
              <div className="text-3xl mb-2.5">{v.icon}</div>
              <h4 className="pf text-forest text-base mb-2">{v.title}</h4>
              <p className="text-text-med text-[13px] leading-[1.7]">{v.body}</p>
            </div>
          ))}
        </div>
        <div className="bg-forest rounded-[20px] p-7 md:p-10 text-center">
          <h2 className="pf text-primary-foreground text-xl md:text-[34px] mb-3">{cta.heading}</h2>
          <p className="text-primary-foreground/65 text-sm mb-5">{cta.body}</p>
          {isInternal ? (
            <Link to={cta.button_link} className="rounded-pill bg-coral px-8 py-3.5 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-[15px] inline-block">{cta.button_label}</Link>
          ) : (
            <a href={cta.button_link} target="_blank" rel="noopener noreferrer" className="rounded-pill bg-coral px-8 py-3.5 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-[15px] inline-block">{cta.button_label}</a>
          )}
        </div>
      </div>
    </div>
  );
}
