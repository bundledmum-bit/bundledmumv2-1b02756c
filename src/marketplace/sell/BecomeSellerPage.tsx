import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";

/**
 * Become a seller, /marketplace/sell (design R1). Leads with the one true promise,
 * the seller gets exactly the price they ask for and BundledMum takes nothing out
 * of it, then the protection story. It carries NO buyer-side cost, no service fee,
 * no markup explanation, no calculator or invented stats, since the ₦750 fee is
 * the buyer's and showing it here put sellers off a cost they never pay.
 *
 * The CTA behaviour is unchanged: a logged out visitor routes through the
 * marketplace login and returns here; an existing seller goes to the dashboard.
 */
export default function BecomeSellerPage() {
  const { isLoggedIn, loading, seller } = useSeller();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && seller) navigate("/sell/dashboard", { replace: true });
  }, [loading, seller, navigate]);

  const steps = [
    "The buyer pays BundledMum, never you directly",
    "We hold that money while you get it to them",
    "You agree delivery together, in person or by post, and who covers the cost",
    "The buyer confirms it arrived",
    "We transfer your money to your bank",
  ];

  const startCta = () => {
    if (loading) return;
    if (!isLoggedIn) { sendToMarketplaceLogin("/sell", "sell"); return; }
    navigate("/sell/setup");
  };

  return (
    <>
      <MarketplaceTitle title="Sell your used baby and toddler items" />
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row">
            <button className="mkt-sell-back" onClick={() => navigate("/")} aria-label="Back to marketplace">‹</button>
          </div>
          <div className="hero">Sell your used baby and toddler items without wahala</div>
          <p className="sub">No more "is it still available?" that leads nowhere, and no dragging your baby to meet a stranger who says he will transfer and never does. You get exactly the price you asked for, we take nothing from it.</p>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-card2">
          <div className="mkt-card2-label">Nobody can run off with your item</div>
          {steps.map((s, i) => (
            <div className="mkt-step" key={i}>
              <div className={i === steps.length - 1 ? "mkt-step-num final" : "mkt-step-num"}>{i + 1}</div>
              <span>{s}</span>
            </div>
          ))}
          <p style={{ font: "400 12px/1.5 'Lato', sans-serif", color: "var(--mkt-muted)", margin: "4px 2px 0" }}>
            No one takes your item and disappears, and no one can claim they paid you when they did not. This is what a WhatsApp group cannot give you.
          </p>
        </div>

        <div className="mkt-info">
          <div className="tick">✓</div>
          <div className="txt">
            <b style={{ fontWeight: 700 }}>Free to list, however many things you have.</b> About four minutes to set up, just your phone and bank details. Every listing is checked before it goes live, and that is what keeps buyers coming here.
          </div>
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
