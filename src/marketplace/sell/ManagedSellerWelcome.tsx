import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMarketplaceWhatsAppNumber, waHref } from "../lib/whatsapp";

/** Seen once per device, in localStorage.
 *
 * There is no server-side "welcome seen" column and none was invented for
 * this: a fabricated RPC would have failed silently in production and this
 * screen would then have shown on every sign in. The honest cost is that it
 * can appear again on a second device, which is a far smaller problem than a
 * managed seller never seeing it at all. */
const SEEN_KEY = "bm-mkt-managed-welcome-seen";

function markSeen(sellerId: string) {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (!seen.includes(sellerId)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, sellerId]));
  } catch { /* a private window must not break a sign in */ }
}

export function hasSeenManagedWelcome(sellerId: string): boolean {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(sellerId) : false;
  } catch { return false; }
}

/**
 * What a managed seller sees the first time they sign in.
 *
 * We opened this account and their items are already up, so a blank screen or
 * a normal dashboard would be a surprise at best. Shown once, on the first
 * sign in after claiming, and never again.
 *
 * The heading says the account IS THEIRS before it says who typed it.
 * Someone who did ask for this should not have to read an apology, and
 * someone who did not should reach the way out in one tap rather than after a
 * paragraph explaining ourselves.
 *
 * The way out promises payment for anything already sold, because the
 * alternative is someone believing that objecting costs them money they have
 * earned, and that belief is what turns a rare misunderstanding into a public
 * complaint. There is no retention attempt behind that button. Anything
 * cleverer there reads as a trap.
 */
export default function ManagedSellerWelcome({ sellerId, onDone }: { sellerId: string; onDone: () => void }) {
  const [showExit, setShowExit] = useState(false);
  const navigate = useNavigate();
  const waNumber = useMarketplaceWhatsAppNumber();

  function acknowledge() {
    markSeen(sellerId);
    onDone();
  }

  // The way out goes to a real person on WhatsApp, which is where every other
  // conversation with these sellers already happens, rather than to a form
  // that files a request nobody watches.
  const objectHref = waHref(
    waNumber,
    "Hello BundledMum, I have just signed in and I did not ask for an account to be set up for me. Please take my items down and close it.",
  );

  if (showExit) {
    return (
      <div className="mkt-managed-welcome">
        <div className="mkt-managed-card">
          <h2>We will take everything down</h2>
          <p>
            Tell us and we will remove your items and close this account. Nothing of yours stays on BundledMum.
            If anything has already sold we will still pay you what you are owed, because that money is yours.
          </p>
          <div className="mkt-managed-actions">
            <a className="mkt-managed-danger" href={objectHref} target="_blank" rel="noreferrer"
              onClick={() => markSeen(sellerId)}>
              Take it all down
            </a>
            <button className="mkt-managed-secondary" onClick={() => setShowExit(false)}>Actually, leave it up</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mkt-managed-welcome">
      <div className="mkt-managed-card">
        <h2>Welcome, this account is already yours</h2>
        <p>
          We set this up for you and put your items on BundledMum, because you asked us to. Everything here
          belongs to you: your items, your money, and your details.
        </p>
        <p>
          <b>What happens now.</b> When something sells we hold the buyer's money until they confirm it arrived,
          then pay you by bank transfer. We will email you at this address every time something happens.
        </p>
        <p>
          <b>You are in charge.</b> You can change or remove any item, add new ones yourself, and update your
          bank details. Nothing needs our help any more.
        </p>
        <div className="mkt-managed-actions">
          <button className="mkt-managed-primary" onClick={() => { acknowledge(); navigate("/sell/dashboard"); }}>
            See my items
          </button>
          <button className="mkt-managed-secondary" onClick={() => setShowExit(true)}>I did not ask for this</button>
        </div>
      </div>
    </div>
  );
}
