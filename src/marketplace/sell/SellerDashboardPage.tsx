import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, formatNaira, maskAccount, validateDisplayName } from "./sellData";
import { fetchSellerOrders, groupSellerOrders, type SellerOrder } from "./sellerOrders";

interface MyListing {
  id: string;
  title: string;
  status: string;
  final_price_naira: number | null;
  price_naira: number | null;
  image_url: string | null;
  rejection_reason: string | null;
}

const GROUPS: Array<{ key: string; label: string; pill: string }> = [
  { key: "pending_review", label: "Pending review", pill: "pending" },
  { key: "live", label: "Live", pill: "live" },
  { key: "rejected", label: "Rejected", pill: "rejected" },
  { key: "sold", label: "Sold", pill: "sold" },
];

const PILL_CLASS: Record<string, string> = { "To send": "pending", Sent: "live", Paid: "sold" };

/** One order row on the dashboard, links to its detail. Payout figure only. */
function OrderRow({ o, coral, pill, onClick }: { o: SellerOrder; coral?: boolean; pill: string; onClick: () => void }) {
  return (
    <button className={coral ? "mkt-lrow" : "mkt-lrow"} style={coral ? { borderColor: "var(--mkt-coral)", borderWidth: "1.5px" } : undefined} onClick={onClick}>
      <div className="th">{o.listing?.image_url && <img src={o.listing.image_url} alt="" />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.listing?.title || "Item"}</div>
        <div className="meta">You get {formatNaira(o.seller_share_naira)}</div>
      </div>
      <span className={`mkt-st ${PILL_CLASS[pill] || "sold"}`}>{pill}</span>
    </button>
  );
}

/**
 * Seller dashboard, reskinned to the design (green header, payout card, tabs).
 * Listings grouped by status with rejection reasons; an honest empty orders
 * state; payout account masked to the last 4 digits. Bank and phone are only
 * ever shown to the seller here, never public.
 */
