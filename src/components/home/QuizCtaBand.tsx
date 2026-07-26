import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useQuizCtaBand } from "@/hooks/useQuizCtaBand";

/**
 * "Build My List" band, sitting under the hero as its own module.
 *
 * Deliberately NOT a continuation of the hero: the hero is a full-bleed image
 * carousel whose CTAs are coral pills pointing at the shop. This is a bordered
 * forest-tinted card with a forest button, so it reads as a separate offer and
 * its action is unmistakably different from the slide buttons above it.
 *
 * All copy comes from homepage_sections; nothing renders without it.
 */
export default function QuizCtaBand() {
  const { band } = useQuizCtaBand();

  // No row, hidden, unreadable, or missing the parts that make it a CTA →
  // render nothing rather than a half-built band.
  if (!band || !band.title || !band.ctaLabel || !band.ctaUrl) return null;

  // The band's accent is the database's to choose, but it must never collide
  // with the hero's coral CTAs, so anything unrecognised lands on forest.
  const buttonClass = band.emphasis === "midnight"
    ? "bg-midnight hover:bg-midnight/90"
    : "bg-forest hover:bg-forest-deep";

  return (
    <section className="px-4 md:px-6 pt-2 pb-3">
      <div className="rounded-[16px] border border-forest/20 bg-forest-light/50 px-4 py-4 md:px-6 md:py-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="pf font-bold text-[17px] md:text-[20px] text-foreground leading-tight">
            {band.title}
          </h2>
          {band.subtitle && (
            <p className="text-text-med text-[13px] md:text-sm mt-1 leading-snug">
              {band.subtitle}
            </p>
          )}
        </div>
        <Link
          to={band.ctaUrl}
          className={`shrink-0 w-full md:w-auto rounded-pill ${buttonClass} text-primary-foreground px-6 min-h-[48px] text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5`}
        >
          {band.ctaLabel} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
