import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Premium storefront hero. The foreground (title, subtitle, CTAs, arrows, dots)
 * is STATIC; only the background image cross-fades between slides. A strong
 * scrim keeps the copy legible over any photo. Copy stays DB-driven: pass the
 * brand hero copy in `content` (hero_title / hero_subtitle / cta_button_text)
 * and a set of real images (featured bundles / products) in `images`.
 *
 * TODO(backend): admin-curated hero copy/imagery would come from a field such
 * as site_settings.home_hero_slides. See the backend audit report.
 */
export type HeroContent = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

const AUTOPLAY_MS = 5000;

export default function HeroCarousel({ images, content }: { images: string[]; content: HeroContent }) {
  // Dedupe and drop empties so the dots match what actually shows.
  const imgs = useMemo(() => Array.from(new Set(images.filter(Boolean))), [images]);
  const count = imgs.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  // Auto-advance. Depending on `active` restarts the clock after any manual
  // navigation, so a tap does not immediately get overridden by autoplay.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setActive((p) => (p + 1) % count);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [count, active, paused]);

  const go = (i: number) => setActive(((i % count) + count) % count);

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  return (
    <div
      className="relative rounded-[24px] overflow-hidden shadow-[0_18px_50px_-24px_rgba(20,45,35,0.55)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative h-[440px] md:h-[520px] w-full bg-forest">
        {/* Cross-fading background images (the only thing that moves) */}
        {imgs.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-out ${i === active ? "opacity-100" : "opacity-0"}`}
          />
        ))}

        {/* Legibility scrim: dark from the bottom and the left so the fixed
            copy in the bottom-left always reads, whatever image is showing. */}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/45 to-foreground/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/75 via-foreground/25 to-transparent" />

        {/* STATIC foreground content */}
        <div className="relative z-10 h-full flex flex-col justify-end p-6 pb-16 md:p-12 md:pb-16 max-w-[600px]">
          {content.eyebrow && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85 mb-2.5">
              {content.eyebrow}
            </span>
          )}
          <h2 className="pf text-white font-bold text-[30px] leading-[1.08] md:text-[48px] drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
            {content.title}
          </h2>
          {content.subtitle && (
            <p className="mt-2.5 text-white/90 text-sm md:text-base max-w-[460px] leading-relaxed drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
              {content.subtitle}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link
              to={content.ctaHref}
              className="rounded-pill bg-coral text-white px-6 py-3 text-sm font-semibold hover:bg-coral-dark transition-colors inline-flex items-center gap-1.5 shadow-lg shadow-coral/30"
            >
              {content.ctaLabel} <ArrowRight className="w-4 h-4" />
            </Link>
            {content.secondaryLabel && content.secondaryHref && (
              <Link
                to={content.secondaryHref}
                className="rounded-pill bg-white/15 border border-white/60 text-white px-5 py-3 text-sm font-semibold hover:bg-white/25 backdrop-blur-sm transition-colors"
              >
                {content.secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* STATIC pagination dots */}
      {count > 1 && (
        <div className="absolute right-5 md:right-12 bottom-6 flex items-center gap-1.5 z-20">
          {imgs.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show image ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-7 bg-coral" : "w-1.5 bg-white/60 hover:bg-white/90"}`}
            />
          ))}
        </div>
      )}

      {/* STATIC arrows (desktop) */}
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => go(active - 1)}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm items-center justify-center text-foreground shadow-md hover:bg-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => go(active + 1)}
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm items-center justify-center text-foreground shadow-md hover:bg-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}
