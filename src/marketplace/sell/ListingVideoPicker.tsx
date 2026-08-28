import { useRef, useState } from "react";
import { useListingVideoNotice, useListingVideoMaxMb, mbTotal } from "../listingVideo";

/**
 * Choosing the video on the CREATE form, under Photos, where a seller
 * actually looks for it.
 *
 * PICKS ONLY, UPLOADS NOTHING. A new listing has no id and
 * seller_stage_listing_video needs one, so the file is held here and sent
 * on the success screen once the listing exists. That ordering is what
 * keeps the listing independent of the video: nothing about this control
 * can fail in a way that touches the listing, because nothing about it
 * talks to the network at all.
 *
 * `file.size` against the live cap is the ONLY thing read from the file.
 * No compression, no duration, no canvas, no video element.
 */
export default function ListingVideoPicker({ file, onPick, onClear }: {
  file: File | null;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const notice = useListingVideoNotice();
  const maxMb = useListingVideoMaxMb();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    // file.size is the ONLY thing read from the file.
    if (f.size > maxMb * 1024 * 1024) {
      onClear();
      setError(`That file is larger than ${maxMb}MB. Please record a shorter clip.`);
      return;
    }
    setError(null);
    onPick(f);
  }

  return (
    <div className="mkt-field mkt-video-field">
      <div className="mkt-field-head">
        <span className="lbl">Upload a video of the item <span className="mkt-video-optional">optional</span></span>
      </div>
      <p className="mkt-help">A few seconds of it folding, rolling or switching on answers the question buyers ask most, whether it actually works, before they even have to message.</p>

      {file ? (
        <div className="mkt-video-preparing">
          <span>✓</span>
          <span>{file.name}, {mbTotal(file)}. It goes up once your listing is saved, on the next screen.</span>
        </div>
      ) : (
        <>
          {/* Told, not asked, at the moment they add it. */}
          {notice && <p className="mkt-help">{notice}</p>}
          <button type="button" className="mkt-video-add" onClick={() => fileRef.current?.click()}>
            <span className="ic">▶</span>
            <span className="t">Record or upload a video</span>
            <span className="s">Up to {maxMb}MB. Send it exactly as you filmed it, we do the rest.</span>
          </button>
        </>
      )}

      {file && (
        <button type="button" className="mkt-secondary" onClick={onClear}>Choose a different video</button>
      )}

      {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}

      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <p className="mkt-help mkt-video-footnote">One video per listing. Photos are still required either way, this is extra, not a substitute.</p>
    </div>
  );
}
