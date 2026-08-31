import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import MarketplaceSeo from "../components/MarketplaceSeo";
import { useMarketplacePolicySettings, naira, type MarketplacePolicySettings } from "../policy/policySettings";
import { useMarketplaceWhatsAppNumber, waContextHref } from "../lib/whatsapp";
import { useFeeSettings, feeRuleSentence, type FeeSettings } from "../feeSettings";

/**
 * FAQ page (design 41a): search plus a buyer/seller split, since the two
 * audiences never need each other's answers and a buyer having to skim past
 * seller payout questions (or vice versa) is exactly the kind of "written for
 * nobody" prose the brief rules out. Every answer states the real mechanism,
 * matching the actual rules — day windows, the ₦{X}/₦{Y} fee tiers, the
 * 24-hour offer hold — read live via useMarketplacePolicySettings so a
 * changed setting never leaves a stale number here (the same reason the five
 * policy pages already do this).
 *
 * Buyer questions/answers are the design's own text verbatim, with its
 * hardcoded numbers swapped for the live settings that back them. Seller
 * questions are not in the design (it only speced the Buying tab in detail)
 * so they're authored here from the real rules, in the seller's own voice
 * ("you list", "you get paid"), mirroring the buyer set's length and tone.
 */

interface FaqItem { q: string; a: string; }

function buyerFaq(s: MarketplacePolicySettings, fee: FeeSettings | null): FaqItem[] {
  return [
    {
      q: "How do I know this is not a scam?",
      a: "Because of how the money moves. When you pay, it goes to BundledMum, not the seller. We hold it until you tell us the item arrived as described. The seller only gets paid after that. There's nobody to scam you out of, since they never had your money to begin with.",
    },
    {
      q: "What if the seller takes my money and disappears?",
      a: "She can't. Your money sits with BundledMum, not with her, from the moment you pay. If she never sends the item, you simply don't confirm, and nothing is ever released to her.",
    },
    {
      q: "Why can't I pay on delivery?",
      a: "Because pay on delivery protects the buyer only, and leaves the seller exposed to a rider who never comes back with the cash. Holding the payment with us protects you both, which is the whole reason it works.",
    },
    {
      q: "What if the item isn't like the photos?",
      a: `You have ${s.disputeWindowDays} days after it's marked sent to report it. Post it back to the seller, and you're refunded the same day she confirms it's arrived with her — she has ${s.returnConfirmDays} days to do that. If the courier damaged it, you're still refunded and she isn't blamed.`,
    },
    {
      q: "Can I meet the seller and see it first?",
      a: "You can message her one question before buying, and once you've paid we share her contact so you can arrange delivery, ask more, even request a video. What we can't do is let money change hands outside BundledMum, that's the part that has to stay protected.",
    },
    {
      q: "Who pays for delivery, and how much?",
      a: "You and the seller sort that between yourselves once you're in contact — dispatch rider or drop off, whatever suits. BundledMum doesn't deliver and doesn't set a delivery price.",
    },
    {
      q: "Is the seller a real person?",
      a: "Yes. A green verified badge means she's completed at least one real sale with no dispute against her — we never hand it out for free. No badge just means she's newer, not that something's wrong.",
    },
    {
      q: "What does BundledMum charge me?",
      a: fee
        ? `A service fee on each item you buy, ${feeRuleSentence(fee)} You see the exact amount at checkout before you pay anything.`
        : "A service fee on each item you buy, and Paystack's own processing fee. You see the exact amount at checkout before you pay anything.",
    },
    {
      q: "Do I need an account to buy?",
      a: "No password to remember. We email you a 6-digit code and that signs you in.",
    },
    {
      q: "Can I offer a lower price?",
      a: "Some listings accept offers, you'll see the option if so. If the seller accepts, that price is held for you for 24 hours.",
    },
    {
      q: "Can I buy from several sellers at once?",
      a: "Yes. Add everything to your cart and pay once. Each seller sends their own item separately though, so things arrive at different times, and you arrange delivery with each of them.",
    },
    {
      q: "Do I pay the fee more than once if I buy several things?",
      a: fee
        ? `Yes. The fee is charged on each item, so three items means three fees. Your cart says how many, and checkout shows every one before you pay, so there is nothing to discover afterwards. Each is ${feeRuleSentence(fee)}`
        : "Yes. The fee is charged on each item, so three items means three fees. Your cart says how many, and checkout shows every one before you pay, so there is nothing to discover afterwards.",
    },
    {
      q: "Can I pay without a card?",
      a: "Yes. Choose bank transfer at checkout and Paystack gives you an account number to send to. It confirms automatically, the same as a card, so you do not have to send us a screenshot.",
    },
    {
      q: "What if a seller cannot send to my state?",
      a: "Some sellers only sell within their own state. Tell us your state at checkout and we will say so before you pay, never after, and point you to other listings in the same category that can reach you.",
    },
  ];
}

