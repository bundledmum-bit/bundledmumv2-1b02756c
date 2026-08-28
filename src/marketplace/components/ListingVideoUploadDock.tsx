import { useEffect, useState } from "react";
import {
  subscribeToListingVideoUpload, retryListingVideoUpload, dismissListingVideoUpload,
  type UploadState,
} from "../listingVideoUploads";
import { deliveryGateChannel, pendingActionChannel } from "../lib/promptVisibility";

/**
 * The small persistent sign that a video is still sending, mounted OUTSIDE
 * <Routes> so it survives the seller tapping "List another item".
 *
 * A seller who moves on and sees no trace of their video assumes it was
 * lost, so this stays until it finishes or they dismiss it.
 *
 * NOT a prompt, and deliberately not in the prompt precedence order: it
 * asks for nothing and interrupts nothing. It does still yield to the two
 * BLOCKING things above it (the delivery gate and the pending action
 * prompt) purely so it never sits under a modal, and it sits at the top of
 * the screen where the install banner and WhatsApp prompt never go, so the
 * four of them cannot collide.
 *
 * Hidden while a screen is showing the full progress bar, so the success
 * screen does not show the same upload twice.
 */
export default function ListingVideoUploadDock() {
  const [s, setS] = useState<UploadState | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => subscribeToListingVideoUpload(setS), []);
  useEffect(() => {
    let gate = false, pending = false;
    const push = () => setBlocked(gate || pending);
    const offGate = deliveryGateChannel.subscribe((v) => { gate = v; push(); });
    const offPending = pendingActionChannel.subscribe((v) => { pending = v; push(); });
    return () => { offGate(); offPending(); };
  }, []);

  if (!s || s.detailShown || blocked) return null;

  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <div className="mkt-upload-dock" role="status" aria-live="polite">
      <div className="card">
        {s.status === "uploading" && (
          <>
            <div className="row">
              <span className="t">Sending your video</span>
              <span className="n">{s.progress}%</span>
            </div>
            <div className="bar"><i style={{ width: `${s.progress}%` }} /></div>
            <div className="s">{mb(s.bytesSent)} of {mb(s.bytesTotal)}. Keep this tab open while it sends, but you can carry on listing.</div>
          </>
        )}
        {s.status === "done" && (
          <>
            <div className="row"><span className="t">✓ Your video is on its way to your listing</span></div>
            <button className="x" onClick={dismissListingVideoUpload}>Close</button>
          </>
        )}
        {s.status === "error" && (
          <>
            <div className="row"><span className="t">Your video stopped sending</span></div>
            <div className="s">{s.message} It picks up where it left off, nothing starts again.</div>
            <div className="acts">
              <button className="go" onClick={retryListingVideoUpload}>Carry on sending</button>
              <button className="x" onClick={dismissListingVideoUpload}>Not now</button>
            </div>
          </>
        )}
        {s.status === "lost" && (
          <>
            <div className="row"><span className="t">The video did not make it across</span></div>
            <div className="s">Your listing is saved and with our team, nothing else was lost. You can add a video any time by editing it.</div>
            <button className="x" onClick={dismissListingVideoUpload}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}
