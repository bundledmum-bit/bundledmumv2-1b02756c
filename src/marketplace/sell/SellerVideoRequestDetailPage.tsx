import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";
import {
  fetchSellerVideoRequest,
  sellerDeclineVideoRequest,
} from "../videoRequests";
import { fulfilRequestWithListingVideo, useListingVideoMaxMb, useListingVideoNotice } from "../listingVideo";

/**
 * Answer a video request (seller side), at /sell/video-requests/:id — the
 * dashboard's own deep-link destination, same redirect-then-load pattern as
 * SellerQuestionDetailPage.tsx.
 *
 * SIZE, NOT DURATION: the only check on a picked file is file.size against
 * the live site_settings limit, read the instant the file is chosen — no
 * decoding, no <video> element, no canvas, no waiting on loadedmetadata.
 * That is exactly the pattern that hung indefinitely on iPhone before
 * (handoff §87-92). The raw file is uploaded exactly as selected, with a
 * real progress percentage (see uploadWithProgress.ts) since a raw phone
 * video on Nigerian mobile data can genuinely take minutes — a silent
 * spinner that long reads as frozen. A failed upload keeps the picked file
 * in state so retrying doesn't mean choosing it again.
 */
export default function SellerVideoRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, seller, loading: sellerLoading, isLoggedIn } = useSeller();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineBusy, setDeclineBusy] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  useEffect(() => {
    if (sellerLoading) return;
    if (!isLoggedIn) sendToMarketplaceLogin(`/sell/video-requests/${id}`, "answer_video");
  }, [sellerLoading, isLoggedIn, id]);

  const { data: request, isLoading, refetch } = useQuery({
    queryKey: ["seller-video-request", id],
    enabled: !!id && isLoggedIn,
    queryFn: () => fetchSellerVideoRequest(id as string),
  });

  const listingVideoMaxMb = useListingVideoMaxMb();
  const listingVideoNotice = useListingVideoNotice();

  function pick(files: FileList | null) {
    if (!files || !files[0]) return;
    const f = files[0];
    // file.size is known the instant the file is picked, no decoding at
    // all — this is the ONLY check made on the file before upload.
    if (f.size > listingVideoMaxMb * 1024 * 1024) {
      setError("That video is too long, please record about 30 seconds or less.");
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }

  async function upload() {
    if (!file || !request || !user) return;
    setBusy(true); setError(null); setProgress(0);
    // NEW requests go on the listing and close the request in one call.
    // The four legacy private_only videos never reach this: they already
    // have uploaded_at set, so this screen shows them as sent, and the RPC
    // refuses a request that has one regardless.
    const res = await fulfilRequestWithListingVideo({
      requestId: request.id, sellerAuthUid: user.id, file, onProgress: setProgress,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "That could not be saved."); return; }
    setFile(null);
    qc.invalidateQueries({ queryKey: ["seller-video-requests-attention", seller?.id] });
    await refetch();
  }

  async function decline() {
    if (!request) return;
    setDeclineBusy(true); setDeclineError(null);
    const res = await sellerDeclineVideoRequest(request.id, declineReason);
    setDeclineBusy(false);
    if (!res.ok) { setDeclineError(res.message); return; }
    qc.invalidateQueries({ queryKey: ["seller-video-requests-attention", seller?.id] });
    navigate("/sell/dashboard");
  }

  if (sellerLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  // Same reasoning as SellerQuestionDetailPage.tsx: RLS makes "doesn't
  // exist" and "belongs to someone else" indistinguishable on purpose, so
  // the copy stays calm and honest either way.
  if (!request) {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Not available to you" />
        <div className="mkt-empty-title">Only the seller can see this</div>
        <div className="mkt-empty-sub">This request belongs to someone else's listing, or the link is no longer valid. If you're a seller, check you're signed in to the right account.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Go to your dashboard</button>
      </div>
    );
  }

  if (request.video_path) {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Video sent" />
        <div className="mkt-empty-title">You've already sent this one</div>
        <div className="mkt-empty-sub">The buyer has it now.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  if (request.declined_at) {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Already declined" />
        <div className="mkt-empty-title">You already said you couldn't film this one</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  return (
    <div className="mkt-dispatch-page">
      <MarketplaceTitle title="A buyer wants a video" />
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>A buyer wants a video</h1></div></div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-offer-counter">
          <span style={{ font: "400 13.5px/1.4 'Lato', sans-serif", color: "var(--mkt-green-dark)" }}>
            {request.listing?.title ? `About ${request.listing.title}` : "Their request"}
          </span>
          <span className="amt" style={{ font: "700 17px/1.35 'Nunito', sans-serif" }}>{request.note || "No note, just show it works normally"}</span>
        </div>

        {/* This used to promise "only they will ever see it", which stopped
            being true the moment a requested video started going on the
            listing. Replaced with what actually happens, read live from
            site_settings, and shown at the upload itself rather than in
            terms elsewhere. The four legacy videos filmed under the old
            promise are unaffected: they are already sent, so this screen
            never offers to upload for them. */}
        <div className="mkt-heldbox">
          <div className="hb-title">Where this video goes</div>
          <div className="hb-line"><span className="hb-tick">✓</span>{listingVideoNotice}</div>
          <div className="hb-line"><span className="hb-tick">✓</span>The buyer who asked gets told as soon as it is ready, and everyone looking at your listing can watch it too.</div>
        </div>

        {!declining ? (
          <>
            <div className="mkt-field">
              <span className="mkt-uplabel">Your video</span>
              {file ? (
                <div className="mkt-dispatch-preview" style={{ background: "#000", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 90 }}>
                  <span style={{ color: "#fff", font: "700 12.5px/1.4 Lato, sans-serif", padding: 12, textAlign: "center" }}>{file.name}</span>
                  {!busy && <button type="button" className="retake" onClick={() => fileRef.current?.click()}>Choose another</button>}
                </div>
              ) : (
                <button type="button" className="mkt-dispatch-drop" onClick={() => fileRef.current?.click()}>
                  <span className="ic">🎥</span>
                  <span className="t">Film or choose a video</span>
                  <span className="s">About 30 seconds is plenty</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
            </div>

            {busy && (
              <div className="mkt-card2">
                <div className="mkt-card2-label">Uploading, please don't close this</div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--mkt-grey-chip)", overflow: "hidden", marginTop: 6 }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: "var(--mkt-green)", transition: "width 0.2s" }} />
                </div>
                <div style={{ marginTop: 4, font: "700 12px/1 Nunito, sans-serif", color: "var(--mkt-green-dark)" }}>{progress}%</div>
              </div>
            )}

            {error && (
              <div className="mkt-errbox">
                <span className="m">!</span>
                <span>{error}</span>
              </div>
            )}

            <button className="mkt-primary" disabled={!file || busy} onClick={upload}>{busy ? `Uploading... ${progress}%` : error ? "Try again" : "Send this video"}</button>
            <button className="back" disabled={busy} onClick={() => setDeclining(true)}>I can't film this one</button>
          </>
        ) : (
          <>
            <div className="mkt-field">
              <span className="mkt-uplabel">Let them know why (optional)</span>
              <textarea
                className="mkt-textarea"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. It's already been picked up by another buyer"
                rows={3}
              />
            </div>
            {declineError && <div className="mkt-errbox"><span className="m">!</span><span>{declineError}</span></div>}
            <button className="mkt-primary" style={{ background: "var(--mkt-error, #C0392B)" }} disabled={declineBusy} onClick={decline}>{declineBusy ? "Saving..." : "Confirm, I can't film this"}</button>
            <button className="back" disabled={declineBusy} onClick={() => setDeclining(false)}>Back, let me try filming</button>
          </>
        )}
      </div>
    </div>
  );
}
