import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import PolicyNav from "./PolicyNav";
import { useMarketplacePolicySettings, naira } from "./policySettings";
import { useFeeSettings, feeRuleSentence } from "../feeSettings";
import MarketplaceSeo from "../components/MarketplaceSeo";

const SECTIONS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "accounts", label: "Accounts and verification" },
  { id: "listing-rules", label: "Listing rules and banned items" },
  { id: "prices", label: "Prices, markup and fees" },
  { id: "negotiating", label: "Negotiating a price" },
  { id: "payment", label: "How payment and payout work" },
  { id: "delivery", label: "Delivery is between you two" },
  { id: "disputes", label: "Disputes" },
  { id: "returns", label: "Returns and refunds" },
  { id: "strikes", label: "Strikes and suspension" },
  { id: "prohibited", label: "Prohibited behaviour" },
  { id: "liability", label: "Liability" },
  { id: "changes", label: "Changes to these terms" },
];

/**
 * Terms and conditions (design 24a, screens 3 and 6). Dense reference
 * document, jump links, a 640px reading column. Every fee, markup, discount
 * cap and window amount is read live from site_settings, never hardcoded —
 * the design's own ₦750 service fee figure is stale (it is ₦1,000 now),
 * which is exactly the failure mode this avoids for every future change.
 */
export default function TermsPage() {
  const { data: s, isLoading } = useMarketplacePolicySettings();
  const { data: fee } = useFeeSettings();
  if (isLoading || !s) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  return (
    <>
      <MarketplaceSeo
        title="Terms and conditions"
        description="The terms and conditions for buying and selling used baby and children's items on BundledMum Marketplace."
      />
      <PolicyNav />
      <div className="mkt-policy-head">
        <h1>Terms and conditions</h1>
        {s.policiesUpdatedAt && <span className="mkt-policy-updated">Last updated {s.policiesUpdatedAt}</span>}
      </div>

      <div className="mkt-policy-body">
        <div className="mkt-policy-col">
          <div className="mkt-policy-section" id={SECTIONS[0].id}>
            <h2>1. Who we are</h2>
            <p>BundledMum Marketplace is operated by BundledMum Ltd. We run the platform, hold payments, and arbitrate disputes. We are not the seller of any item listed here, sellers are individuals selling their own used baby and children's things.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[1].id}>
            <h2>2. Accounts and verification</h2>
            <p>Sellers give their real legal name at verification. This name is locked once set, only BundledMum can change it, and the bank account used for payouts must be in that same name. A seller's public name shows to buyers as first name and surname initial only.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[2].id}>
            <h2>3. Listing rules and banned items</h2>
            <p>Every listing is reviewed by our team before it appears publicly, and we may reject or remove one that is inaccurate, misleading, or falls into a category we do not permit for safety reasons. Sellers must describe an item's condition honestly.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[3].id}>
            <h2>4. Prices, markup and fees</h2>
            <p>A seller sets their own asking price. BundledMum adds a markup, currently {s.markupPercent}%, and that marked up price is what buyers see and pay. Buyers also pay a service fee on each item, which is non refundable, plus Paystack's own processing fee. {fee ? `The service fee is ${feeRuleSentence(fee)} It applies to every item in an order rather than once per order.` : "The service fee applies to every item in an order rather than once per order, and the exact amount is shown at checkout before anything is paid."} Sellers pay nothing to list and receive their full asking price.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[4].id}>
            <h2>5. Negotiating a price</h2>
            <p>Where a seller marks a listing negotiable, a buyer may ask once for a lower price{s.maxDiscountPercent != null ? `, capped at ${s.maxDiscountPercent}% off the price they see` : ", capped at a percentage we set"}. The seller may accept, decline, or counter once. A buyer who receives a counter may accept or decline it, there is no further back and forth. Any agreed discount reduces the seller's share only, BundledMum's markup is unaffected.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[5].id}>
            <h2>6. How payment and payout work</h2>
            <p>A buyer pays BundledMum, never the seller directly. We hold that payment. Once the seller ships and uploads proof, and the buyer confirms the item arrived as described, or {s.disputeWindowDays} days pass after dispatch with no response, the seller's payout is released and sent to their bank account by transfer. Payouts are sent by a person, not automatically, and may take a little time to arrive.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[6].id}>
            <h2>7. Delivery is between you two</h2>
            <p>BundledMum is not a courier and does not arrange or handle shipping. Buyer and seller contact details are shared with each other only after payment, and delivery is arranged directly between them.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[7].id}>
            <h2>8. Disputes</h2>
            <p>A buyer may report a problem where an item does not match its description, this is not a change of mind return. BundledMum reviews the evidence from both sides and rules one of three outcomes: not upheld, and the seller is paid as normal; seller at fault, meaning the buyer is refunded and the seller receives a strike; or nobody at fault, meaning the buyer is refunded without a strike against the seller, for example where a courier caused the damage.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[8].id}>
            <h2>9. Returns and refunds</h2>
            <p>Where a dispute requires a return, the buyer posts the item back with proof of postage and provides their bank details. Refunds are paid by bank transfer, not back to the original card, and are sent the same day the seller confirms the returned item has arrived. If a seller does not confirm within {s.returnConfirmDays} days of the return being posted, BundledMum will confirm on their behalf and release the refund.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[9].id}>
            <h2>10. Strikes and suspension</h2>
            <p>A seller found at fault in a dispute receives a strike. Three strikes suspends the account and removes its listings automatically. A seller may also owe BundledMum money, for example the cost of return shipping we covered on their behalf, which is recovered from future payouts.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[10].id}>
            <h2>11. Prohibited behaviour</h2>
            <p>Taking a transaction off the platform once contact is shared, for example to avoid fees, removes the protections these terms describe for both parties and may result in suspension. Misrepresenting an item, providing false verification details, or attempting to circumvent review is also prohibited.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[11].id}>
            <h2>12. Liability</h2>
            <p>BundledMum facilitates the transaction and holds funds in escrow but is not a party to the sale itself. Our liability is limited to the amount actually held for the order in question.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[12].id}>
            <h2>13. Changes to these terms</h2>
            <p>We may update these terms as the marketplace changes. The date at the top of this page always reflects the latest version, and continuing to use BundledMum Marketplace after a change means you accept it.</p>
          </div>

          <div className="mkt-policy-contact">Questions about these terms? Write to us at <a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>.</div>
        </div>

        <aside className="mkt-policy-toc">
          <span className="lbl">On this page</span>
          <nav>
            {SECTIONS.map((sec, i) => <a key={sec.id} href={`#${sec.id}`}>{i + 1}. {sec.label}</a>)}
          </nav>
        </aside>
      </div>
    </>
  );
}
