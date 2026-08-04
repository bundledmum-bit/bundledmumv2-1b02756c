import { Link } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import PolicyNav from "./PolicyNav";
import { useMarketplacePolicySettings, POLICY_LAST_UPDATED } from "./policySettings";

/** Seller protection (design 24a, screen 2). Same warm, visual treatment as
 * Buyer protection, mirrored content. */
export default function SellerProtectionPage() {
  const { data: s, isLoading } = useMarketplacePolicySettings();
  if (isLoading || !s) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  return (
    <>
      <PolicyNav />
      <div className="mkt-policy-hero">
        <div className="inner">
          <span className="crumb">Policies ›</span>
          <h1>Selling here is protected too</h1>
          <p className="lead">What we guarantee you, and what we expect back.</p>
          <span className="mkt-policy-updated">Last updated {POLICY_LAST_UPDATED}</span>
        </div>
      </div>

      <div className="mkt-policy-check">
        <div className="mkt-policy-check-row">
          <span className="mkt-policy-check-tick">✓</span>
          <div><b>You're paid your exact asking price</b><span>We add our markup, currently {s.markupPercent}%, on top for the buyer, nothing comes out of what you set.</span></div>
        </div>
        <div className="mkt-policy-check-row">
          <span className="mkt-policy-check-tick">✓</span>
          <div><b>Payment is guaranteed once confirmed</b><span>The buyer already paid us before you ship. Once they confirm, or {s.disputeWindowDays} days pass with no dispute, your payout is certain.</span></div>
        </div>
        <div className="mkt-policy-check-row">
          <span className="mkt-policy-check-tick">✓</span>
          <div><b>Your dispatch photo is your proof</b><span>Upload one when you ship, it's what protects you if a buyer later claims it never arrived.</span></div>
        </div>
        <div className="mkt-policy-check-row">
          <span className="mkt-policy-check-tick">✓</span>
          <div><b>Disputes are reviewed by a person</b><span>Not decided automatically. You'll be heard before any refund goes out.</span></div>
        </div>
      </div>

      <div className="mkt-policy-steps">
        <div className="mkt-card2-label">What we expect from you</div>
        <div className="mkt-step"><div className="mkt-step-num">1</div><span>Describe the item honestly, marks and all, buyers can't ask you questions before they pay.</span></div>
        <div className="mkt-step"><div className="mkt-step-num">2</div><span>Ship promptly and upload your dispatch photo as soon as you send it.</span></div>
        <div className="mkt-step"><div className="mkt-step-num final">3</div><span>Keep the sale on BundledMum. Arranging payment outside the platform breaks these protections for both of you.</span></div>
      </div>

      <div className="mkt-policy-notcover">
        <b>About strikes</b>
        <p>If a dispute finds you at fault, it's recorded as a strike. Three strikes suspends your account and pulls your listings. Most sellers never see one.</p>
      </div>

      <div className="mkt-policy-seealso">
        Full detail on payouts and strikes lives in our <Link to="/terms">Terms and conditions</Link>. See also <Link to="/buyer-protection">Buyer protection</Link>.
      </div>
    </>
  );
}
