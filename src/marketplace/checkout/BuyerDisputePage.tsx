import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { sdb, LISTING_BUCKET, compressImage, describeUploadError } from "../sell/sellData";
import { fetchBuyerOrder, raiseDispute } from "./buyerOrders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceSeo from "../components/MarketplaceSeo";

const CATEGORIES = [
  "It never arrived",
  "Not as described",
  "Damaged on the way",
  "Something else",
];

const MIN_REASON = 10;

/**
 * Report a problem (design T4b). Opens a dispute via raise_marketplace_dispute,
 * which pauses the seller's payout while a person reviews it. The reason must be
 * at least 10 characters; we validate that client-side for a friendly message
 * rather than letting the RPC raise. Evidence photos reuse the same camera-or-
 * gallery input and client-side compression as the rest of the app, uploaded to
 * the marketplace-listings bucket under the buyer's auth uid, and passed as the
 * p_evidence array.
 */
export default function BuyerDisputePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, isLoggedIn } = useCustomerAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  if (!authLoading && !isLoggedIn) {
    sendToMarketplaceLogin(`/orders/${orderId}/problem`, "dispute");
  }

  const { data: order, isLoading } = useQuery({
    queryKey: ["buyer-order", orderId],
    enabled: !!orderId && isLoggedIn,
    queryFn: () => fetchBuyerOrder(orderId as string),
  });

  function pick(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, 5 - photos.length).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setPhotos((p) => [...p, ...next].slice(0, 5));
  }

  // The reason we send combines the chosen category with the buyer's own words.
  const composedReason = [category, detail.trim()].filter(Boolean).join(": ");
  const reasonValid = composedReason.length >= MIN_REASON;

  async function submit() {
    setTouched(true);
    if (!order || !user) return;
    if (!reasonValid) {
      setError(`Please tell us a little more, at least ${MIN_REASON} characters, so we can look into it properly.`);
      return;
    }
    setBusy(true); setError(null);
    try {
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const blob = await compressImage(photos[i].file);
        const path = `${user.id}/dispute-${order.id}-${Date.now()}-${i}.jpg`;
        const { error: upErr } = await sdb.storage.from(LISTING_BUCKET).upload(path, blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const { data: pub } = sdb.storage.from(LISTING_BUCKET).getPublicUrl(path);
        urls.push(pub.publicUrl);
      }
      const res = await raiseDispute(order.id, composedReason, urls);
      setBusy(false);
      if (!res.ok) { setError(res.message || "We could not open this problem report."); return; }
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (e) {
      setBusy(false);
      setError(describeUploadError(e));
    }
  }

  if (authLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!order) {
    return <div className="mkt-center"><div className="mkt-empty-title">Order not found</div><button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/orders")}>Back to my orders</button></div>;
  }
  if (order.order_status !== "awaiting_confirmation") {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">This order cannot be reported right now</div>
        <div className="mkt-empty-sub">It may already be confirmed, closed, or already being looked into.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate(`/orders/${order.id}`)}>Back to the order</button>
      </div>
    );
  }

  return (
    <div className="mkt-dispute-page">
      <MarketplaceSeo noindex title="Report a problem" />
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate(`/orders/${order.id}`)} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>Tell us what happened</h1></div></div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-heldbox">
          <div className="hb-title">This pauses the clock</div>
          <div className="hb-line"><span className="hb-tick">✓</span>Reporting a problem pauses the countdown and the seller's payout. Your money stays with us until we have looked at both sides.</div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">What went wrong</span>
          <div className="mkt-chips" style={{ flexWrap: "wrap", gap: 7 }}>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={category === c ? "mkt-chip on" : "mkt-chip"} style={{ flex: "1 1 45%" }} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">In your own words</span>
          <textarea
            className={touched && !reasonValid ? "mkt-textarea error" : "mkt-textarea"}
            rows={4}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Describe the problem. The more detail you give, the faster we can settle it."
            style={{ resize: "vertical" }}
          />
          {touched && !reasonValid && <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-error-ink)" }}>Please add at least {MIN_REASON} characters so we can look into it.</span>}
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Photos of the problem</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {photos.map((p, i) => (
              <div key={i} className="mkt-dispatch-preview" style={{ width: 96, height: 96 }}>
                <img src={p.url} alt="Evidence" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button type="button" className="retake" style={{ right: 4, bottom: 4, padding: "4px 8px" }} onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            {photos.length < 5 && (
              <button type="button" className="mkt-dispatch-drop" style={{ width: 96, height: 96, padding: 0 }} onClick={() => fileRef.current?.click()}>
                <span className="ic">＋</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-muted)" }}>Photos settle disputes fastest. Show the fault clearly, and the packaging if it was damaged.</span>
        </div>

        {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" disabled={busy} onClick={submit}>{busy ? "Sending..." : "Send to BundledMum"}</button>
        <div className="helper">A person reviews every report. We reply within one working day.</div>
      </div>
    </div>
  );
}
