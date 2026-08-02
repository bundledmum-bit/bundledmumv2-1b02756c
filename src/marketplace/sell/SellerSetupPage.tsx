import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, validateDisplayName } from "./sellData";

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

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAcctName, setBankAcctName] = useState("");
  const [bankAcctNumber, setBankAcctNumber] = useState("");
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) { window.location.assign("/account/login?returnTo=" + encodeURIComponent("/marketplace/sell")); return; }
    if (seller) navigate("/sell/dashboard", { replace: true });
  }, [loading, isLoggedIn, seller, navigate]);

  async function submit() {
    setError(null);
    const nErr = validateDisplayName(displayName);
    setNameErr(nErr);
    if (nErr) return;
    if (!phone.trim() || !bankName.trim() || !bankAcctName.trim() || !bankAcctNumber.trim()) {
      setError("Please fill in your phone and full bank details.");
      return;
    }
    setBusy(true);

    let cid = customerId;
    if (!cid && user) {
      const { data: created, error: cErr } = await sdb
        .from("customers").insert({ auth_user_id: user.id, email: user.email }).select("id").maybeSingle();
      if (cErr) { setBusy(false); setError(cErr.message); return; }
      cid = (created as { id: string } | null)?.id ?? null;
    }
    if (!cid) { setBusy(false); setError("We could not link your account. Please try again."); return; }

    const { error: sErr } = await sdb.from("marketplace_sellers").insert({
      customer_id: cid,
      display_name: displayName.trim(),
      phone: phone.trim(),
      bank_name: bankName.trim(),
      bank_account_name: bankAcctName.trim(),
      bank_account_number: bankAcctNumber.trim(),
      status: "active",
      verification_tier: "basic",
    });
    setBusy(false);
    if (sErr) { setError(sErr.message); return; }
    await refresh();
    navigate("/sell/dashboard", { replace: true });
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  const nameBlocked = !!nameErr;

  return (
    <>
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
          <div className="mkt-field-head"><span className="lbl">Display name</span><span className="mkt-tag public">Public</span></div>
          <input className={nameBlocked ? "mkt-input error" : "mkt-input"} value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); if (nameErr) setNameErr(null); }} placeholder="e.g. Amaka O." />
          {nameBlocked ? (
            <div className="mkt-errbox"><span className="m">!</span><span>{nameErr}</span></div>
          ) : (
            <div className="mkt-help">This is the name buyers see on your listings. No numbers, no @ and no links, first name and an initial works best.</div>
          )}
        </div>

        <div className="mkt-field">
          <div className="mkt-field-head"><span className="lbl">Phone number</span><span className="mkt-tag private">Private</span></div>
          <input className="mkt-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803..." inputMode="tel" />
          <div className="mkt-help">For BundledMum only, so we can reach you about a sale. Buyers never see this number.</div>
        </div>

        <div className="mkt-bankcard">
          <div className="mkt-bankcard-head">
            <div className="ic">₦</div>
            <div><b>Where we send your money</b><small>Kept private, and never shown to buyers</small></div>
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
            <input className="mkt-input" value={bankAcctName} onChange={(e) => setBankAcctName(e.target.value)} placeholder="Name on the account" />
            <div className="mkt-help">Must match the name on the account, otherwise your transfer will bounce back.</div>
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
