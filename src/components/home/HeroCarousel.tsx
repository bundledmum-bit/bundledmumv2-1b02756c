import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { fmt } from "@/lib/cart";

/**
 * Premium, Jumia-inspired hero banner carousel for the storefront homepage.
 * Auto-advances, is swipeable on touch, and exposes pagination dots plus
 * desktop arrows. Presentational only: slides are built from the database in
 * PrototypeHome (hero settings + featured bundles), so copy stays DB-driven.
 *
 * TODO(backend): admin-curated hero banners have no field yet. Proposed:
 * site_settings.home_hero_slides = [{ eyebrow, title, subtitle, image_url,
 * cta_label, href, tone }]. Until then the slides derive from real data. See
 * the backend audit report.
 */
export type HeroSlide = {
  key: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  image?: string | null;
  price?: number | null;
  tone?: "brand" | "coral" | "forest";
};

const AUTOPLAY_MS = 5200;

function SlideCard({ slide }: { slide: HeroSlide }) {
  const tone = slide.tone || "brand";
  // Legible text over any image: a brand-tinted wash for the hero slide, a
  // neutral ink gradient for photo-led bundle slides.
  const overlay =
    tone === "brand"
      ? "bg-gradient-to-tr from-deep-forest via-forest/85 to-forest/45"
      : tone === "coral"
      ? "bg-gradient-to-t from-foreground/90 via-foreground/45 to-foreground/10"
      : "bg-gradient-to-t from-deep-forest/92 via-deep-forest/45 to-transparent";
  return (
    <div className="relative h-[430px] md:h-[520px] w-full overflow-hidden bg-forest">
      {slide.image && (
        <img
          src={slide.image}
          alt=""
          aria-hidden="true"
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <div className={`absolute inset-0 ${overlay}`} />
      <div className="relative z-10 h-full flex flex-col justify-end p-6 pb-16 md:p-12 md:pb-16 max-w-[600px]">
        {slide.eyebrow && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85 mb-2.5">
            {slide.eyebrow}
          </span>
        )}
        <h2 className="pf text-white font-bold text-[30px] leading-[1.08] md:text-[48px]">
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p className="mt-2.5 text-white/85 text-sm md:text-base max-w-[460px] leading-relaxed">
            {slide.subtitle}
          </p>
        )}
        {slide.price != null && (
          <p className="mt-3 font-mono-price text-white text-lg md:text-xl font-bold">{fmt(slide.price)}</p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Link
            to={slide.ctaHref}
            className="rounded-pill bg-coral text-white px-6 py-3 text-sm font-semibold hover:bg-coral-dark transition-colors inline-flex items-center gap-1.5 shadow-lg shadow-coral/30"
          >
            {slide.ctaLabel} <ArrowRight className="w-4 h-4" />
          </Link>
          {slide.secondaryLabel && slide.secondaryHref && (
            <Link
              to={slide.secondaryHref}
              className="rounded-pill border border-white/55 text-white px-5 py-3 text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              {slide.secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start", duration: 26 });
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(slides.length);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const play = useCallback(() => {
    stop();
    if (!emblaApi || slides.length <= 1) return;
    timer.current = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      emblaApi.scrollNext();
    }, AUTOPLAY_MS);
  }, [emblaApi, slides.length, stop]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    const onReInit = () => {
      setCount(emblaApi.scrollSnapList().length);
      onSelect();
    };
    onReInit();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReInit);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReInit);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    play();
    const resume = () => play();
    emblaApi.on("pointerDown", stop);
    emblaApi.on("pointerUp", resume);
    return () => {
      stop();
      emblaApi.off("pointerDown", stop);
      emblaApi.off("pointerUp", resume);
    };
  }, [emblaApi, play, stop]);

  if (!slides.length) return null;

  const goTo = (i: number) => {
    emblaApi?.scrollTo(i);
    play();
  };
  const goPrev = () => {
    emblaApi?.scrollPrev();
    play();
  };
  const goNext = () => {
    emblaApi?.scrollNext();
    play();
  };

  return (
    <div className="relative rounded-[24px] overflow-hidden shadow-[0_18px_50px_-24px_rgba(32,37,26,0.5)]" onMouseEnter={stop} onMouseLeave={play}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {slides.map((s) => (
            <div key={s.key} className="relative shrink-0 grow-0 basis-full min-w-0">
              <SlideCard slide={s} />
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <>
          {/* Pagination dots */}
          <div className="absolute left-6 md:left-12 bottom-6 flex items-center gap-1.5 z-20">
            {Array.from({ length: count }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === selected ? "w-7 bg-coral" : "w-1.5 bg-white/55 hover:bg-white/80"
                }`}
              />
            ))}
          </div>

          {/* Desktop arrows */}
          <button
            type="button"
            aria-label="Previous slide"
            onClick={goPrev}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm items-center justify-center text-foreground shadow-md hover:bg-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={goNext}
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm items-center justify-center text-foreground shadow-md hover:bg-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}