function sellerFaq(s: MarketplacePolicySettings): FaqItem[] {
  return [
    {
      q: "Will I actually get paid?",
      a: "Yes. When a buyer pays, the money goes to BundledMum, not straight to you. Once you've sent the item and she confirms it arrived as described, we pay you by bank transfer and send you a screenshot as proof.",
    },
    {
      q: "What if a buyer says it never arrived, when it did?",
      a: "We don't just take her word for it. If you've confirmed dispatch, we look at what actually happened before deciding anything, and one of three things happens: she's refunded, the courier is found to be at fault and you aren't blamed, or the report isn't upheld and you're paid as normal.",
    },
    {
      q: "How much does it cost me to list?",
      a: "Nothing. Listing is free, and our fee comes out of the buyer's side, never yours. Every listing is reviewed by our team before it goes live.",
    },
    {
      q: "When do I get paid?",
      a: "As soon as the buyer confirms your item arrived as described, we pay you by bank transfer, with a screenshot as proof it went out.",
    },
    {
      q: "What if a buyer wants to pay on delivery?",
      a: "We don't support that, and you shouldn't agree to it outside BundledMum either. Every payment goes through us first — that's what protects you from a buyer who takes the item and refuses to pay.",
    },
    {
      q: "Can a buyer just make up a fault to get a refund?",
      a: "No claim gets a refund automatically. We look at what actually happened before deciding, and if a claim doesn't hold up, it isn't upheld and you're paid as normal.",
    },
    {
      q: "What is the verified badge, and how do I earn it?",
      a: "It's earned, not given — complete one sale with no dispute against you and you get it. It tells buyers you're a seller who has actually delivered before.",
    },
    {
      q: "What happens if a dispute goes against me?",
      a: "One dispute doesn't end your selling. Three strikes suspends your ability to list, so it matters, but a single issue on one order isn't going to shut you down.",
    },
    {
      q: "Who arranges delivery, and do I have to cover it?",
      a: "You and the buyer sort it directly once you're in contact — dispatch rider or drop-off, whatever suits you both. BundledMum doesn't deliver and doesn't set or pay for delivery.",
    },
    {
      q: "Can I set a lower price if a buyer asks?",
      a: "Only if you've turned on offers for that listing. If you accept a buyer's offer, that price holds for 24 hours so she can complete payment.",
    },
  ];
}

type Tab = "buying" | "selling";

function matches(item: FaqItem, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return item.q.toLowerCase().includes(n) || item.a.toLowerCase().includes(n);
}

export default function FaqPage() {
  const { data: s, isLoading } = useMarketplacePolicySettings();
  // Null until it resolves, and the two fee answers word around that rather
  // than state a number we might not charge.
  const { data: fee } = useFeeSettings();
  const number = useMarketplaceWhatsAppNumber();
  const [tab, setTab] = useState<Tab>("buying");
  const [search, setSearch] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const buyer = useMemo(() => (s ? buyerFaq(s, fee ?? null) : []), [s, fee]);
  const seller = useMemo(() => (s ? sellerFaq(s) : []), [s]);
  const items = tab === "buying" ? buyer : seller;
  const filtered = useMemo(() => items.filter((it) => matches(it, search)), [items, search]);

  function selectTab(next: Tab) {
    setTab(next);
    setOpenIndex(0);
  }

  if (isLoading || !s) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  const waHref = waContextHref(number, "generic");

  return (
    <>
      <MarketplaceSeo
        title="Frequently asked questions"
        description="Real answers to the questions buyers and sellers actually ask about BundledMum Marketplace — how payment is held, refunds, fees, and payouts."
      />

      <div className="mkt-faq-hero">
        <div className="inner">
          <h1>Questions, answered honestly</h1>
          <div className="mkt-faq-search">
            <span className="ic" aria-hidden>🔍</span>
            <input
              type="search"
              placeholder='Search, e.g. "is this a scam" or "when do I get paid"'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search frequently asked questions"
            />
          </div>
        </div>
      </div>

      <div className="mkt-faq-body">
        <aside className="mkt-faq-rail">
          <button type="button" className={tab === "buying" ? "on" : ""} onClick={() => selectTab("buying")}>Buying</button>
          <button type="button" className={tab === "selling" ? "on" : ""} onClick={() => selectTab("selling")}>Selling</button>
          <div className="mkt-faq-rail-wa">
            Still stuck? <a href={waHref} target="_blank" rel="noreferrer">Ask us on WhatsApp</a>
          </div>
        </aside>

        <div className="mkt-faq-answers">
          {filtered.length === 0 ? (
            <div className="mkt-faq-empty">
              <span className="ic" aria-hidden>🔍</span>
              <div className="t">Nothing matched that</div>
              <p>We probably haven't written this one down yet. Ask us directly and a real person will answer, not a bot.</p>
              <a className="mkt-faq-wa-btn" href={waHref} target="_blank" rel="noreferrer">Ask us on WhatsApp</a>
            </div>
          ) : (
            filtered.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={item.q} className={isOpen ? "mkt-faq-item open" : "mkt-faq-item"}>
                  <button type="button" className="mkt-faq-q" onClick={() => setOpenIndex(isOpen ? null : i)} aria-expanded={isOpen}>
                    <span>{item.q}</span>
                    <span className="chev" aria-hidden>▾</span>
                  </button>
                  {isOpen && <p className="mkt-faq-a">{item.a}</p>}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mkt-faq-foot">
        <span>Still unsure about something?</span>
        <div className="row">
          <a className="mkt-faq-wa-btn" href={waHref} target="_blank" rel="noreferrer">Ask us on WhatsApp</a>
          <Link className="mkt-faq-browse-btn" to="/">Browse everything</Link>
        </div>
      </div>
    </>
  );
}
