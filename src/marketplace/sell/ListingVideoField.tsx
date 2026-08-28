import { useEffect, useRef, useState } from "react";
import { useListingVideoNotice, useListingVideo, useListingVideoMaxMb } from "../listingVideo";
import {
  startListingVideoUpload, subscribeToListingVideoUpload, retryListingVideoUpload,
  setUploadDetailShown, type UploadState,
} from "../listingVideoUploads";

/**
 * The seller's "Add a video" field, design 37a, reused exactly as the paused
 * feature had it: same .mkt-field .mkt-video-field block, same head, same
 * .mkt-video-add resting control, same footnote.
 *
 * A VIEW OVER THE SHARED UPLOAD, not an uploader itself. The transfer lives
 * in listingVideoUploads.ts above the router, so it survives the seller
 * navigating away, and it resumes rather than restarts after a drop. This
 * renders the detailed bar and claims the display while it is mounted, so
 * the dock does not show the same upload twice.
 *
 * NONE of the old pipeline comes back: no processListingVideo, no
 * readVideoMetadata, no MediaRecorder, no canvas, no duration read.
 * `file.size` against marketplace_listing_video_max_mb is the only thing
 * read from the file. Reading a video hangs indefinitely on iPhone and that
 * is what killed this feature twice. Gone with the pipeline: the 15 second
 * limit and the extracted poster, both of which required reading the video.
 * YouTube supplies the thumbnail.
 */
export default function ListingVideoField({ listingId, sellerAuthUid, initialFile }: {
  listingId: string;
  sellerAuthUid: string;
  /** Chosen on the create form BEFORE this listing existed. Sent as soon as
   * this mounts, which is after the listing is safely created. */
  initialFile?: File | null;
}) {
  const notice = useListingVideoNotice();
  const maxMb = useListingVideoMaxMb();
  const { data: existing } = useListingVideo(listingId);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [up, setUp] = useState<UploadState | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => subscribeToListingVideoUpload(setUp), []);

  // While this is on screen it owns the display, so the dock stays hidden.
  useEffect(() => {
    setUploadDetailShown(true);
    return () => setUploadDetailShown(false);
  });

  // A file handed over from the create form. Runs only after the listing
  // exists, because this component is not mounted until then.
  useEffect(() => {
    if (!initialFile || startedRef.current) return;
    startedRef.current = true;
    startListingVideoUpload({ listingId, file: initialFile, sellerAuthUid });
  }, [initialFile, listingId, sellerAuthUid]);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    // file.size is the ONLY thing read from the file.
    if (f.size > maxMb * 1024 * 1024) {
      setPickError(`That file is larger than ${maxMb}MB. Please record a shorter clip.`);
      return;
    }
    setPickError(null);
    startListingVideoUpload({ listingId, file: f, sellerAuthUid });
  }

  const mine = up && up.listingId === listingId ? up : null;
  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <div className="mkt-field mkt-video-field">
      <div className="mkt-field-head">
        <span className="lbl">Upload a video of the item <span className="mkt-video-optional">optional</span></span>
      </div>
      <p className="mkt-help">A few seconds of it folding, rolling or switching on answers the question buyers ask most, whether it actually works, before they even have to message.</p>

      {mine?.status === "lost" ? (
        /* NOTHING here touches the listing. It is created, it is with the
           review team, and only the video is missing. */
        <div className="mkt-errbox">
          <span className="m">!</span>
          <span>Your listing is saved and with our team, but the video did not make it across. Nothing else was lost. You can add one any time by editing this listing.</span>
        </div>
      ) : mine?.status === "done" || existing ? (
        <div className="mkt-video-preparing">
          <span>✓</span>
          <span>We are getting your video ready. It shows on your listing shortly, and buyers see nothing until it is.</span>
        </div>
      ) : mine?.status === "uploading" ? (
        /* Real byte-level progress, never a bare spinner. The megabytes move
           even when the percentage looks stuck, which is what tells a seller
           on a slow line that it has not frozen. */
        <div className="mkt-video-processing">
          <div className="bar-row">
            <div className="bar"><i style={{ width: `${mine.progress}%` }} /></div>
            <span>{mine.progress}%</span>
          </div>
          <p className="mkt-help">
            Sending your video, {mb(mine.bytesSent)} of {mb(mine.bytesTotal)}. Keep this tab open while it sends, but you can carry on listing.
          </p>
        </div>
      ) : mine?.status === "error" ? (
        /* Resumable, so this continues from where it stopped. */
        <div className="mkt-video-processing">
          <div className="mkt-errbox"><span className="m">!</span><span>{mine.message}</span></div>
          <p className="mkt-help">It picks up from {mb(mine.bytesSent)} of {mb(mine.bytesTotal)}, nothing starts again.</p>
          <button type="button" className="mkt-primary" onClick={retryListingVideoUpload}>Carry on sending</button>
        </div>
      ) : (
        <>
          {/* Told, not asked, at the upload itself. */}
          {notice && <p className="mkt-help">{notice}</p>}
          <button type="button" className="mkt-video-add" onClick={() => fileRef.current?.click()}>
            <span className="ic">▶</span>
            <span className="t">Record or upload a video</span>
            <span className="s">Up to {maxMb}MB. Send it exactly as you filmed it, we do the rest.</span>
          </button>
        </>
      )}

      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {pickError && <div className="mkt-errbox"><span className="m">!</span><span>{pickError}</span></div>}
      <p className="mkt-help mkt-video-footnote">One video per listing. Photos are still required either way, this is extra, not a substitute.</p>
    </div>
  );
}
