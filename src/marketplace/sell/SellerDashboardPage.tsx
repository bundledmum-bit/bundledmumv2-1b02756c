import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, formatNaira, maskAccount, validateDisplayName } from "./sellData";

interface MyListing {
  id: string;
  title: string;
  status: string;
  final_price_naira: number | null;
  price_naira: number | null;
  image_url: string | null;
  rejection_reason: string | null;
}

const GROUPS: Array<{ key: string; label: string }> = [
  { key: "pending_review", label: "Pending review" },
  { key: "live", label: "Live" },
  { key: "sold", label: "Sold" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_PILL: Record<string, string> = {
  pending_review: "mkt-condition",
  live: "mkt-verified",
  sold: "note-tag",
  rejected: "mkt-condition",
};

/**
 * Seller dashboard. Their listings grouped by status (rejection reason shown so
 * they can fix and relist), an honest empty orders state until checkout exists,
 * masked payout details, and the entry to create another listing or edit their
 * profile. Bank and phone are only ever shown to the seller here, never public.
 */
export default function SellerDashboardPage() {
  const { loading, isLoggedIn, seller, refresh } = useSeller();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) { window.location.assign("/account/login?returnTo=" + encodeURIComponent("/marketplace/sell")); return; }
    if (!seller) navigate("/sell/setup", { replace: true });
  }, [loading, isLoggedIn, seller, navigate]);

  const { data: listings = [], isLoading: listingsLoading } = useQuery({
    queryKey: ["my-listings", seller?.id],
    enabled: !!seller?.id,
    queryFn: async (): Promise<MyListing[]> => {
      const { data } = await sdb
        .from("marketplace_listings")
        .select("id, title, status, final_price_naira, price_naira, image_url, rejection_reason")
        .eq("seller_id", seller!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as MyListing[];
    },
  });

  if (loading || !seller) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  const debit = Number(seller.outstanding_debit_naira || 0);

  return (
    <div className="mkt-page">
      <div className="rowline">
        <div>
          <h1>Your seller dashboard</h1>
          <p className="lede" style={{ marginTop: 4 }}>{seller.display_name}</p>
        </div>
        {seller.verification_tier === "verified"
          ? <span className="mkt-verified lg"><span className="mkt-verified-tick">✓</span><span>Verified</span></span>
          : <span className="mkt-condition">Basic</span>}
      </div>

      <button className="mkt-primary" style={{ marginTop: 16 }} onClick={() => navigate("/sell/new")}>List an item</button>

      {debit > 0 && (
        <div className="mkt-banner warn" style={{ marginTop: 14 }}>
          You owe BundledMum {formatNaira(debit)}. New listings are paused until this is cleared.
        </div>
      )}

      {/* listings by status */}
      {listingsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><BMLoadingAnimation size={90} /></div>
      ) : listings.length === 0 ? (
        <div className="mkt-dash-empty" style={{ marginTop: 18 }}>No listings yet. Tap list an item to add your first one.</div>
      ) : (
        GROUPS.map((g) => {
          const rows = listings.filter((l) => l.status === g.key);
          if (rows.length === 0) return null;
          return (
            <div key={g.key}>
              <div className="mkt-group-title">{g.label} ({rows.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map((l) => (
                  <div className="mkt-dash-card" key={l.id} style={{ flexWrap: "wrap" }}>
                    <div className="thumb-sq">{l.image_url && <img src={l.image_url} alt="" />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                      <div className="mini tnum">{formatNaira(l.final_price_naira ?? l.price_naira)}</div>
                    </div>
                    <span className={STATUS_PILL[l.status] || "note-tag"}>{g.label}</span>
                    {l.status === "rejected" && l.rejection_reason && (
                      <div className="mkt-banner warn" style={{ flexBasis: "100%", marginTop: 4 }}>
                        <b>Why it was rejected:</b> {l.rejection_reason}. Fix this and list it again.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* orders, empty for now */}
      <div className="mkt-group-title">Your orders</div>
      <div className="mkt-dash-empty">No orders yet. When a buyer purchases one of your items, it will show here with what to do next.</div>

      {/* payout details */}
      <div className="mkt-group-title">Payout details</div>
      {editing ? (
        <EditProfile seller={seller} onDone={async () => { setEditing(false); await refresh(); }} onCancel={() => setEditing(false)} />
      ) : (
        <div className="mkt-fieldgroup">
          <div className="rowline"><span className="mkt-group-label">Display name</span><b className="nun">{seller.display_name}</b></div>
          <div className="divider"></div>
          <div className="rowline"><span className="mkt-group-label">Bank</span><b className="nun">{seller.bank_name || "Not set"}</b></div>
          <div className="rowline"><span className="mkt-group-label">Account name</span><b className="nun">{seller.bank_account_name || "Not set"}</b></div>
          <div className="rowline"><span className="mkt-group-label">Account number</span><b className="nun tnum">{maskAccount(seller.bank_account_number)}</b></div>
          <p className="mkt-help" style={{ margin: 0 }}>We pay out here after a buyer confirms their item arrived. Only you and our team can see this.</p>
          <button className="mkt-secondary" onClick={() => setEditing(true)}>Edit display name and bank details</button>
        </div>
      )}
    </div>
  );
}

function EditProfile({ seller, onDone, onCancel }: { seller: NonNullable<ReturnType<typeof useSeller>["seller"]>; onDone: () => void; onCancel: () => void }) {
  const [displayName, setDisplayName] = useState(seller.display_name || "");
  const [bankName, setBankName] = useState(seller.bank_name || "");
  const [bankAcctName, setBankAcctName] = useState(seller.bank_account_name || "");
  const [bankAcctNumber, setBankAcctNumber] = useState(seller.bank_account_number || "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr(null);
    const nErr = validateDisplayName(displayName);
    if (nErr) { setErr(nErr); return; }
    setBusy(true);
    const { error } = await sdb.from("marketplace_sellers").update({
      display_name: displayName.trim(),
      bank_name: bankName.trim(),
      bank_account_name: bankAcctName.trim(),
      bank_account_number: bankAcctNumber.trim(),
    }).eq("id", seller.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div className="mkt-fieldgroup">
      <div className="mkt-field"><label>Display name</label><input className="mkt-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
      <div className="mkt-field"><label>Bank name</label><input className="mkt-input" value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
      <div className="mkt-field"><label>Account name</label><input className="mkt-input" value={bankAcctName} onChange={(e) => setBankAcctName(e.target.value)} /></div>
      <div className="mkt-field"><label>Account number</label><input className="mkt-input tnum" value={bankAcctNumber} onChange={(e) => setBankAcctNumber(e.target.value)} inputMode="numeric" /></div>
      {err && <div className="mkt-err">{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="mkt-secondary" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="mkt-primary" style={{ flex: 1 }} onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}
