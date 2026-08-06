import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, missingNameParts, parseBankNameMismatch, previewDisplayName, genericErrorMessage } from "./sellData";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";

/**
 * Seller setup, reskinned to the design. Creates the marketplace_sellers row
 * (status active, tier basic, self serve). Display name is public and validated
 * (no digits, @ or URL); phone and bank details are private and never public.
 *
 * NOTE: marketplace_sellers has no INSERT policy yet, so the insert is rejected
 * by RLS until that policy is added on the DB side. See handoff.
 */
export default function SellerSetupPage() {
  const { user, isLoggedIn, loading, customerId, seller, refresh } = useSeller();
  const navigate = useNavigate();

  const [legalFirstName, setLegalFirstName] = useState("");
  const [legalLastName, setLegalLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAcctName, setBankAcctName] = useState("");
  const [bankAcctNumber, setBankAcctNumber] = useState("");
  const [bankNameErr, setBankNameErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live guidance only, not a submit blocker on every keystroke: which of the
  // legal name parts the account name is missing right now, the same
  // substring test the database trigger runs (see missingNameParts). Only
  // shows once all three fields have something in them.
  const missing = missingNameParts(bankAcctName, legalFirstName, legalLastName);
  // Preview only, the database derives the real display_name from a trigger
  // the moment both legal names are saved (see previewDisplayName's own doc).
  const namePreview = previewDisplayName(legalFirstName, legalLastName);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) { sendToMarketplaceLogin("/sell", "sell"); return; }
    if (seller) navigate("/sell/dashboard", { replace: true });
  }, [loading, isLoggedIn, seller, navigate]);

  async function submit() {
    setError(null); setBankNameErr(null);
    if (!phone.trim() || !bankName.trim() || !bankAcctName.trim() || !bankAcctNumber.trim()) {
      setError("Please fill in your phone and full bank details.");
      return;
    }
    if (!legalFirstName.trim() || !legalLastName.trim()) {
      setError("Please add your legal first and last name, so we can confirm the bank account is genuinely yours.");
      return;
    }
    // Client-side guidance before submitting, mirroring the database's own
    // check exactly. This is not the safety net, the database enforces this
    // regardless of what happens here, but it saves the seller a round trip.
    const stillMissing = missingNameParts(bankAcctName, legalFirstName, legalLastName);
    if (stillMissing.length > 0) {
      setBankNameErr(`The account name needs to include your name, ${legalFirstName.trim()} and ${legalLastName.trim()}, so we can confirm it is yours.`);
      return;
    }
    setBusy(true);

    let cid = customerId;
    if (!cid && user) {
      const { data: created, error: cErr } = await sdb
        .from("customers").insert({ auth_user_id: user.id, email: user.email }).select("id").maybeSingle();
      if (cErr) { setBusy(false); setError(genericErrorMessage("customer link", cErr)); return; }
      cid = (created as { id: string } | null)?.id ?? null;
    }
    if (!cid) { setBusy(false); setError("We could not link your account. Please try again."); return; }

    // No display_name here: a database trigger derives it from the legal
    // names the moment both are present, and overwrites anything sent.
    const { error: sErr } = await sdb.from("marketplace_sellers").insert({
      customer_id: cid,
      legal_first_name: legalFirstName.trim(),
      legal_last_name: legalLastName.trim(),
      phone: phone.trim(),
      bank_name: bankName.trim(),
      bank_account_name: bankAcctName.trim(),
      bank_account_number: bankAcctNumber.trim(),
      status: "active",
      verification_tier: "basic",
    });
    setBusy(false);
    if (sErr) {
      // The database enforces the name match regardless of the client check
      // above, this is the recovery path if a mismatch somehow slips past it.
      // Never show the raw database error for this case.
      const mismatch = parseBankNameMismatch(sErr.message, legalFirstName, legalLastName);
      if (mismatch) { setBankNameErr(mismatch); return; }
      setError(genericErrorMessage("seller setup", sErr));
      return;
    }
    await refresh();
    navigate("/sell/dashboard", { replace: true });
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  return (
    <>
      <MarketplaceTitle title="Set up your seller account" />
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row">
            <button className="mkt-sell-back" onClick={() => navigate("/sell")} aria-label="Back">‹</button>
          </div>
          <h1>Set up your seller account</h1>
          <p className="sub">Two minutes. We ask for your bank details now so your money can move the moment a sale is confirmed.</p>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-field">
          <div className="mkt-field-head"><span className="lbl">Legal first name</span><span className="mkt-tag private">Private</span></div>
          <input className="mkt-input" value={legalFirstName}
            onChange={(e) => { setLegalFirstName(e.target.value); if (bankNameErr) setBankNameErr(null); }} placeholder="e.g. Amaka" />
        </div>
        <div className="mkt-field">
          <div className="mkt-field-head"><span className="lbl">Legal last name</span><span className="mkt-tag private">Private</span></div>
          <input className="mkt-input" value={legalLastName}
            onChange={(e) => { setLegalLastName(e.target.value); if (bankNameErr) setBankNameErr(null); }} placeholder="e.g. Okafor" />
          <div className="mkt-help">Your real name, as it appears on your bank account. We only ever show buyers your first name and a last initial, never your full surname, this is what confirms your bank account is genuinely yours.</div>
        </div>

        {namePreview && (
          <div className="mkt-reassure">
            <div className="mkt-reassure-tick">✓</div>
            <div className="mkt-reassure-text">Buyers will see: {namePreview}</div>
          </div>
        )}

        <div className="mkt-field">
          <div className="mkt-field-head"><span className="lbl">Phone number</span><span className="mkt-tag public">Shared after a sale</span></div>
          <input className="mkt-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803..." inputMode="tel" />
          <div className="mkt-help">After a buyer pays, we share this number with them so the two of you can agree delivery, in person or by post, and who covers the cost if you're posting it. You get their number too. It is never shown on a public listing. Required, this is how buyers reach you.</div>
        </div>

        <div className="mkt-bankcard">
          <div className="mkt-bankcard-head">
            <div className="ic">₦</div>
            <div><b>Where we send your money</b><small>Kept private, and never shown to buyers</small></div>
          </div>

          <div className="mkt-reassure">
            <div className="mkt-reassure-tick">✓</div>
            <div className="mkt-reassure-text">
              The name on your bank account needs to match your name above. This protects you as much as it protects buyers, it is how we make sure a payout can only ever go to an account that is genuinely yours, not a suspicion of you specifically, just something every seller here goes through.
            </div>
          </div>

          <div className="mkt-field">
            <span className="mkt-uplabel">Bank</span>
            <input className="mkt-input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Guaranty Trust Bank" />
          </div>
          <div className="mkt-field">
            <span className="mkt-uplabel">Account number</span>
            <input className="mkt-input" value={bankAcctNumber} onChange={(e) => setBankAcctNumber(e.target.value)} placeholder="10 digit number" inputMode="numeric" />
          </div>
          <div className="mkt-field">
            <span className="mkt-uplabel">Account name</span>
            <input className={bankNameErr ? "mkt-input error" : "mkt-input"} value={bankAcctName}
              onChange={(e) => { setBankAcctName(e.target.value); if (bankNameErr) setBankNameErr(null); }} placeholder="Name on the account" />
            {bankNameErr ? (
              <div className="mkt-errbox"><span className="m">!</span><span>{bankNameErr}</span></div>
            ) : missing.length > 0 ? (
              <div className="mkt-help" style={{ color: "var(--mkt-error)" }}>
                This does not look like it includes your {missing.length === 2 ? "first and last name" : missing[0] === "first" ? "first name" : "last name"} yet.
              </div>
            ) : (
              <div className="mkt-help">Must match the name on the account, otherwise your transfer will bounce back.</div>
            )}
          </div>
        </div>

        {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" onClick={submit} disabled={busy}>{busy ? "Creating your account..." : "Save and continue"}</button>
        <div className="helper">You can change these details any time</div>
      </div>
    </>
  );
}
