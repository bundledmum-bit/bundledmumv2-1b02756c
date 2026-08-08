import { Link } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import PolicyNav from "./PolicyNav";
import { useMarketplacePolicySettings } from "./policySettings";
import MarketplaceSeo from "../components/MarketplaceSeo";

/**
 * Buyer protection (design 24a, screen 1). Warm, visual, reassurance-first,
 * not a reference document, so no jump-link TOC (design drops it here in
 * favour of the hero + icon rows carried over from mobile).
 */
export default function BuyerProtectionPage() {
  const { data: s, isLoading } = useMarketplacePolicySettings();
  if (isLoading || !s) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  return (
    <>
      <MarketplaceSeo
        title="Buyer protection"
        description="Your money is held until you confirm your item arrived as described. What BundledMum Marketplace promises buyers, plainly explained."
      />
      <PolicyNav />
      <div className="mkt-policy-hero">
        <div className="inner">
          <h1>Buying here is protected</h1>
          <p className="lead">A plain explanation of what we promise you, and what we don't.</p>
          {s.policiesUpdatedAt && <span className="mkt-policy-updated">Last updated {s.policiesUpdatedAt}</span>}
        </div>
      </div>

      <div className="mkt-policy-check">
        <div className="mkt-policy-check-row">
          <span className="mkt-policy-check-tick">✓</span>
          <div><b>Your money is held, not sent</b><span>We hold your payment the moment you buy. The seller only gets paid once you confirm the item arrived as described, or after {s.disputeWindowDays} days pass with no issue reported.</span></div>
        </div>
        <div className="mkt-policy-check-row">
          <span className="mkt-policy-check-tick">✓</span>
          <div><b>Every seller is checked</b><span>Sellers verify their identity and bank account with us before they can list anything.</span></div>
        </div>
        <div className="mkt-policy-check-row">
          <span className="mkt-policy-check-tick">✓</span>
          <div><b>Every listing is reviewed</b><span>Nothing goes live until our team has looked at it.</span></div>
        </div>
      </div>

      <div className="mkt-policy-steps">
        <div className="mkt-card2-label">If something's wrong when it arrives</div>
        <div className="mkt-step"><div className="mkt-step-num">1</div><span>Open your order and tap Report a problem. You have until {s.disputeWindowDays} days after dispatch, before your money would otherwise release to the seller automatically</span></div>
        <div className="mkt-step"><div className="mkt-step-num">2</div><span>A real person at BundledMum reviews it, your money stays held while they do</span></div>
        <div className="mkt-step"><div className="mkt-step-num final">3</div><span>If the item isn't as described, you're refunded by bank transfer once it's posted back to the seller</span></div>
      </div>

      <div className="mkt-policy-notcover">
        <b>What this doesn't cover</b>
        <p>Simply changing your mind isn't covered, this protection is for items that don't match their listing, not preference after the fact. Anything arranged or paid for outside BundledMum isn't covered either, that's exactly why we ask you to keep everything on the platform.</p>
      </div>

      <div className="mkt-policy-seealso">
        Full detail on disputes and refunds lives in our <Link to="/terms">Terms and conditions</Link>. See also <Link to="/seller-protection">Seller protection</Link>.
      </div>
    </>
  );
}
