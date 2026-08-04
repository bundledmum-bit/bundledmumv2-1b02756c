import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { sdb, LISTING_BUCKET, compressImage, describeUploadError } from "../sell/sellData";
import { fetchBuyerOrder, fetchOrderDispute, buyerMarkReturnSent } from "./buyerOrders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

/**
 * Buyer marks a return sent (design 20a, RT1). Only reachable once the admin
 * has ruled a return is required and the buyer has not already marked it
 * sent. Proof of posting uploads the same way dispute evidence does, one
 * photo, under the buyer's own auth uid folder. Bank details are collected
 * here, not at checkout, since almost nobody ever needs a refund; refunds go
 * out by bank transfer, not back to the card, which is why we ask now.
 */
export default function BuyerReturnPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, isLoggedIn } = useCustomerAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [shippingCost, setShippingCost] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authLoading && !isLoggedIn) {
    sendToMarketplaceLogin(`/orders/${orderId}/return`, "return");
  }

  const { data: order, isLoading } = useQuery({
    queryKey: ["buyer-order", orderId],
    enabled: !!orderId && isLoggedIn,
    queryFn: () => fetchBuyerOrder(orderId as string),
  });
  const { data: dispute, isLoading: disputeLoading } = useQuery({
    queryKey: ["buyer-order-dispute", orderId],
    enabled: !!orderId && isLoggedIn,
    queryFn: () => fetchOrderDispute(orderId as string),
  });

  function pick(files: FileList | null) {
    if (!files || !files[0]) return;
    setPhoto({ file: files[0], url: URL.createObjectURL(files[0]) });
  }

  async function submit() {
    if (!order || !user || !dispute) return;
    if (!photo) { setError("Add a photo of your proof of posting."); return; }
    if (!bankName.trim() || !accountName.trim() || !accountNumber.trim()) {
      setError("Please add your bank name, account name and account number so we can send your refund.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const blob = await compressImage(photo.file);
      const path = `${user.id}/return-${order.id}-${Date.now()}.jpg`;
      const { error: upErr } = await sdb.storage.from(LISTING_BUCKET).upload(path, blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = sdb.storage.from(LISTING_BUCKET).getPublicUrl(path);

      const cost = shippingCost.trim() ? Math.round(Number(shippingCost)) : null;
      const res = await buyerMarkReturnSent({
        disputeId: dispute.id,
        proofUrl: pub.publicUrl,
        bankName: bankName.trim(),
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        shippingCostNaira: cost && isFinite(cost) && cost > 0 ? cost : null,
      });
      setBusy(false);
      if (!res.ok) { setError(res.message || "We could not save this. Please try again."); return; }
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (e) {
      setBusy(false);
      setError(describeUploadError(e));
    }
  }

  if (authLoading || isLoading || disputeLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!order) {
    return <div className="mkt-center"><div className="mkt-empty-title">Order not found</div><button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/orders")}>Back to my orders</button></div>;
  }
  if (!dispute || !dispute.return_required || dispute.return_sent_at) {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">Nothing to send back here</div>
        <div className="mkt-empty-sub">This order does not have a return awaiting you right now.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate(`/orders/${order.id}`)}>Back to the order</button>
      </div>
    );
  }

  return (
    <div className="mkt-return-page">
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate(`/orders/${order.id}`)} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>Send the item back</h1></div></div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-heldbox">
          <div className="hb-line"><span className="hb-tick">✓</span>Your report was upheld. Post it back, then fill this in. Once it is confirmed arrived, your refund goes out the same day.</div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Proof of posting</span>
          {photo ? (
            <div className="mkt-dispatch-preview">
              <img src={photo.url} alt="Proof of posting" />
              <button type="button" className="retake" onClick={() => fileRef.current?.click()}>Retake</button>
            </div>
          ) : (
            <button type="button" className="mkt-dispatch-drop" onClick={() => fileRef.current?.click()}>
              <span className="ic">📷</span>
              <span className="t">Photo of the courier receipt</span>
              <span className="s">or the item packed and ready to send</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Return shipping cost, optional</span>
          <input className="mkt-input" value={shippingCost} onChange={(e) => setShippingCost(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 1,200" inputMode="numeric" />
        </div>

        <div className="mkt-field">
          <div className="mkt-field-head"><span className="lbl">Where should the refund go?</span></div>
          <div className="mkt-help">Refunds go out by bank transfer, not back to your card, so we only ask now that you actually need one.</div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Bank</span>
          <input className="mkt-input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Guaranty Trust Bank" />
        </div>
        <div className="mkt-field">
          <span className="mkt-uplabel">Account name</span>
          <input className="mkt-input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Name on the account" />
        </div>
        <div className="mkt-field">
          <span className="mkt-uplabel">Account number</span>
          <input className="mkt-input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="10 digit number" inputMode="numeric" />
        </div>

        {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" disabled={busy} onClick={submit}>{busy ? "Saving..." : "I've sent it back"}</button>
      </div>
    </div>
  );
}