export default function SellerDashboardPage() {
  const { loading, isLoggedIn, seller, refresh } = useSeller();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"listings" | "orders">("listings");

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

  const { data: orders = [] } = useQuery({
    queryKey: ["seller-orders", seller?.id],
    enabled: !!seller?.id,
    queryFn: () => fetchSellerOrders(seller!.id),
  });

  if (loading || !seller) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  const { needsAction, inProgress, complete } = groupSellerOrders(orders);
  const owed = [...needsAction, ...inProgress].reduce((s, o) => s + Number(o.seller_share_naira || 0), 0);
  const debit = Number(seller.outstanding_debit_naira || 0);
  const firstName = (seller.display_name || "there").split(/\s+/)[0];

  return (
    <>
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row">
            <h1>Hi {firstName}</h1>
            <button className="link" onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit profile"}</button>
          </div>
          <div className="mkt-payout">
            <div style={{ flex: 1 }}>
              <div className="lbl">Payouts go to</div>
              <div className="acct">{seller.bank_name || "Bank not set"} {maskAccount(seller.bank_account_number)}</div>
            </div>
            <button className="mkt-outline-light" style={{ width: "auto", padding: "8px 11px", fontSize: 12 }} onClick={() => setEditing(true)}>Change</button>
          </div>
        </div>
      </div>

      <div className="mkt-sell-body">
        {editing && <EditProfile seller={seller} onDone={async () => { setEditing(false); await refresh(); }} onCancel={() => setEditing(false)} />}

        {debit > 0 && (
          <div className="mkt-debit">
            <span className="m">!</span>
            <span>You owe {formatNaira(debit)} from a refunded order. We will take it off your next payout. New listings are paused until it clears.</span>
          </div>
        )}

        <div className="mkt-tabs">
          <button className={tab === "listings" ? "mkt-tab on" : "mkt-tab"} onClick={() => setTab("listings")}>Listings <span className="c">{listings.length}</span></button>
          <button className={tab === "orders" ? "mkt-tab on" : "mkt-tab"} onClick={() => setTab("orders")}>Orders <span className="c">{orders.length}</span></button>
        </div>

        {tab === "listings" ? (
          listingsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><BMLoadingAnimation size={90} /></div>
          ) : listings.length === 0 ? (
            <div className="mkt-empty"><div className="box"></div><h3>No listings yet</h3><p>Tap list an item to add your first one. Every listing is checked by our team before it goes live.</p></div>
          ) : (
            GROUPS.map((g) => {
              const rows = listings.filter((l) => l.status === g.key);
              if (rows.length === 0) return null;
              return (
                <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {rows.map((l) => (
                    l.status === "rejected" ? (
                      <div className="mkt-lrow col" key={l.id}>
                        <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                          <div className="th">{l.image_url && <img src={l.image_url} alt="" />}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                            <div className="meta">You get {formatNaira(l.price_naira)}</div>
                          </div>
                          <span className="mkt-st rejected">Rejected</span>
                        </div>
                        {l.rejection_reason && <div className="mkt-reject">{l.rejection_reason}. Fix this and send it back to us.</div>}
                        <button className="mkt-secondary" onClick={() => navigate("/sell/new")}>Fix and resend</button>
                      </div>
                    ) : (
                      <div className={g.key === "sold" ? "mkt-lrow dim" : "mkt-lrow"} key={l.id}>
                        <div className="th">{l.image_url && <img src={l.image_url} alt="" />}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                          <div className="meta">You get {formatNaira(l.price_naira)}</div>
                        </div>
                        <span className={`mkt-st ${g.pill}`}>{g.label}</span>
                      </div>
                    )
                  ))}
                </div>
              );
            })
          )
        ) : orders.length === 0 ? (
          <>
            <div className="mkt-empty">
              <div className="box"></div>
              <h3>No sales yet</h3>
              <p>Your live listings are out there being seen. When someone buys, the order lands here with everything you need to send it off.</p>
            </div>
            <div className="mkt-card2">
              <div className="mkt-card2-label">What happens when you sell</div>
              <div className="mkt-step"><div className="mkt-step-num">1</div><span>We hold the buyer's payment and tell you straight away</span></div>
              <div className="mkt-step"><div className="mkt-step-num">2</div><span>You send the item and mark it on this screen</span></div>
              <div className="mkt-step"><div className="mkt-step-num final">3</div><span>Buyer confirms, we transfer to {seller.bank_name || "your bank"} {maskAccount(seller.bank_account_number)}</span></div>
            </div>
          </>
        ) : (
          <>
            {owed > 0 && (
              <button className="mkt-payout-card" onClick={() => navigate("/sell/payouts")}>
                <div>
                  <div className="lbl">Owed to you</div>
                  <div className="amt">{formatNaira(owed)}</div>
                  <div className="lbl" style={{ marginTop: 2 }}>to {seller.bank_name || "your bank"} {maskAccount(seller.bank_account_number)}</div>
                </div>
                <span className="go">›</span>
              </button>
            )}

            {needsAction.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="mkt-group-title">Needs your action</div>
                {needsAction.map((o) => <OrderRow key={o.id} o={o} coral pill="To send" onClick={() => navigate(`/sell/orders/${o.id}`)} />)}
              </div>
            )}
            {inProgress.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="mkt-group-title">In progress</div>
                {inProgress.map((o) => <OrderRow key={o.id} o={o} pill="Sent" onClick={() => navigate(`/sell/orders/${o.id}`)} />)}
              </div>
            )}
            {complete.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="mkt-group-title">Complete</div>
                {complete.map((o) => <OrderRow key={o.id} o={o} pill="Paid" onClick={() => navigate(`/sell/orders/${o.id}`)} />)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" onClick={() => navigate("/sell/new")}>List another item</button>
      </div>
    </>
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
    <div className="mkt-bankcard">
      <div className="mkt-field">
        <div className="mkt-field-head"><span className="lbl">Display name</span><span className="mkt-tag public">Public</span></div>
        <input className="mkt-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="mkt-field"><span className="mkt-uplabel">Bank</span><input className="mkt-input" value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
      <div className="mkt-field"><span className="mkt-uplabel">Account number</span><input className="mkt-input" value={bankAcctNumber} onChange={(e) => setBankAcctNumber(e.target.value)} inputMode="numeric" /></div>
      <div className="mkt-field"><span className="mkt-uplabel">Account name</span><input className="mkt-input" value={bankAcctName} onChange={(e) => setBankAcctName(e.target.value)} /></div>
      {err && <div className="mkt-errbox"><span className="m">!</span><span>{err}</span></div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="mkt-secondary" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="mkt-primary" style={{ flex: 1 }} onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}
