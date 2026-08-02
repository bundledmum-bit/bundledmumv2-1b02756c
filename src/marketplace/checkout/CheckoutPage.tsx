import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useListing } from "../data/useListings";
import { cdb, formatNaira, createMarketplaceOrder, CheckoutError } from "./orders";

/**
 * Checkout by manual bank transfer (design T1 + confirm sheet T1b). The order is
 * created server side as soon as the screen loads (once logged in and the bank
 * details are configured), so the buyer sees the REAL server-generated payment
 * reference alongside the bank details, exactly when they make the transfer. The
 * edge function reuses an existing pending order for the same buyer and listing,
 * so a reload does not create duplicates and keeps the reference stable. Tapping
 * "I have sent the transfer" (behind a confirm) moves to the awaiting screen.
 */
export default function CheckoutPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const { isLoggedIn, loading: authLoading } = useCustomerAuth();

  const { data: listing, isLoading } = useListing(listingId);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  const serviceFee = Number(settings?.marketplace_service_fee_naira ?? 750) || 0;
  const bankName = String(settings?.marketplace_bank_name ?? "").trim();
  const acctName = String(settings?.marketplace_bank_account_name ?? "").trim();
  const acctNumber = String(settings?.marketplace_bank_account_number ?? "").trim();
  const bankReady = !!(bankName && acctName && acctNumber);
  const settingsLoaded = settings !== undefined;

  // Create (or reuse) the order once logged in, the listing is loaded, and the
  // bank is configured. Retry is off so a 4xx from the function is not repeated.
  const orderQ = useQuery({
    queryKey: ["mkt-create-order", listingId],
    enabled: !!listingId && isLoggedIn && !!listing && bankReady,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => createMarketplaceOrder({ listingId: listingId as string }),
  });

  const reference = orderQ.data?.order?.paystack_transaction_reference ?? "";
  const itemPrice = Number(listing?.final_price_naira ?? 0);
  const total = itemPrice + serviceFee;

  // Map the edge function's error codes to friendly, human messages.
  const errCode = orderQ.error instanceof CheckoutError ? orderQ.error.code : orderQ.error ? "unknown" : null;
  const notAvailable = errCode === "This item is no longer available";
  useEffect(() => {
    if (errCode === "Not authenticated") {
      window.location.assign("/account/login?returnTo=" + encodeURIComponent(`/marketplace/checkout/${listingId}`));
    }
  }, [errCode, listingId]);

  function errorMessage(code: string): string {
    switch (code) {
      case "You cannot buy your own listing": return "This is your own listing, so you cannot buy it.";
      case "No customer record found": return "We could not find your account details. Please complete your profile, then try again.";
      default: return "We could not start your order just yet. Please try again shortly, or message us on WhatsApp.";
    }
  }

  async function copy(text: string, tag: string) {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1600); } catch { /* clipboard blocked, ignore */ }
  }

  if (authLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!isLoggedIn) return null;

  if (!listing || notAvailable) {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">This item is no longer available</div>
        <div className="mkt-empty-sub">It may have just sold or been taken down. There is plenty more to see.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/")}>Back to marketplace</button>
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

        {settingsLoaded && !bankReady ? (
          <div className="mkt-errbox">
            <span className="m">!</span>
            <div>
              <b>Payment details are not set up yet</b>
              <span>Our transfer account is not configured, so checkout is paused for now. Please{" "}
                <a href={WHATSAPP_BASE} target="_blank" rel="noreferrer" style={{ color: "var(--mkt-error-ink)", fontWeight: 700 }}>message us on WhatsApp</a>{" "}
                to complete your purchase and we will sort it out.</span>
            </div>
          </div>
        ) : errCode && errCode !== "Not authenticated" ? (
          <div className="mkt-errbox">
            <span className="m">!</span>
            <div>
              <b>We could not start your order</b>
              <span>{errorMessage(errCode)}{" "}
                <a href={WHATSAPP_BASE} target="_blank" rel="noreferrer" style={{ color: "var(--mkt-error-ink)", fontWeight: 700 }}>Message us on WhatsApp</a>.</span>
            </div>
          </div>
        ) : bankReady ? (
          <>
            <div className="mkt-ref">
              <div className="lbl">Put this reference in the narration</div>
              <div className="row">
                <div className="code">{reference || "Preparing..."}</div>
                {reference
                  ? <button className="mkt-copy" onClick={() => copy(reference, "ref")}>{copied === "ref" ? "Copied" : "Copy"}</button>
                  : null}
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
        ) : null}
      </div>

      {bankReady && !errCode && (
        <div className="mkt-sell-foot">
          <button className="mkt-primary" onClick={() => setConfirmOpen(true)} disabled={!reference}>
            {reference ? "I have sent the transfer" : "Preparing your reference..."}
          </button>
          <div className="helper">Only tap this once the money has left your account</div>
        </div>
      )}

      {confirmOpen && reference && (
        <div className="mkt-sheet-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Have you really sent {formatNaira(total)}?</h3>
            <p>Tapping yes tells our team to go looking for your transfer. If it has not left your bank yet, go back and send it first.</p>
            <div className="kv">
              <div className="r"><span>Amount</span><b>{formatNaira(total)}</b></div>
              <div className="r"><span>To</span><b>{bankName} {acctNumber}</b></div>
              <div className="r"><span>Reference used</span><b>{reference}</b></div>
            </div>
            <button className="mkt-primary" onClick={() => navigate(`/checkout/awaiting/${reference}`, { replace: true })}>Yes, I have sent it</button>
            <button className="back" onClick={() => setConfirmOpen(false)}>Not yet, take me back</button>
          </div>
        </div>
      )}
    </>
  );
}
