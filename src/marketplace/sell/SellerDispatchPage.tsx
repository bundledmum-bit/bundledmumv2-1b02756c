import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, LISTING_BUCKET, compressImage } from "./sellData";
import { fetchSellerOrder, markDispatched } from "./sellerOrders";

/**
 * Mark as dispatched, with a required proof photo (design O3 + confirm O3b). The
 * photo protects the seller if the buyer later claims non-delivery. Uploads to
 * the marketplace-listings bucket under a folder named after the seller's auth
 * uid (the storage policy requires that), then calls
 * mark_marketplace_order_dispatched. A false result is surfaced honestly.
 */
export default function SellerDispatchPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, seller, isLoggedIn, loading: sellerLoading } = useSeller();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sellerLoading) return;
    if (!isLoggedIn) window.location.assign("/account/login?returnTo=" + encodeURIComponent(`/marketplace/sell/orders/${orderId}/dispatch`));
  }, [sellerLoading, isLoggedIn, orderId]);

  const { data: order, isLoading } = useQuery({
    queryKey: ["seller-order", orderId],
    enabled: !!orderId && isLoggedIn,
    queryFn: () => fetchSellerOrder(orderId as string),
  });

  function pick(files: FileList | null) {
    if (!files || !files[0]) return;
    setPhoto({ file: files[0], url: URL.createObjectURL(files[0]) });
  }

  async function confirmDispatch() {
    if (!photo || !order || !user) return;
    setBusy(true); setError(null);
    try {
      const blob = await compressImage(photo.file);
      const path = `${user.id}/dispatch-${order.id}-${Date.now()}.jpg`;
      const { error: upErr } = await sdb.storage.from(LISTING_BUCKET).upload(path, blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = sdb.storage.from(LISTING_BUCKET).getPublicUrl(path);
      const ok = await markDispatched(order.id, pub.publicUrl);
      setBusy(false);
      if (!ok) {
        setConfirmOpen(false);
        setError("We could not mark this as dispatched. It may already be dispatched or no longer awaiting your action. Please refresh and check.");
        return;
      }
      navigate(`/sell/orders/${order.id}`, { replace: true });
    } catch {
      setBusy(false); setConfirmOpen(false);
      setError("The upload did not complete. Please check your connection and try again.");
    }
  }

  if (sellerLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!order) {
    return <div className="mkt-center"><div className="mkt-empty-title">Order not found</div><button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button></div>;
  }
  if (order.order_status !== "awaiting_dispatch") {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">This order is not awaiting dispatch</div>
        <div className="mkt-empty-sub">It may already be on its way.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate(`/sell/orders/${order.id}`)}>View the order</button>
      </div>
    );
  }

  return (
    <>
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate(`/sell/orders/${order.id}`)} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>Proof you sent it</h1></div></div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-heldbox">
          <div className="hb-title">This photo protects you</div>
          <div className="hb-line"><span className="hb-tick">✓</span>If the buyer ever says it never came, this is what we look at, and it is usually the end of the matter.</div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Your dispatch photo</span>
          {photo ? (
            <div className="mkt-dispatch-preview">
              <img src={photo.url} alt="Dispatch" />
              <button type="button" className="retake" onClick={() => fileRef.current?.click()}>Retake</button>
            </div>
          ) : (
            <button type="button" className="mkt-dispatch-drop" onClick={() => fileRef.current?.click()}>
              <span className="ic">📷</span>
              <span className="t">Take a photo</span>
              <span className="s">or choose from your gallery</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </div>

        <div className="mkt-card2">
          <div className="mkt-card2-label">A good one shows</div>
          <span style={{ font: "400 12px/1.55 Lato, sans-serif", color: "#3D3936" }}>The item packed and sealed, and the courier waybill or receipt in the same shot if you have one. Daylight, and close enough to read the writing.</span>
        </div>

        {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" disabled={!photo} onClick={() => setConfirmOpen(true)}>Mark as dispatched</button>
        <div className="helper">{photo ? "You will confirm on the next step" : "Add the photo to carry on"}</div>
      </div>

      {confirmOpen && photo && (
        <div className="mkt-sheet-overlay" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Has it left you?</h3>
            <p>Marking it dispatched tells the buyer it is coming and starts their days to confirm. Only do this once it is truly on its way.</p>
            <div className="kv" style={{ padding: 0, overflow: "hidden" }}>
              <img src={photo.url} alt="Dispatch" style={{ width: "100%", display: "block" }} />
            </div>
            <button className="mkt-primary" onClick={confirmDispatch} disabled={busy}>{busy ? "Saving..." : "Yes, it is on its way"}</button>
            <button className="back" onClick={() => setConfirmOpen(false)} disabled={busy}>Not yet, go back</button>
          </div>
        </div>
      )}
    </>
  );
}
