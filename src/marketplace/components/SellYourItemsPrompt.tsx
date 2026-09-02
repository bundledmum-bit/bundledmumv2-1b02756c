import { Link } from "react-router-dom";

/**
 * The last thing on a listing page, and deliberately so.
 *
 * WHO IS ACTUALLY READING THIS. Someone at the bottom of a listing page has
 * looked at a used pram and then eight more used things. They came as a buyer,
 * but they are also a Nigerian mum with a store room, and this is the exact
 * moment the thought lands: I have one of these.
 *
 * So it speaks to that rather than shouting at them. It is about their store
 * room, not about our marketplace: no "join thousands of sellers", no
 * "start earning today", nothing that reads as an advert. The two facts that
 * actually stop people are cost and effort, so both are answered in the same
 * breath and neither is oversold.
 *
 * Last on the page because it is the thought a buyer should leave with, and
 * because putting it above the related row would interrupt someone still
 * shopping to sell at them.
 */
export default function SellYourItemsPrompt() {
  return (
    <section className="mkt-sellprompt">
      <h2>You probably have things your baby has outgrown</h2>
      <p>
        Most of us do, sitting in a store room. Someone is looking for them right now,
        the way you have been looking here. Listing is free and takes a few minutes.
      </p>
      <Link to="/sell" className="mkt-sellprompt-cta">List your own items</Link>
    </section>
  );
}
