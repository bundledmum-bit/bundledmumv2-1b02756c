import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, validateDisplayName } from "./sellData";

/**
 * Seller setup, creates the marketplace_sellers row (status active, tier basic,
 * self serve, no approval gate). Collects the public display name plus the
 * private phone and bank details, which are never rendered anywhere public.
 *
 * NOTE: marketplace_sellers currently has no INSERT policy, so the insert will
 * be rejected by RLS until that policy is added on the DB side. The form is
 * complete and will work the moment the policy lands. See handoff.
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

    // Ensure a customers row keyed to this auth user exists (the seller RLS and
    // FK both key off it). Open insert policy allows this client side.
    let cid = customerId;
    if (!cid && user) {
      const { data: created, error: cErr } = await sdb
        .from("customers")
        .insert({ auth_user_id: user.id, email: user.email })
        .select("id")
        .maybeSingle();
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

  return (
    <div className="mkt-page">
      <button className="mkt-linkback" onClick={() => navigate("/sell")}>‹ Back</button>
      <h1>Set up your seller account</h1>
      <p className="lede">A few details and you can start listing. This takes about four minutes.</p>

      <div className="mkt-form">
        <div className="mkt-field">
          <label>Display name</label>
          <input className="mkt-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Amaka O." />
          <span className="mkt-help">This is the public name buyers see. No numbers, no email, no links.</span>
          {nameErr && <span className="mkt-err">{nameErr}</span>}
        </div>

        <div className="mkt-field">
          <label>Phone number</label>
          <input className="mkt-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080..." inputMode="tel" />
          <span className="mkt-help">For BundledMum to reach you. This is never shown to buyers.</span>
        </div>

        <div className="mkt-fieldgroup">
          <div className="mkt-group-label">Bank account for payouts</div>
          <p className="mkt-help" style={{ margin: 0 }}>
            BundledMum pays out to this account after a buyer confirms their item arrived. These details
            stay private, only you and our team can see them.
          </p>
          <div className="mkt-field">
            <label>Bank name</label>
            <input className="mkt-input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" />
          </div>
          <div className="mkt-field">
            <label>Account name</label>
            <input className="mkt-input" value={bankAcctName} onChange={(e) => setBankAcctName(e.target.value)} placeholder="Name on the account" />
          </div>
          <div className="mkt-field">
            <label>Account number</label>
            <input className="mkt-input" value={bankAcctNumber} onChange={(e) => setBankAcctNumber(e.target.value)} placeholder="10 digit number" inputMode="numeric" />
          </div>
        </div>

        {error && <div className="mkt-banner warn">{error}</div>}

        <button className="mkt-primary" onClick={submit} disabled={busy}>
          {busy ? "Creating your account..." : "Create seller account"}
        </button>
      </div>
    </div>
  );
}
