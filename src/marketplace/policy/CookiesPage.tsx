import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import PolicyNav from "./PolicyNav";
import { useMarketplacePolicySettings } from "./policySettings";
import MarketplaceSeo from "../components/MarketplaceSeo";

/** Cookies (design 24a, screen 5), short and honest, no jump links, it is
 * short enough not to need any. */
export default function CookiesPage() {
  const { data: s, isLoading } = useMarketplacePolicySettings();
  if (isLoading || !s) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  return (
    <>
      <MarketplaceSeo
        title="Cookies"
        description="A short, honest explanation of the cookies BundledMum Marketplace uses."
      />
      <PolicyNav />
      <div className="mkt-policy-head">
        <h1>Cookies</h1>
        {s.policiesUpdatedAt && <span className="mkt-policy-updated">Last updated {s.policiesUpdatedAt}</span>}
      </div>

      <div className="mkt-policy-body">
        <div className="mkt-policy-col">
          <div className="mkt-policy-section">
            <p>We keep this short because there isn't much to say. BundledMum Marketplace uses a small number of cookies, and nothing beyond what the platform needs to run.</p>
          </div>

          <div className="mkt-policy-section">
            <h2>Keeping you signed in</h2>
            <p>So you don't have to click a new email link every visit.</p>
            <span className="mkt-policy-cookie-pill">Essential, can't be switched off</span>
          </div>

          <div className="mkt-policy-section">
            <h2>Remembering your filters</h2>
            <p>Your last search location and category, so browse feels like where you left it.</p>
          </div>

          <div className="mkt-policy-section">
            <h2>Basic usage analytics</h2>
            <p>Anonymous, tells us which pages are actually used so we can improve them.</p>
          </div>

          <div className="mkt-policy-section">
            <p>We don't use advertising or tracking cookies, and we don't sell any data collected this way.</p>
          </div>

          <div className="mkt-policy-contact">Questions about cookies? Write to us at <a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>.</div>
        </div>
      </div>
    </>
  );
}
