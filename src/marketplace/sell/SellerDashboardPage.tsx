import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useSeller } from "./useSeller";
import { sdb, formatNaira, maskAccount, missingNameParts, parseBankNameMismatch, previewDisplayName, parseLegalNameLockError, sellerRelistListing, genericErrorMessage } from "./sellData";
import { fetchSellerOrders, groupSellerOrders, type SellerOrder } from "./sellerOrders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

interface MyListing {
  id: string;
  title: string;
  status: string;
  final_price_naira: number | null;
  price_naira: number | null;
  image_url: string | null;
  rejection_reason: string | null;
  quantity: number;
  quantity_sold: number;
  delisted_by: string | null;
  delisted_at: string | null;
}

// All five statuses a seller's listing can be in. Every group is shown with its
// count, and an empty group shows a one-line card, so a count never disagrees
// with what is on screen (the old bug: delisted counted but never rendered).
const GROUPS: Array<{ key: string; label: string; pill: string; empty: string }> = [
  { key: "live", label: "Live", pill: "live", empty: "Nothing live right now." },
  { key: "pending_review", label: "Waiting on us", pill: "pending", empty: "Nothing waiting for review." },
  { key: "sold", label: "Sold out", pill: "sold", empty: "Nothing sold out yet, your live items are still out there." },
  { key: "rejected", label: "Not approved", pill: "rejected", empty: "Nothing was sent back." },
  { key: "delisted", label: "Delisted", pill: "sold", empty: "Nothing delisted." },
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
    if (!isLoggedIn) { sendToMarketplaceLogin("/sell"); return; }
    if (!seller) navigate("/sell/setup", { replace: true });
  }, [loading, isLoggedIn, seller, navigate]);

  const { data: listings = [], isLoading: listingsLoading, refetch: refetchListings } = useQuery({
    queryKey: ["my-listings", seller?.id],
    enabled: !!seller?.id,
    queryFn: async (): Promise<MyListing[]> => {
      const { data } = await sdb
        .from("marketplace_listings")
        .select("id, title, status, final_price_naira, price_naira, image_url, rejection_reason, quantity, quantity_sold, delisted_by, delisted_at")
        .eq("seller_id", seller!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as MyListing[];
    },
  });

  const [relistTarget, setRelistTarget] = useState<MyListing | null>(null);
  const [relistBusy, setRelistBusy] = useState(false);
  const [relistError, setRelistError] = useState<string | null>(null);

  async function confirmRelist() {
    if (!relistTarget) return;
    setRelistBusy(true); setRelistError(null);
    const ok = await sellerRelistListing(relistTarget.id);
    setRelistBusy(false);
    if (!ok) {
      setRelistError("We could not put this back up. It may have been removed by our team, or your account has an outstanding balance. Message us and we will help.");
      return;
    }
    setRelistTarget(null);
    await refetchListings();
  }

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
    <div className="mkt-dashboard-page">
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
        {/* Persistent balance + list-new action, desktop only (design 18a,
            screen D8); hidden by default so mobile keeps its existing tab-
            scoped owed card and fixed footer button untouched. */}
        <div className="mkt-db-left">
          {owed > 0 && (
            <div className="mkt-db-balance">
              <div className="lbl">Owed to you</div>
              <div className="amt">{formatNaira(owed)}</div>
              <div className="lbl" style={{ marginTop: 2 }}>to {seller.bank_name || "your bank"} {maskAccount(seller.bank_account_number)}</div>
            </div>
          )}
          <button className="mkt-secondary mkt-db-list-btn" onClick={() => navigate("/sell/new")}>List something new</button>
        </div>

        <div className="mkt-db-right">
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
              return (
                <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <div className="mkt-group-title">{g.label} · {rows.length}</div>
                  {rows.length === 0 ? (
                    <div className="mkt-lrow" style={{ color: "var(--mkt-muted)", font: "400 12px/1.45 'Lato', sans-serif", display: "block" }}>{g.empty}</div>
                  ) : rows.map((l) => {
                    const total = Number(l.quantity ?? 1);
                    const soldN = Number(l.quantity_sold ?? 0);
                    const left = total - soldN;
                    const multi = total > 1;
                    const meta = g.key === "sold"
                      ? (multi ? `All ${total} sold · off browse now` : "Sold · off browse now")
                      : multi
                        ? `You get ${formatNaira(l.price_naira)} each · ${soldN} of ${total} sold`
                        : `You get ${formatNaira(l.price_naira)}`;

                    if (g.key === "rejected") {
                      return (
                        <div className="mkt-lrow col" key={l.id}>
                          <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                            <div className="th">{l.image_url && <img src={l.image_url} alt="" />}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                              <div className="meta">You get {formatNaira(l.price_naira)}</div>
                            </div>
                            <span className="mkt-st rejected">Not approved</span>
                          </div>
                          {l.rejection_reason && <div className="mkt-reject">{l.rejection_reason}. Fix this and send it back to us.</div>}
                          {/* Fixes the actual problem this whole pass was for: this used to
                              open a blank new-listing form, a rejected seller had no way to
                              edit at all (design 21a E1, "Fix listing"). */}
                          <button className="mkt-secondary" onClick={() => navigate(`/sell/listings/${l.id}/edit`)}>Fix and resend</button>
                        </div>
                      );
                    }

                    if (g.key === "delisted") {
                      const adminRemoved = l.delisted_by === "admin";
                      const canRelist = l.delisted_by === "seller";
                      return (
                        <div className="mkt-lrow col" key={l.id}>
                          <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                            <div className="th">{l.image_url && <img src={l.image_url} alt="" />}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                              <div className="meta">{multi ? `${left} of ${total} left` : `You get ${formatNaira(l.price_naira)}`}</div>
                            </div>
                            <span className={adminRemoved ? "mkt-st rejected" : "mkt-st sold"}>{adminRemoved ? "Removed" : "Delisted"}</span>
                          </div>
                          {canRelist ? (
                            <>
                              <div className="meta" style={{ color: "var(--mkt-muted)" }}>You took this down. Put it back up as-is, or edit it first, either way it goes through review again.</div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button className="mkt-secondary" style={{ flex: 1 }} onClick={() => { setRelistError(null); setRelistTarget(l); }}>Put it back up</button>
                                <button className="mkt-secondary" style={{ flex: 1 }} onClick={() => navigate(`/sell/listings/${l.id}/edit`)}>Edit &amp; resubmit</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="mkt-reject">{adminRemoved ? "BundledMum removed this listing. You cannot put this one back yourself." : "This listing is off the marketplace. You cannot put this one back yourself."} Message us if you think it should return.</div>
                              <a className="mkt-secondary" style={{ textAlign: "center", textDecoration: "none", display: "block" }} href={`${WHATSAPP_BASE}?text=${encodeURIComponent(`Hello BundledMum, about my delisted listing "${l.title}".`)}`} target="_blank" rel="noreferrer">Ask us about it</a>
                            </>
                          )}
                        </div>
                      );
                    }

                    if (g.key === "live" || g.key === "pending_review") {
                      return (
                        <div className="mkt-lrow" key={l.id}>
                          <div className="th">{l.image_url && <img src={l.image_url} alt="" />}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                            <div className="meta">{meta}</div>
                          </div>
                          <span className={`mkt-st ${g.pill}`}>{g.label}</span>
                          {/* Distinct button label per status (design 21a E1), so the scope of
                              each edit is obvious before it is even opened: a live listing only
                              opens the price-only screen, everything else opens the full form. */}
                          {g.key === "live" ? (
                            <button className="mkt-lrow-action" onClick={() => navigate(`/sell/listings/${l.id}/price`)}>Lower price</button>
                          ) : (
                            <button className="mkt-lrow-action" onClick={() => navigate(`/sell/listings/${l.id}/edit`)}>Edit</button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className={g.key === "sold" ? "mkt-lrow dim" : "mkt-lrow"} key={l.id}>
                        <div className="th">{l.image_url && <img src={l.image_url} alt="" />}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                          <div className="meta">{meta}</div>
                        </div>
                        <span className={`mkt-st ${g.pill}`}>{g.label}</span>
                      </div>
                    );
                  })}
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
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" onClick={() => navigate("/sell/new")}>List another item</button>
      </div>

      {/* Relist confirm (design Q6). Goes back through review, so it is a
          deliberate action, and a false RPC result is surfaced honestly. */}
      {relistTarget && (
        <div className="mkt-sheet-overlay" onClick={() => !relistBusy && setRelistTarget(null)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Put {relistTarget.title} back up?</h3>
            <p>It goes back to our team for a quick check first, the same as a new listing, then it returns to browse. Your photos, price and notes are all still there.</p>
            {relistError && <div className="mkt-errbox"><span className="m">!</span><span>{relistError}</span></div>}
            <button className="mkt-primary" onClick={confirmRelist} disabled={relistBusy}>{relistBusy ? "Sending..." : "Send it for review"}</button>
            <button className="back" onClick={() => setRelistTarget(null)} disabled={relistBusy}>Leave it down</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditProfile({ seller, onDone, onCancel }: { seller: NonNullable<ReturnType<typeof useSeller>["seller"]>; onDone: () => void; onCancel: () => void }) {
  // A seller's legal name is locked by the database the moment both parts are
  // first set (trg_lock_seller_legal_name); only an admin can change it after
  // that. Every seller who registered before this rule existed has both null,
  // so this is also where they enter it for the first time.
  const legalNameLocked = !!(seller.legal_first_name && seller.legal_last_name);

  const [legalFirstName, setLegalFirstName] = useState(seller.legal_first_name || "");
  const [legalLastName, setLegalLastName] = useState(seller.legal_last_name || "");
  const [bankName, setBankName] = useState(seller.bank_name || "");
  const [bankAcctName, setBankAcctName] = useState(seller.bank_account_name || "");
  const [bankAcctNumber, setBankAcctNumber] = useState(seller.bank_account_number || "");
  const [err, setErr] = useState<string | null>(null);
  const [bankNameErr, setBankNameErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Same live guidance as setup: which legal name parts, if any, the account
  // name is missing right now (same substring test the database enforces).
  const missing = missingNameParts(bankAcctName, legalFirstName, legalLastName);
  const namePreview = !legalNameLocked ? previewDisplayName(legalFirstName, legalLastName) : null;

  async function save() {
    setErr(null); setBankNameErr(null);
    if (!legalNameLocked && (!legalFirstName.trim() || !legalLastName.trim())) {
      setErr("Please add your legal first and last name, so we can confirm the bank account is genuinely yours.");
      return;
    }
    const stillMissing = missingNameParts(bankAcctName, legalFirstName, legalLastName);
    if (stillMissing.length > 0) {
      setBankNameErr(`The account name needs to include your name, ${legalFirstName.trim()} and ${legalLastName.trim()}, so we can confirm it is yours.`);
      return;
    }
    setBusy(true);
    // No display_name here either: the database derives it from the legal
    // names and overwrites anything sent. Legal names are only sent when this
    // seller does not have them locked yet, they are read-only inputs
    // otherwise so their values here are already unchanged from seller.*.
    const { error } = await sdb.from("marketplace_sellers").update({
      legal_first_name: legalFirstName.trim(),
      legal_last_name: legalLastName.trim(),
      bank_name: bankName.trim(),
      bank_account_name: bankAcctName.trim(),
      bank_account_number: bankAcctNumber.trim(),
    }).eq("id", seller.id);
    setBusy(false);
    if (error) {
      // Two specific rejections the database can raise here, neither ever
      // shown raw: a bank-name mismatch (recovery path if it slips past the
      // check above), or an attempt to change a locked legal name (should not
      // be reachable through this UI since it's read-only once locked, but
      // handled defensively regardless).
      const mismatch = parseBankNameMismatch(error.message, legalFirstName, legalLastName);
      if (mismatch) { setBankNameErr(mismatch); return; }
      const locked = parseLegalNameLockError(error.message);
      if (locked) { setErr(locked); return; }
      setErr(genericErrorMessage("seller profile update", error));
      return;
    }
    onDone();
  }

  return (
    <div className="mkt-bankcard">
      {legalNameLocked ? (
        <div className="mkt-field">
          <div className="mkt-field-head"><span className="lbl">Legal name</span><span className="mkt-tag private">Private, locked</span></div>
          <div className="mkt-input" style={{ background: "var(--mkt-cream)", color: "var(--mkt-muted)" }}>{seller.legal_first_name} {seller.legal_last_name}</div>
          <div className="mkt-help">
            Fixed once set, so a payout account can never be quietly moved to someone else's name. Buyers see it as "{seller.display_name}".
            If this needs correcting,{" "}
            <a href={`${WHATSAPP_BASE}?text=${encodeURIComponent("Hello BundledMum, my legal name on my seller account needs correcting.")}`} target="_blank" rel="noreferrer">message us on WhatsApp</a>.
          </div>
        </div>
      ) : (
        <>
          <div className="mkt-field">
            <div className="mkt-field-head"><span className="lbl">Legal first name</span><span className="mkt-tag private">Private</span></div>
            <input className="mkt-input" value={legalFirstName} onChange={(e) => { setLegalFirstName(e.target.value); if (bankNameErr) setBankNameErr(null); }} />
          </div>
          <div className="mkt-field">
            <div className="mkt-field-head"><span className="lbl">Legal last name</span><span className="mkt-tag private">Private</span></div>
            <input className="mkt-input" value={legalLastName} onChange={(e) => { setLegalLastName(e.target.value); if (bankNameErr) setBankNameErr(null); }} />
            <div className="mkt-help">Your real name, as it appears on your bank account. Cannot be changed once saved, buyers only ever see your first name and a last initial.</div>
          </div>
          {namePreview && (
            <div className="mkt-reassure">
              <div className="mkt-reassure-tick">✓</div>
              <div className="mkt-reassure-text">Buyers will see: {namePreview}</div>
            </div>
          )}
        </>
      )}

      <div className="mkt-reassure">
        <div className="mkt-reassure-tick">✓</div>
        <div className="mkt-reassure-text">
          The name on your bank account needs to match your legal name above. This protects you as much as it protects buyers, it is how we make sure a payout can only ever go to an account that is genuinely yours.
        </div>
      </div>

      <div className="mkt-field"><span className="mkt-uplabel">Bank</span><input className="mkt-input" value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
      <div className="mkt-field"><span className="mkt-uplabel">Account number</span><input className="mkt-input" value={bankAcctNumber} onChange={(e) => setBankAcctNumber(e.target.value)} inputMode="numeric" /></div>
      <div className="mkt-field">
        <span className="mkt-uplabel">Account name</span>
        <input className={bankNameErr ? "mkt-input error" : "mkt-input"} value={bankAcctName}
          onChange={(e) => { setBankAcctName(e.target.value); if (bankNameErr) setBankNameErr(null); }} />
        {bankNameErr ? (
          <div className="mkt-errbox"><span className="m">!</span><span>{bankNameErr}</span></div>
        ) : missing.length > 0 ? (
          <div className="mkt-help" style={{ color: "var(--mkt-error)" }}>
            This does not look like it includes your {missing.length === 2 ? "first and last name" : missing[0] === "first" ? "first name" : "last name"} yet.
          </div>
        ) : null}
      </div>
      {err && <div className="mkt-errbox"><span className="m">!</span><span>{err}</span></div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="mkt-secondary" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="mkt-primary" style={{ flex: 1 }} onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}
