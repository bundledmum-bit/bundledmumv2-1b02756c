import { useEffect, useRef, useState } from "react";
import { useListingVideoNotice, useListingVideo, useListingVideoGuidance, useCategoryVideoRule,
  useMyListingVideoState, VIDEO_QUEUED_LINE } from "../listingVideo";
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
export default function ListingVideoField({ listingId, sellerAuthUid, categoryId }: {
  listingId: string;
  sellerAuthUid: string;
  /** So the seller reads what to film for THIS kind of item. */
  categoryId?: string;
}) {
  const notice = useListingVideoNotice();
  const guidance = useListingVideoGuidance();
  const { data: rule } = useCategoryVideoRule(categoryId);
  const { data: existing } = useListingVideo(listingId);
  // The owner's own view of it, which listing_video deliberately hides:
  // without this a QUEUED video looks exactly like no video, and the seller
  // uploads again.
  const { data: videoState } = useMyListingVideoState(listingId);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [up, setUp] = useState<UploadState | null>(null);
  const startedRef = useRef(false);

  useEffect(() => subscribeToListingVideoUpload(setUp), []);

  // While this is on screen it owns the display, so the dock stays hidden.
  useEffect(() => {
    setUploadDetailShown(true);
    return () => setUploadDetailShown(false);
  });

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    // NOTHING is rejected. A longer video is a better video; the only
    // ceiling is the bucket's own, enforced by Supabase, and reported
    // honestly if it fires. Nothing is read from the file here at all.
    startListingVideoUpload({ listingId, file: f, sellerAuthUid });
  }

  const mine = up && up.listingId === listingId ? up : null;
  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <div className="mkt-field mkt-video-field">
      <div className="mkt-field-head">
        <span className="lbl">Upload a video of the item <span className="mkt-video-optional">optional</span></span>
      </div>
      {/* The CATEGORY'S OWN guidance, never generic advice. */}
      {rule?.video_guidance && (
        <div className="mkt-video-guidance">
          <span className="ic" aria-hidden>🎬</span>
          <span>{rule.video_guidance}</span>
        </div>
      )}
      {guidance && <p className="mkt-help">{guidance}</p>}

      {mine?.status === "lost" ? (
        /* NOTHING here touches the listing. It is created, it is with the
           review team, and only the video is missing. */
        <div className="mkt-errbox">
          <span className="m">!</span>
          <span>Your listing is saved and with our team, but the video did not make it across. Nothing else was lost. You can add one any time by editing this listing.</span>
        </div>
      ) : videoState === "failed" ? (
        /* A GENUINE failure, kept distinct from queueing on purpose: the
           whole point is that a seller can tell the two apart. */
        <div className="mkt-video-processing">
          <div className="mkt-errbox">
            <span className="m">!</span>
            <span>Something went wrong with that video and it did not go up. Please try sending it again.</span>
          </div>
          <button type="button" className="mkt-video-add" onClick={() => fileRef.current?.click()}>
            <span className="ic">▶</span>
            <span className="t">Try another video</span>
          </button>
        </div>
      ) : existing || videoState === "ready" ? (
        <div className="mkt-video-preparing">
          <span>✓</span>
          <span>Your video is on this listing.</span>
        </div>
      ) : mine?.status === "done" || mine?.status === "uploaded" || videoState === "pending" ? (
        /* QUEUED, WHICH IS NORMAL. YouTube caps uploads per channel per
           day, so the worker paces itself and retries by itself. Worded as
           finished because from the seller's side it is: they have spent
           minutes on mobile data and must not be told to do it again. */
        <div className="mkt-video-preparing">
          <span>✓</span>
          <span>{VIDEO_QUEUED_LINE} It shows on your listing as soon as it is through, and buyers see nothing until then.</span>
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
            <span className="s">It starts sending straight away. Send it exactly as you filmed it, we do the rest.</span>
          </button>
        </>
      )}

      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <p className="mkt-help mkt-video-footnote">One video per listing. Photos are still required either way, this is extra, not a substitute.</p>
    </div>
  );
}
