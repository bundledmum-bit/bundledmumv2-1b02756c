import { Link } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import MarketplaceSeo from "../components/MarketplaceSeo";
import { useMarketplacePolicySettings, naira } from "../policy/policySettings";
import { useMarketplaceWhatsAppNumber, waContextHref } from "../lib/whatsapp";
import { useHeroListings, useMarketplaceStats, type HeroListing } from "../data/useListings";
import { formatNaira, conditionLabel } from "../lib/format";

/**
 * Buyer "how it works" page (design 40a/41a). Told as one illustrative
 * scenario — finding a stroller from a stranger — with a diagram of where
 * the money actually sits at every step, rather than an abstract list of
 * rules. Written in direct second person ("you", "your") rather than the
 * design's own third-person "she", so the reader is the one in the story,
 * not watching someone else go through it. The scenario is a narrative
 * device only, never presented as a real testimonial; every number that IS
 * a claim (seller/listing counts, day windows, the refund-timing wording)
 * is real and, where it changes day to day, read live via
 * useMarketplacePolicySettings / useMarketplaceStats rather than hardcoded
 * — the same discipline the five policy pages already follow (a stale
 * number here has drifted before).
 *
 * Never "refunded immediately": wording matches BuyerProtectionPage.tsx and
 * the policy pages exactly — refunded the same day the seller confirms the
 * return arrived back, since sellers get returnConfirmDays to do that.
 *
 * Single flat DOM order (mobile's own correct sequence: scenario, worry,
 * teaser, steps, safety net, closing) laid out with CSS grid-template-areas
 * at desktop rather than a duplicated tree — .mkt-how-railcta is the one
 * desktop-only addition (an extra CTA beside the steps column, hidden on
 * mobile where the closing section already has its own), and
 * .mkt-how-answer-teaser is the one mobile-only block (desktop's rail skips
 * it per the design). See marketplace.css for the grid-area assignment.
 */
function heroLocation(l: HeroListing): string {
  const city = l.location_city?.trim();
  const state = l.location_state?.trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || "Nigeria";
}

export default function HowItWorksPage() {
  const { data: s, isLoading } = useMarketplacePolicySettings();
  const { data: stats } = useMarketplaceStats();
  const { data: sample = [] } = useHeroListings(4);
  const number = useMarketplaceWhatsAppNumber();
  const itemCount = stats?.liveListingCount;
  const browseLabel = itemCount != null ? `Browse all ${itemCount} items` : "Browse everything";

  if (isLoading || !s) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  return (
    <>
      <MarketplaceSeo
        title="How buying works"
        description="Your money is held by BundledMum until you confirm your item arrived as described. Here's exactly how a purchase works, step by step."
      />

      <div className="mkt-how-hero">
        <div className="inner">
          <span className="eyebrow">How buying works</span>
          <h1>You've found the item you want. Here's what happens next.</h1>
        </div>
      </div>

      <div className="mkt-how-body">
        <div className="mkt-how-scenario">
          <span className="ic" aria-hidden>🧑🏽</span>
          <p>You've found something you want — say a stroller for {naira(42500)}, a third of the shop price — from another mum you've never met.</p>
        </div>

        <div className="mkt-how-worry">
          <span aria-hidden>🤔</span>
          <p>"What if I pay her and she just&nbsp;… doesn't send it?"</p>
        </div>

        <div className="mkt-how-answer-teaser">
          <p className="lead">Here's the answer: your money never touches her account until you say so.</p>
          <p className="sub">Six steps below, and where your money sits at every one of them.</p>
        </div>

        <div className="mkt-how-steps">
          <div className="mkt-how-step">
            <span className="num">1</span>
            <div className="body">
              <div className="t">You find the item you want</div>
              <div className="d">Photos, price, condition notes — all checked by us before it ever went live.</div>
            </div>
          </div>

          <div className="mkt-how-step">
            <span className="num">2</span>
            <div className="body">
              <div className="t">You pay. It goes to BundledMum, not the seller</div>
              <div className="money-diagram">
                <span aria-hidden>🧑🏽</span><span className="arr on" aria-hidden>→</span>
                <span className="held">{naira(42500)} held by BundledMum</span>
                <span className="arr" aria-hidden>→</span><span className="dim" aria-hidden>🧑🏾‍🦱</span>
              </div>
              <div className="d small">The seller cannot touch this money yet.</div>
            </div>
          </div>

          <div className="mkt-how-step">
            <span className="num">3</span>
            <div className="body">
              <div className="t">We hand you the seller's contact</div>
              <div className="d">Now that your payment is safely with us, not before.</div>
            </div>
          </div>

          <div className="mkt-how-step">
            <span className="num">4</span>
            <div className="body">
              <div className="t">You message the seller directly</div>
              <div className="d">Ask for a video, ask what colour, ask anything — on WhatsApp, whatever's easiest.</div>
              <div className="quote">"Hi, does it still fold flat? Can you send a quick video?"</div>
            </div>
          </div>

          <div className="mkt-how-step">
            <span className="num">5</span>
            <div className="body">
              <div className="t">You agree delivery, they send it</div>
              <div className="d">Dispatch rider, drop off — whatever suits you both. BundledMum doesn't deliver and doesn't set a delivery price.</div>
            </div>
          </div>

          <div className="mkt-how-step">
            <span className="num final">6</span>
            <div className="body">
              <div className="t">It arrives. You confirm it — only then is the money released</div>
              <div className="money-diagram">
                <span aria-hidden>🧑🏽</span><span className="arr" aria-hidden>→</span>
                <span className="held struck">held</span>
                <span className="arr on" aria-hidden>→</span><span aria-hidden>🧑🏾‍🦱</span>
              </div>
              <div className="d small">Your tap is what moves the money — nothing moves without it.</div>
            </div>
          </div>
        </div>

        <div className="mkt-how-safety">
          <div className="head"><span aria-hidden>🛡</span><span>What if it's not as described?</span></div>
          <p className="lead">You tell us, and send it back to the seller instead of confirming.</p>
          <div className="promise">
            <div className="check"><span className="tick" aria-hidden>✓</span><span>You're refunded the same day the seller confirms it arrived back</span></div>
            <p className="fine">Not "immediately" — the seller does need to receive it and say so, but from that moment your money is back with you that day. You have up to {s.disputeWindowDays} days after dispatch to report a problem; the seller then has {s.returnConfirmDays} days to confirm the return arrived.</p>
          </div>
          <p className="closing">Your money was never in the seller's hands to lose in the first place — that's the whole design.</p>
        </div>

        <Link to="/" className="mkt-how-cta mkt-how-railcta">{browseLabel}</Link>

        <div className="mkt-how-closing">
          <h2>Now go and see what other mums are letting go</h2>
          {sample.length > 0 && (
            <div className="mkt-how-closing-cards">
              {sample.map((l) => (
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
          )}
          <Link to="/" className="mkt-how-cta">{browseLabel}</Link>
          <a className="mkt-how-wa" href={waContextHref(number, "generic")} target="_blank" rel="noreferrer">Still got a question? Ask us on WhatsApp</a>
        </div>
      </div>
    </>
  );
}
