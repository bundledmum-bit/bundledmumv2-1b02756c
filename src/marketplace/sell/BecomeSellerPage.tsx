import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";

/**
 * Become a seller, the public entry and value screen. Anyone can read it. The
 * CTA routes a logged out visitor through the existing storefront login (with a
 * returnTo back here), and an existing seller straight to their dashboard.
 */
export default function BecomeSellerPage() {
  const { isLoggedIn, loading, seller } = useSeller();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && seller) navigate("/sell/dashboard", { replace: true });
  }, [loading, seller, navigate]);

  const steps = [
    { n: "1", t: "You list it", s: "Add clear photos and an honest description. It goes live once our team has checked it." },
    { n: "2", t: "A buyer pays BundledMum", s: "We hold the money safely, the buyer is protected and so are you." },
    { n: "3", t: "You ship it", s: "We share the buyer's delivery details after payment, then you send the item." },
    { n: "4", t: "We pay you", s: "Once the buyer confirms it arrived, we pay your bank account. Simple." },
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
    <div className="mkt-page">
      <button className="mkt-linkback" onClick={() => navigate("/")}>‹ Back to marketplace</button>
      <h1>Turn outgrown baby things into cash</h1>
      <p className="lede">
        List the pram, the cot, the maternity dresses you will not wear again. We handle the payment
        and hold it safe for both sides, so selling here is calm, not stressful.
      </p>

      <div className="mkt-value">
        {steps.map((st) => (
          <div className="mkt-value-step" key={st.n}>
            <div className="mkt-value-num">{st.n}</div>
            <div>
              <b>{st.t}</b>
              <span>{st.s}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mkt-fieldgroup" style={{ marginTop: 20 }}>
        <div className="mkt-group-label">What you need</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          A phone number we can reach you on, a bank account in your name for payouts, and clear photos
          of what you are selling. It takes about four minutes, and listing is free. We add a small
          markup for the buyer, so you keep your full asking price.
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><BMLoadingAnimation size={90} /></div>
      ) : (
        <button className="mkt-primary" style={{ marginTop: 18 }} onClick={startCta}>
          {isLoggedIn ? "Start selling" : "Log in to start selling"}
        </button>
      )}
      <p className="mkt-help" style={{ textAlign: "center", marginTop: 10 }}>
        Free to list, trusted quality, checked by our team.
      </p>
    </div>
  );
}
