import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { formatNaira } from "./sellData";

/**
 * Become a seller, the public entry and value screen, reskinned to the approved
 * design (green hero, five step payment card, coral primary). Anyone can read
 * it. The CTA routes a logged out visitor through the existing storefront login
 * with a returnTo back here, and an existing seller straight to the dashboard.
 */
export default function BecomeSellerPage() {
  const { isLoggedIn, loading, seller } = useSeller();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && seller) navigate("/sell/dashboard", { replace: true });
  }, [loading, seller, navigate]);

  const steps = [
    "Buyer pays BundledMum, not you",
    "We hold the money safely while you send the item",
    "You ship, and share the details with your buyer",
    "Buyer confirms it arrived as described",
    "We transfer your money to your bank account",
  ];

  const startCta = () => {
    if (loading) return;
    if (!isLoggedIn) {
      window.location.assign("/account/login?returnTo=" + encodeURIComponent("/marketplace/sell"));
      return;
    }
    navigate("/sell/setup");
  };

  return (
    <>
      <div className="mkt-sell-head">
        <div className="inner">
          <button className="mkt-sell-back" onClick={() => navigate("/")} aria-label="Back to marketplace">‹</button>
          <div className="mkt-sell-brand">BundledMum <small>Marketplace</small></div>
          <div className="hero">Sell your baby things without the wahala</div>
          <p className="sub">No haggling in your DMs, no meeting a stranger hoping they have the cash. We hold the money until your buyer confirms, then send it straight to your bank.</p>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-card2">
          <div className="mkt-card2-label">How you get paid</div>
          {steps.map((s, i) => (
            <div className="mkt-step" key={i}>
              <div className={i === steps.length - 1 ? "mkt-step-num final" : "mkt-step-num"}>{i + 1}</div>
              <span>{s}</span>
            </div>
          ))}
        </div>

        <div className="mkt-statrow">
          <div className="mkt-stat green">
            <div className="n">{formatNaira(0)}</div>
            <div className="t">to list. We add our markup on top of your price, so you keep exactly what you ask for.</div>
          </div>
          <div className="mkt-stat coral">
            <div className="n">{formatNaira(750)}</div>
            <div className="t">service fee, paid by the buyer at checkout. Never taken from you.</div>
          </div>
        </div>

        <div className="mkt-info">
          <div className="tick">✓</div>
          <div className="txt"><b style={{ fontWeight: 700 }}>Every listing is reviewed by our team</b> before it goes live, usually within a few hours. That check is why buyers trust what they find here, trusted quality every time.</div>
        </div>
      </div>

      <div className="mkt-sell-foot">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}><BMLoadingAnimation size={80} /></div>
        ) : (
          <button className="mkt-primary" onClick={startCta}>{isLoggedIn ? "Start selling" : "Log in to start selling"}</button>
        )}
        <div className="helper">Takes about four minutes to set up</div>
      </div>
    </>
  );
}
