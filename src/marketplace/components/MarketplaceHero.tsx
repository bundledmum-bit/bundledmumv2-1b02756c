import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useHeroListings, type HeroListing } from "../data/useListings";
import { formatNaira, conditionLabel } from "../lib/format";

/**
 * Desktop home hero (design 38a). Slide one carries the trust argument
 * beside three real listings, not behind them, since with a 3,400-view,
 * 4-tap conversion problem the page cannot afford to hide products behind
 * a slide most people never reach. Every slide keeps the same trust badge
 * and headline; only the three products underneath rotate — the design's
 * own answer to "most people never see past slide one" is that slide one
 * already has the products, so nobody has to.
 *
 * Card anatomy is the exact .mkt-card family already used on browse, so a
 * ₦1,900 item and a ₦295,000 item sit in the identical container with no
 * special-casing — only the price text differs, everything else is fixed.
 *
 * Desktop only (CSS-gated at 1024px, see marketplace.css) — mobile keeps
 * its existing home untouched. The listing order comes from
 * get_hero_listings, which ranks by view count server side, falling back
 * to newest when view data is thin. That ordering is never surfaced here:
 * no "popular", "trending", or badge of any kind, since with one completed
 * sale calling something popular would invite scrutiny it can't survive.
 */

const PER_SLIDE = 3;
const SLIDE_COUNT = 4;
const AUTOPLAY_MS = 6000;

function heroLocation(l: HeroListing): string {
  const city = l.location_city?.trim();
  const state = l.location_state?.trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || "Nigeria";
}

export default function MarketplaceHero() {
  const { data: listings = [] } = useHeroListings(PER_SLIDE * SLIDE_COUNT);
  const slides = useMemo(() => {
    const chunks: HeroListing[][] = [];
    for (let i = 0; i < listings.length; i += PER_SLIDE) chunks.push(listings.slice(i, i + PER_SLIDE));
    return chunks;
  }, [listings]);

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Slow autoplay, paused on hover — the point is browsing more product,
  // not motion for its own sake. Stilled entirely under reduced motion,
  // same convention as the WhatsApp prompt elsewhere in this codebase.
  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % slides.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [slides.length, paused]);

  useEffect(() => { if (active >= slides.length) setActive(0); }, [slides.length, active]);

  if (slides.length === 0) return null;
  const current = slides[active] ?? slides[0];

  return (
    <div
      className="mkt-homehero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mkt-homehero-panel">
        <div className="mkt-homehero-copy">
          <div className="mkt-homehero-badge">
            <span className="ic" aria-hidden>✓</span>
            <span>We hold your money until it arrives</span>
          </div>
          <h2>Buy trusted, used baby things from other Nigerian mums</h2>
          <p>You pay us first. We only release the money to the seller once you've confirmed the item arrived as described.</p>
          <div className="mkt-homehero-cta-row">
            <button
              type="button"
              className="mkt-homehero-cta"
              onClick={() => document.getElementById("mkt-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Browse everything
            </button>
            {slides.length > 1 && (
              <div className="mkt-homehero-dots">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={i === active ? "on" : ""}
                    aria-label={`Show slide ${i + 1}`}
                    onClick={() => setActive(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mkt-homehero-products">
          {current.map((l) => (
            <Link key={l.id} className="mkt-card" to={`/listing/${l.id}`}>
              <div className="mkt-card-imgwrap">
                {l.image_url ? <img className="mkt-card-img" src={l.image_url} alt={l.title} loading="lazy" /> : null}
              </div>
              <div className="mkt-card-body">
                <span className="mkt-price">{formatNaira(l.final_price_naira)}</span>
                <span className="mkt-card-title">{l.title}</span>
                <div className="mkt-trust">
                  <span className="mkt-meta">{heroLocation(l)}</span>
                  <span className="mkt-dot">·</span>
                  <span className="mkt-meta">{conditionLabel(l.condition)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
