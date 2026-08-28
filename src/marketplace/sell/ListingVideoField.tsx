import { useEffect, useRef, useState } from "react";
import {
  stageListingVideo, useListingVideoNotice, useListingVideo, useListingVideoMaxMb,
  mbSent, mbTotal,
} from "../listingVideo";

/**
 * The seller's "Add a video" field, design 37a, reused exactly as the paused
 * feature had it: same .mkt-field .mkt-video-field block, same head, same
 * .mkt-video-add resting control, same footnote.
 *
 * THE ONLY CHANGE IS WHAT HAPPENS TO THE FILE. It goes up raw and YouTube
 * transcodes it, so NONE of the old pipeline comes back: no
 * processListingVideo, no readVideoMetadata, no MediaRecorder, no canvas,
 * no duration read. `file.size` against marketplace_listing_video_max_mb is
 * the only thing read from the file. Reading a video hangs indefinitely on
 * iPhone and that is what killed this feature twice.
 *
 * Gone with the pipeline: the 15 second limit and the extracted poster
 * frame, both of which required reading the video. YouTube supplies the
 * thumbnail instead.
 */
export default function ListingVideoField({ listingId, sellerAuthUid, initialFile }: {
  listingId: string;
  sellerAuthUid: string;
  /** A file chosen on the create form BEFORE this listing existed. Sent as
   * soon as this mounts, which is after the listing is safely created. */
  initialFile?: File | null;
}) {
  const notice = useListingVideoNotice();
  const maxMb = useListingVideoMaxMb();
  const { data: existing } = useListingVideo(listingId);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [staged, setStaged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held so a drop at 80% is a resend, not a restart.
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  // The file was picked on the previous screen and is gone from the page it
  // was picked on, so it cannot be re-picked here without starting over.
  const [lost, setLost] = useState(false);
  const autoStartedRef = useRef(false);

  // Sends a file handed over from the create form. Runs only after the
  // listing exists, because this component is not mounted until then.
  useEffect(() => {
    if (!initialFile || autoStartedRef.current) return;
    autoStartedRef.current = true;
    // A File held across a long form can have its underlying blob evicted
    // by the OS on a low end device. Size 0 is what that looks like from
    // here, and it is checked BEFORE any upload so the seller gets the
    // honest message rather than a failed transfer.
    if (initialFile.size === 0) { setLost(true); setFile(null); return; }
    void send(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    // file.size is the ONLY thing read from the file.
    if (f.size > maxMb * 1024 * 1024) {
      setFile(null);
      setError(`That file is larger than ${maxMb}MB. Please record a shorter clip.`);
      return;
    }
    setFile(f);
    setError(null);
    void send(f);
  }

  async function send(f: File) {
    setBusy(true); setError(null); setProgress(0);
    const res = await stageListingVideo({ listingId, sellerAuthUid, file: f, onProgress: setProgress });
    setBusy(false);
    if (!res.ok) {
      // The browser reports an unreadable file as a failed read rather than
      // a network error. Either way the seller keeps the listing.
      if (f.size === 0) { setLost(true); setFile(null); return; }
      setError(res.message ?? "That could not be saved.");
      return;
    }
    setStaged(true);
    setFile(null);
  }

  return (
    <div className="mkt-field mkt-video-field">
      <div className="mkt-field-head">
        <span className="lbl">Add a video <span className="mkt-video-optional">optional</span></span>
      </div>
      <p className="mkt-help">A few seconds of it folding, rolling or switching on answers the question buyers ask most, whether it actually works, before they even have to message.</p>

      {lost ? (
        /* NOTHING here touches the listing. It is created, it is with the
           review team, and only the video is missing. */
        <div className="mkt-errbox">
          <span className="m">!</span>
          <span>Your listing is saved and with our team, but the video did not make it across. Nothing else was lost. You can add one any time by editing this listing.</span>
        </div>
      ) : existing ? (
        <div className="mkt-video-preparing"><span>✓</span><span>Your video is on this listing.</span></div>
      ) : staged ? (
        <div className="mkt-video-preparing">
          <span className="sp" aria-hidden />
          <span>We are getting your video ready. It shows on your listing shortly, and buyers see nothing until it is.</span>
        </div>
      ) : busy ? (
        /* Real byte-level progress, never a bare spinner. The megabytes
           move even when the percentage looks stuck, which is what tells a
           seller on a slow line that it has not frozen. */
        <div className="mkt-video-processing">
          <div className="bar-row">
            <div className="bar"><i style={{ width: `${progress}%` }} /></div>
            <span>{progress}%</span>
          </div>
          <p className="mkt-help">
            Sending your video, {mbSent(file, progress)} of {mbTotal(file)}. It is going up exactly as you filmed it, so it can take a few minutes.
          </p>
        </div>
      ) : file && error ? (
        /* The file is still held, so this is a resend: no re-picking, and
           no re-reading the notice for a dropped connection. */
        <div className="mkt-video-processing">
          <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>
          <p className="mkt-help">{file.name} is still here, nothing was lost.</p>
          <button type="button" className="mkt-primary" onClick={() => void send(file)}>Try again</button>
          <button type="button" className="mkt-secondary" onClick={() => { setFile(null); setError(null); }}>Choose a different video</button>
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
      {error && !file && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
      <p className="mkt-help mkt-video-footnote">One video per listing. Photos are still required either way, this is extra, not a substitute.</p>
    </div>
  );
}
