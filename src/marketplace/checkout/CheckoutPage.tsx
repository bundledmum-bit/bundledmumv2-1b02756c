import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useListing } from "../data/useListings";
import { cdb, formatNaira, generatePaymentReference, createMarketplaceOrder } from "./orders";

/**
 * Checkout by manual bank transfer (design T1 + confirm sheet T1b). The buyer
 * sees BundledMum's bank details and a unique reference to put in the transfer
 * narration, then taps "I have sent the transfer". Order creation goes through a
 * server-side edge function (RLS blocks client writes to marketplace_orders).
 */
export default function CheckoutPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const { isLoggedIn, loading: authLoading } = useCustomerAuth();

  const { data: listing, isLoading } = useListing(listingId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      window.location.assign("/account/login?returnTo=" + encodeURIComponent(`/marketplace/checkout/${listingId}`));
    }
  }, [authLoading, isLoggedIn, listingId]);

  const { data: settings } = useQuery({
    queryKey: ["mkt-checkout-settings"],
    queryFn: async () => {
      const { data } = await cdb.from("site_settings").select("key, value")
        .in("key", ["marketplace_service_fee_naira", "marketplace_bank_name", "marketplace_bank_account_name", "marketplace_bank_account_number"]);
      const m: Record<string, unknown> = {};
      for (const r of (data ?? []) as Array<{ key: string; value: unknown }>) m[r.key] = r.value;
      return m;
    },
    staleTime: 60000,
  });

  // Stable per-listing reference, so a refresh mid-transfer does not change it.
  const reference = useMemo(() => {
    if (!listingId) return "";
    const key = `bm-mkt-ref-${listingId}`;
    let ref = sessionStorage.getItem(key);
    if (!ref) { ref = generatePaymentReference(); sessionStorage.setItem(key, ref); }
    return ref;
  }, [listingId]);

  const serviceFee = Number(settings?.marketplace_service_fee_naira ?? 750) || 0;
  const bankName = String(settings?.marketplace_bank_name ?? "").trim();
  const acctName = String(settings?.marketplace_bank_account_name ?? "").trim();
  const acctNumber = String(settings?.marketplace_bank_account_number ?? "").trim();
  const bankReady = !!(bankName && acctName && acctNumber);

  const itemPrice = Number(listing?.final_price_naira ?? 0);
  const total = itemPrice + serviceFee;

  async function copy(text: string, tag: string) {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1600); } catch { /* clipboard blocked, ignore */ }
  }

  async function confirmSent() {
    if (!listingId) return;
    setBusy(true); setError(null);
    try {
      await createMarketplaceOrder({ listingId, reference });
      sessionStorage.removeItem(`bm-mkt-ref-${listingId}`);
      navigate(`/checkout/awaiting/${reference}`, { replace: true });
    } catch {
      setBusy(false);
      setConfirmOpen(false);
      setError("We could not start your order just yet, secure checkout is being set up. Please try again shortly, or message us on WhatsApp.");
    }
  }

  if (authLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!isLoggedIn) return null;

  if (!listing) {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">This item is not available</div>
        <div className="mkt-empty-sub">It may have sold or been taken down.</div>
        <button className="mkt-primary" style={{ maxWidth: 220 }} onClick={() => navigate("/")}>Back to marketplace</button>
      </div>
    );
  }

  return (
    <>
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row"><button className="mkt-sell-back" onClick={() => navigate(`/listing/${listing.id}`)} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>Pay by transfer</h1></div>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-co-summary">
          <div className="th">{listing.image_url && <img src={listing.image_url} alt="" />}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{listing.title}</div>
            <div className="s">Sold by {listing.seller?.display_name || "BundledMum seller"}</div>
          </div>
        </div>

        <div className="mkt-brk">
          <div className="line"><span>Item price</span><b>{formatNaira(itemPrice)}</b></div>
          <div className="line"><div><span>Service fee</span><div className="sub">Non refundable</div></div><b>{formatNaira(serviceFee)}</b></div>
          <div className="rule" />
          <div className="total"><span>Transfer exactly</span><b>{formatNaira(total)}</b></div>
        </div>

        {!bankReady ? (
          <div className="mkt-errbox">
            <span className="m">!</span>
            <div>
              <b>Payment details are not set up yet</b>
              <span>Our transfer account is not configured, so checkout is paused for now. Please{" "}
                <a href={WHATSAPP_BASE} target="_blank" rel="noreferrer" style={{ color: "var(--mkt-error-ink)", fontWeight: 700 }}>message us on WhatsApp</a>{" "}
                to complete your purchase and we will sort it out.</span>
            </div>
          </div>
        ) : (
          <>
            <div className="mkt-ref">
              <div className="lbl">Put this reference in the narration</div>
              <div className="row">
                <div className="code">{reference}</div>
                <button className="mkt-copy" onClick={() => copy(reference, "ref")}>{copied === "ref" ? "Copied" : "Copy"}</button>
              </div>
              <div className="note">Without it we cannot tell which order your money belongs to, and your order will sit unconfirmed. Type it in the narration or remark box in your bank app.</div>
            </div>

            <div className="mkt-bank">
              <div className="lbl">Send to</div>
              <div className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="num">{acctNumber}</div>
                  <div className="who">{bankName} · {acctName}</div>
                </div>
                <button className="mkt-copy outline" onClick={() => copy(acctNumber, "acct")}>{copied === "acct" ? "Copied" : "Copy"}</button>
              </div>
            </div>

            <div className="mkt-reassure" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div className="mkt-reassure-tick">✓</div>
              <div className="mkt-reassure-text">We hold your money, the seller is not paid yet. It only moves to them after you confirm the item reached you as described.</div>
            </div>
          </>
        )}

        {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
      </div>

      {bankReady && (
        <div className="mkt-sell-foot">
          <button className="mkt-primary" onClick={() => setConfirmOpen(true)}>I have sent the transfer</button>
          <div className="helper">Only tap this once the money has left your account</div>
        </div>
      )}

      {confirmOpen && (
        <div className="mkt-sheet-overlay" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Have you really sent {formatNaira(total)}?</h3>
            <p>Tapping yes tells our team to go looking for your transfer. If it has not left your bank yet, go back and send it first.</p>
            <div className="kv">
              <div className="r"><span>Amount</span><b>{formatNaira(total)}</b></div>
              <div className="r"><span>To</span><b>{bankName} {acctNumber}</b></div>
              <div className="r"><span>Reference used</span><b>{reference}</b></div>
            </div>
            <button className="mkt-primary" onClick={confirmSent} disabled={busy}>{busy ? "Starting your order..." : "Yes, I have sent it"}</button>
            <button className="back" onClick={() => setConfirmOpen(false)} disabled={busy}>Not yet, take me back</button>
          </div>
        </div>
      )}
    </>
  );
}
