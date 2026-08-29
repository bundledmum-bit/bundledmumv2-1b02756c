import { useEffect, useRef, useState } from "react";
import {
  useListingVideoGuidance, useCategoryVideoRule, mbTotal, VIDEO_QUEUED_LINE,
} from "../listingVideo";
import {
  startListingVideoUpload, subscribeToListingVideoUpload, retryListingVideoUpload,
  setUploadDetailShown, type UploadState,
} from "../listingVideoUploads";

/** Roughly how long a file takes on a typical Nigerian mobile connection,
 * from file.size ALONE. An estimate to inform with, never a gate. */
function sendingEstimate(bytes: number): string | null {
  const mb = bytes / (1024 * 1024);
  if (mb < 12) return null;
  const mins = Math.max(1, Math.round(mb / 8));
  return `That is ${mb.toFixed(0)}MB, so it may take around ${mins} ${mins === 1 ? "minute" : "minutes"} to send. You can carry on filling this in while it goes.`;
}

/**
 * Choosing the video on the CREATE form, under Photos.
 *
 * THE UPLOAD STARTS THE MOMENT THEY PICK. A video needs a listing id to be
 * ATTACHED, not to be UPLOADED, so it goes to a path the seller owns while
 * they are still typing, and is attached once the listing exists. By
 * submission it is usually already there. An unattached file is cleared by
 * the nightly orphan job.
 *
 * NOTHING IS REJECTED FOR SIZE. Someone filming 40 seconds of a pram
 * folding has made a BETTER video. `file.size` is read only to say roughly
 * how long it will take. The one hard ceiling is the bucket's own 200MB,
 * which Supabase enforces whatever we do, and which is reported honestly if
 * it ever fires.
 */
export default function ListingVideoPicker({ categoryId, required, sellerAuthUid, onFileChosen }: {
  categoryId: string;
  required: boolean;
  sellerAuthUid: string;
  /** Lets the form know whether the requirement is satisfied. */
  onFileChosen: (has: boolean) => void;
}) {
  const guidance = useListingVideoGuidance();
  const { data: rule } = useCategoryVideoRule(categoryId);
  const [up, setUp] = useState<UploadState | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<File | null>(null);

  useEffect(() => subscribeToListingVideoUpload(setUp), []);
  useEffect(() => {
    setUploadDetailShown(true);
    return () => setUploadDetailShown(false);
  });
  useEffect(() => { onFileChosen(!!picked); }, [picked, onFileChosen]);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setPicked(f);
    // Straight to the network. No size check, no inspection of any kind.
    startListingVideoUpload({ file: f, sellerAuthUid });
  }

  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`;
  const estimate = picked ? sendingEstimate(picked.size) : null;

  return (
    <div className={`mkt-field mkt-video-field${required ? " is-required" : ""}`}>
      <div className="mkt-field-head">
        <span className="lbl">
          Upload a video of the item{" "}
          <span className="mkt-video-optional">{required ? "required" : "optional"}</span>
        </span>
      </div>

      {/* The CATEGORY'S OWN guidance, never generic advice. */}
      {rule?.video_guidance && (
        <div className="mkt-video-guidance">
          <span className="ic" aria-hidden>🎬</span>
          <span>{rule.video_guidance}</span>
        </div>
      )}
      {guidance && <p className="mkt-help">{guidance}</p>}

      {up?.status === "uploading" ? (
        <div className="mkt-video-processing">
          <div className="bar-row">
            <div className="bar"><i style={{ width: `${up.progress}%` }} /></div>
            <span>{up.progress}%</span>
          </div>
          <p className="mkt-help">
            Sending your video, {mb(up.bytesSent)} of {mb(up.bytesTotal)}. Keep this tab open while it sends, you can carry on filling this in.
          </p>
        </div>
      ) : up?.status === "uploaded" || up?.status === "done" ? (
        <div className="mkt-video-preparing">
          <span>✓</span>
          <span>{VIDEO_QUEUED_LINE} It goes on your listing once this is sent for review.</span>
        </div>
      ) : up?.status === "error" ? (
        <div className="mkt-video-processing">
          <div className="mkt-errbox"><span className="m">!</span><span>{up.message}</span></div>
          <p className="mkt-help">It picks up from {mb(up.bytesSent)} of {mb(up.bytesTotal)}, nothing starts again.</p>
          <button type="button" className="mkt-primary" onClick={retryListingVideoUpload}>Carry on sending</button>
        </div>
      ) : (
        <button type="button" className="mkt-video-add" onClick={() => fileRef.current?.click()}>
          <span className="ic">▶</span>
          <span className="t">Record or upload a video</span>
          <span className="s">It starts sending straight away, while you fill in the rest.</span>
        </button>
      )}

      {estimate && up?.status === "uploading" && <p className="mkt-help">{estimate}</p>}

      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <p className="mkt-help mkt-video-footnote">One video per listing. Photos are still required either way, this is extra, not a substitute.</p>
    </div>
  );
}
