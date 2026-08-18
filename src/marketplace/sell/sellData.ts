import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sell-side data helpers. Reads and writes go through the authenticated customer
 * Supabase client (same session as the storefront). The marketplace_* tables are
 * not in the generated Database types, so we use an untyped handle and cast.
 */
export const sdb = supabase as unknown as SupabaseClient;

/** Public bucket for seller listing photos. Kept separate from the admin
 * managed product-images bucket. See handoff: this bucket plus an authenticated
 * insert policy is a DB requirement before uploads work. */
export const LISTING_BUCKET = "marketplace-listings";

export function formatNaira(value: number | null | undefined): string {
  const n = Number(value);
  if (!isFinite(n)) return "₦0";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

/** Fetches an already-uploaded, already-watermarked-and-square listing photo
 * (a plain public LISTING_BUCKET URL) and turns it into a File — the Web
 * Share API's canShare/share both need an actual File, not a URL. Used only
 * by the seller listing-share page; every other helper in this file goes
 * the other direction (a File picked on-device, on its way up). Throws on a
 * failed fetch (offline, CORS, a deleted object) — callers treat that as
 * "sharing the photo as a file isn't available right now" and degrade to a
 * text-only or manual fallback rather than surfacing a raw error. */
export async function fetchListingPhotoAsFile(url: string, filename = "listing-photo.jpg"): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the photo (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

/**
 * Raised when a selected file cannot be decoded as an image at all, for
 * example a PDF or a corrupt file renamed to .jpg. Distinct from every other
 * failure in the compression pipeline below (a quirky EXIF profile, an
 * unusual color space), which still fall back to the original file so a
 * genuine photo is never lost. This one specific case is not recoverable and
 * must be surfaced to the seller or buyer, not silently swallowed, so a
 * broken file never quietly becomes part of a listing or a dispute.
 */
export class UnsupportedImageError extends Error {}

/** Decodes a file to a bitmap, trying the orientation-aware path first, then
 * a plain retry. Throws UnsupportedImageError only when BOTH attempts fail,
 * meaning the file is not a decodable image at all. */
async function decodeBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      throw new UnsupportedImageError(`"${file.name || "That file"}" does not look like a photo.`);
    }
  }
}

/**
 * Compresses an image before upload. Phone photos are 3 to 4MB each, and four
 * of them per listing is slow on Nigerian mobile data and wasteful in storage.
 * We draw the photo to a canvas with the longest edge capped at maxEdge and
 * export a moderate quality JPEG. A 3 to 4MB photo typically comes out around
 * 200 to 350KB. Falls back to the original file if anything AFTER decoding
 * goes wrong, so a genuine photo is never lost — but a file that cannot be
 * decoded as an image at all throws UnsupportedImageError, see decodeBitmap.
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await decodeBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}

/**
 * Listing photo standard (design R1 photo spec). In ONE canvas pass this:
 *  - normalises to a 1:1 square, cropped to fill and centre-weighted, so tall and
 *    wide phone photos sit consistently in the grid and on detail. The backdrop is
 *    cream #FFF8F4 (the design's pad colour), never white or black.
 *  - burns in the "Buy Used Baby/Children Items on BundledMum" watermark: a
 *    lozenge bottom-centre, inset 5% of width, wrapping to two lines if it
 *    would otherwise overflow, Nunito 800 text in cream, with an adaptive
 *    scrim (black 30% on light backgrounds, cream 22% on dark) chosen from
 *    the measured luminance under the lozenge itself, so it stays legible
 *    on a white cot sheet and a navy pram alike.
 *  - exports a moderate-quality JPEG.
 * Baked into the stored file permanently, and only ever called for NEW listing
 * uploads. Dispatch and dispute photos keep the plain compressImage. Falls back
 * to the original file if anything AFTER decoding fails, so a genuine photo is
 * never lost — but a file that cannot be decoded at all throws
 * UnsupportedImageError, see decodeBitmap.
 */
export async function processListingImage(file: File, size = 1200, quality = 0.82): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return compressImage(file);
  const bitmap = await decodeBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return compressImage(file);

    // Cream backdrop, then square crop-to-fill, centre-weighted.
    ctx.fillStyle = "#FFF8F4";
    ctx.fillRect(0, 0, size, size);
    const edge = Math.min(bitmap.width, bitmap.height);
    const sx = Math.round((bitmap.width - edge) / 2);
    const sy = Math.round((bitmap.height - edge) / 2);
    ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);
    if (typeof bitmap.close === "function") bitmap.close();

    drawWatermark(ctx, size);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size > 0 ? blob : compressImage(file);
  } catch {
    return compressImage(file);
  }
}

/** Public bucket for the one optional listing video + its poster frame. */
export const LISTING_VIDEO_BUCKET = "marketplace-videos";

/** Raised when a chosen video is longer than site_settings' own
 * marketplace_video_max_seconds — checked client side, upfront, right after
 * picking the file and before any compression work is spent on a clip that
 * will just be rejected. The exact same limit the database trigger itself
 * reads, never a second hardcoded number that could drift from it. */
export class VideoTooLongError extends Error {
  constructor(public readonly maxSeconds: number, public readonly actualSeconds: number) {
    super(`This video is ${Math.round(actualSeconds)}s, please choose one ${maxSeconds}s or shorter.`);
  }
}

/** Raised when a video is still over the bucket's own cap once the pipeline
 * is done with it. Said plainly, with the fix already in the seller's
 * hands: the 15s limit already applies, a shorter clip is the way out.
 * `wasCompressed` picks between two honest messages, since "even after
 * compressing" is only true when a compression pass actually ran — on a
 * device where it structurally can't (iOS Safari, see handoff §91:
 * HTMLMediaElement.captureStream() isn't implemented in WebKit at all, so
 * canRecord is false and the original file is uploaded untouched), saying
 * "even after compressing" would be a real, if small, lie. */
export class VideoTooLargeError extends Error {
  constructor(public readonly maxMb: number, public readonly wasCompressed: boolean) {
    super(
      wasCompressed
        ? "This video is still too large to upload, even after compressing. Please try recording a shorter clip."
        : "This video is too large to upload, and this device can't compress it automatically. Please try recording a shorter clip.",
    );
  }
}

/** Raised by withTimeout below — a distinct class so callers can show its
 * already-friendly message directly rather than letting it fall through to
 * describeVideoUploadError's generic fallback, which would lose the
 * specific "this is what actually happened" detail (metadata read timed
 * out vs. a seek timed out vs. the upload itself stalled). */
export class VideoTimeoutError extends Error {}

/** Fraction of the bucket's own cap (site_settings' marketplace_video_max_mb,
 * currently 8) below which a clip uploads exactly as recorded, skipping the
 * slow real-time re-encode entirely. Most phone clips at 15 seconds,
 * especially from a phone shooting 720p or 1080p, already land well under
 * this — so most sellers get an instant upload rather than a guaranteed
 * real-time wait. The 25% gap below the hard cap is genuine headroom, not
 * decoration: it means a file that just barely qualifies for the fast path
 * still has real room to spare, so the upload itself never fails at the
 * last moment on some small discrepancy between the client's read of the
 * file size and the server's. */
const VIDEO_SKIP_COMPRESSION_RATIO = 0.75;

/** True when `fileBytes` already comfortably fits the bucket's cap and can
 * upload untouched — the fast path that makes most seller uploads instant.
 * `maxMb` is always the live site_settings value, never hardcoded. */
export function shouldSkipVideoCompression(fileBytes: number, maxMb: number): boolean {
  return fileBytes <= maxMb * 1024 * 1024 * VIDEO_SKIP_COMPRESSION_RATIO;
}

export interface ProcessedVideo {
  blob: Blob;
  posterBlob: Blob;
  durationSeconds: number;
  /** Real content type of `blob` — 'video/webm' after a genuine re-encode,
   * or the original file's own type when compression wasn't possible on
   * this device and the source file is uploaded as-is. Always the bare
   * type with no codec parameters (never e.g. 'video/webm;codecs=vp9,opus'),
   * since this is used directly as the storage upload's contentType and
   * the marketplace-videos bucket's allowed_mime_types is the bare form. */
  mimeType: string;
  /** Whether `blob` is actually the compressed re-encode, or the original
   * file uploaded untouched because this device/browser has no
   * captureStream()/MediaRecorder support. Reported honestly rather than
   * silently claimed as compressed either way. */
  wasCompressed: boolean;
}

// Longest edge, the same "cap the biggest dimension" lever compressImage
// already uses for photos — the single biggest driver of file size for a
// re-encode, since halving each dimension roughly quarters the pixel count
// MediaRecorder has to spend bits on. 720 keeps a "does it work" demo clip
// clearly watchable on a phone screen without paying for detail nobody
// asked to see.
const VIDEO_MAX_EDGE = 720;
const VIDEO_BITRATE = 1_500_000; // ~1.5 Mbps video
const AUDIO_BITRATE = 96_000;    // keeps real audio (see "Playing with sound" in the design), modest bitrate
const VIDEO_FPS = 24;

/** Races a promise against a timer, rejecting with a clear message if it
 * never settles. Every step below waits on a browser event (metadata
 * loaded, seeked, play ended) that, on some device or with some file, can
 * simply never fire — with no timeout that leaves a seller staring at
 * "Adding your video" forever, no error, nothing landing in storage,
 * because the code is still awaiting an event that was never coming. This
 * guarantees every step either finishes or gives up and says so. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new VideoTimeoutError(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

const METADATA_TIMEOUT_MS = 12_000;
const SEEK_TIMEOUT_MS = 10_000;
/** Also used by CreateListingPage for the video/poster storage uploads
 * themselves — a stalled connection must give up and say so, not hang the
 * seller on "Adding your video" indefinitely with nothing ever landing in
 * storage and no error shown. */
export const VIDEO_UPLOAD_TIMEOUT_MS = 25_000;

/**
 * Creates a <video> element wired the way iOS Safari actually requires —
 * reasoned from Apple's own documented WebKit behaviour (not measured on a
 * real device in this environment, see handoff §91):
 *
 * - The blob goes on a <source> CHILD element, never on video.src directly.
 *   Blob URLs set as video.src are documented as looping/exhausting memory
 *   on iOS 15 and failing outright on iOS 17.4.1; Apple's own recommended
 *   workaround is a <source> child instead.
 * - The element is attached to the DOM (visually hidden, not display:none —
 *   iOS is documented to suspend loading on elements it considers
 *   offscreen/non-rendered) rather than left detached in memory, which iOS
 *   is documented to suspend (readyState/networkState stuck) to save
 *   battery.
 * - preload="metadata" explicitly (iOS is documented to only honour this
 *   value, not "auto"), plus muted + playsInline, both required on iOS for
 *   a video element to load or play without a user gesture.
 * - The source URL carries a #t=0.001 fragment, a documented iOS trick that
 *   forces WebKit to actually decode an initial frame rather than staying
 *   idle — relevant to both the metadata read and the poster capture right
 *   after it. Harmless elsewhere: browsers that don't apply Media Fragments
 *   for decoding simply ignore it.
 *
 * Returns a cleanup() that removes the element and revokes the object URL —
 * callers must call it (in a finally) once genuinely done with the element.
 */
function createHiddenVideoElement(file: File): { video: HTMLVideoElement; cleanup: () => void } {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  // Visually hidden but genuinely laid out/rendered, not display:none —
  // iOS's own suspension behaviour is documented as keying off whether an
  // element is actually in the render tree, not just present in the DOM.
  video.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
  video.setAttribute("aria-hidden", "true");
  const source = document.createElement("source");
  source.type = file.type || "video/mp4";
  source.src = `${url}#t=0.001`;
  video.appendChild(source);
  document.body.appendChild(video);
  return {
    video,
    cleanup: () => {
      video.remove();
      URL.revokeObjectURL(url);
    },
  };
}

/** Reads just the metadata (duration, dimensions) without decoding the
 * whole file — used for the upfront duration check, cheap and fast, before
 * committing to the much slower full re-encode pass below. */
export function readVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  const { video: v, cleanup } = createHiddenVideoElement(file);
  const read = new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
    v.onloadedmetadata = () => {
      const { duration, videoWidth, videoHeight } = v;
      if (!isFinite(duration) || duration <= 0) { reject(new Error("Could not read this video.")); return; }
      resolve({ duration, width: videoWidth, height: videoHeight });
    };
    v.onerror = () => reject(new Error("That file doesn't look like a video."));
  });
  return withTimeout(read, METADATA_TIMEOUT_MS, "Could not read this video in time. Please try again.")
    .finally(cleanup);
}

/** A single representative frame as a JPEG blob, for video_poster_url — the
 * still frame the resting card shows before anyone taps play. Seeks a small
 * offset into the clip rather than frame zero, since some encoders emit a
 * black or garbage first frame. */
function capturePosterFrame(video: HTMLVideoElement, w: number, h: number): Promise<Blob> {
  const seek = new Promise<Blob>((resolve, reject) => {
    const targetTime = Math.min(0.2, video.duration / 2);
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Could not read this video.")); return; }
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new Error("Could not read this video."));
      }, "image/jpeg", 0.82);
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = targetTime;
  });
  return withTimeout(seek, SEEK_TIMEOUT_MS, "Could not read this video in time. Please try again.");
}

/**
 * Prepares a listing video for upload, compressing it client side only when
 * that's actually necessary.
 *
 * The re-encode below is a real-time operation: it plays the clip through
 * and records it frame by frame via canvas + MediaRecorder, so a 15 second
 * video takes at least 15 seconds to compress, more on a mid-range phone.
 * That's inherent to recording a MediaStream, not a tuning problem —
 * dropping the bitrate or resolution doesn't touch it, because the
 * bottleneck is playback speed, not encoding effort. So the fix is to
 * compress less often rather than trying to compress faster: if the
 * original file already comfortably fits the bucket's own cap (see
 * shouldSkipVideoCompression, using the live site_settings value, never a
 * hardcoded number), it uploads exactly as recorded and this function
 * returns almost immediately. Most phone clips at 15 seconds, especially
 * from a phone shooting 720p or 1080p, already qualify — so most sellers
 * never pay the real-time wait at all. The poster frame is always
 * extracted regardless of which path is taken, since the listing page's
 * resting card depends on it either way.
 *
 * When compression genuinely is needed, it re-encodes via native browser
 * APIs only, no new library, the same spirit as compressImage's canvas
 * approach: draw the source video onto a downscaled canvas frame by frame
 * (capping the longest edge at VIDEO_MAX_EDGE, the video equivalent of
 * compressImage's maxEdge), and record that canvas' captureStream() through
 * MediaRecorder at an explicit, modest bitrate. The original video's audio
 * track is merged in separately (canvas.captureStream() carries video
 * only), so the result keeps sound.
 *
 * Falls back to uploading the ORIGINAL file untouched if this device lacks
 * captureStream()/MediaRecorder support (older Safari, chiefly) or the
 * re-encode produces nothing usable — a genuine video is never lost, same
 * "fall back rather than fail" philosophy as processListingImage. Reports
 * which path was actually taken via wasCompressed rather than claiming
 * compression happened either way.
 *
 * Whatever path produces the final blob, it's checked against the real
 * cap (maxMb) before returning — if it's still too big even after
 * compressing (a genuinely rare, dense clip), this throws VideoTooLargeError
 * rather than letting a doomed upload begin.
 */
export async function processListingVideo(
  file: File,
  maxMb: number,
  onProgress?: (pct: number) => void,
): Promise<ProcessedVideo> {
  const maxBytes = maxMb * 1024 * 1024;
  function finish(result: ProcessedVideo): ProcessedVideo {
    if (result.blob.size > maxBytes) throw new VideoTooLargeError(maxMb, result.wasCompressed);
    return result;
  }
  // The bucket's own allowed_mime_types is exactly ["video/mp4",
  // "video/webm", "video/quicktime"] — bare types, no codec parameters.
  // MediaRecorder needs the codec-qualified string to pick an encoder, but
  // that same string sent as an upload's contentType does not match the
  // bucket's allowlist and gets rejected by storage. Every return path
  // funnels through here so the returned mimeType — which CreateListingPage
  // uses directly as the upload's contentType — is always the bare form.
  function bareMime(m: string): string {
    return (m || "video/mp4").split(";")[0].trim();
  }

  const { video, cleanup } = createHiddenVideoElement(file);
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("That file doesn't look like a video."));
      }),
      METADATA_TIMEOUT_MS,
      "Could not read this video in time. Please try again.",
    );

    const duration = video.duration;
    const srcW = video.videoWidth || 720;
    const srcH = video.videoHeight || 720;
    const scale = Math.min(1, VIDEO_MAX_EDGE / Math.max(srcW, srcH));
    // Even dimensions: some video encoders require them.
    const w = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const h = Math.max(2, Math.round((srcH * scale) / 2) * 2);

    const posterBlob = await capturePosterFrame(video, w, h);

    // The fast path: most clips already fit, so skip the real-time
    // re-encode entirely and upload exactly what was recorded.
    if (shouldSkipVideoCompression(file.size, maxMb)) {
      return finish({ blob: file, posterBlob, durationSeconds: duration, mimeType: bareMime(file.type), wasCompressed: false });
    }

    // This is also the real answer to "can compression work on iOS at
    // all": no. HTMLMediaElement.captureStream() — video.captureStream()
    // below, the only way to pull the original audio track out — has never
    // been implemented in WebKit (documented, longstanding gap, still true
    // in current Safari), so canRecord is always false on an iPhone or iPad
    // regardless of iOS version. This isn't a special iOS case in the code;
    // it's the same capability check that already exists for any browser
    // lacking the API, and it already falls back to uploading the original
    // file untouched (the bucket accepts video/quicktime, so an iPhone's
    // own MOV upload is fine as long as it fits — see VideoTooLargeError's
    // wasCompressed-aware message for when it doesn't).
    const canRecord = typeof MediaRecorder !== "undefined"
      && typeof (video as unknown as { captureStream?: unknown }).captureStream === "function"
      && typeof (document.createElement("canvas") as unknown as { captureStream?: unknown }).captureStream === "function";

    if (!canRecord) {
      return finish({ blob: file, posterBlob, durationSeconds: duration, mimeType: bareMime(file.type), wasCompressed: false });
    }

    const recordMimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));

    if (!recordMimeType) {
      return finish({ blob: file, posterBlob, durationSeconds: duration, mimeType: bareMime(file.type), wasCompressed: false });
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return finish({ blob: file, posterBlob, durationSeconds: duration, mimeType: bareMime(file.type), wasCompressed: false });
    }

    video.currentTime = 0;
    await withTimeout(
      new Promise<void>((resolve) => {
        if (video.currentTime === 0) { resolve(); return; }
        video.onseeked = () => resolve();
      }),
      SEEK_TIMEOUT_MS,
      "Could not read this video in time. Please try again.",
    );

    const canvasStream = (canvas as unknown as { captureStream: (fps?: number) => MediaStream }).captureStream(VIDEO_FPS);
    const sourceStream = (video as unknown as { captureStream: () => MediaStream }).captureStream();
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...sourceStream.getAudioTracks()]);

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(combined, {
      mimeType: recordMimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: AUDIO_BITRATE,
    });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const recordStopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

    let raf = 0;
    function drawLoop() {
      if (video.paused || video.ended) return;
      ctx!.drawImage(video, 0, 0, w, h);
      if (onProgress && duration > 0) onProgress(Math.min(98, Math.round((video.currentTime / duration) * 100)));
      raf = requestAnimationFrame(drawLoop);
    }

    recorder.start();
    await video.play();
    drawLoop();
    // Real-time recording, so this is inherently proportional to the
    // clip's own length (§88) — floor of 60s so a short clip still gets a
    // generous margin, scaling up for longer ones so a genuinely slow
    // mid-range device isn't cut off mid-encode.
    const compressTimeoutMs = Math.max(60_000, duration * 6_000);
    await withTimeout(
      new Promise<void>((resolve) => { video.onended = () => resolve(); }),
      compressTimeoutMs,
      "Compressing this video is taking too long. Please try again, or a shorter clip.",
    );
    cancelAnimationFrame(raf);
    recorder.stop();
    await recordStopped;

    const bareRecordMime = bareMime(recordMimeType);
    const blob = new Blob(chunks, { type: bareRecordMime });
    if (onProgress) onProgress(100);

    if (blob.size === 0) {
      return finish({ blob: file, posterBlob, durationSeconds: duration, mimeType: bareMime(file.type), wasCompressed: false });
    }
    return finish({ blob, posterBlob, durationSeconds: duration, mimeType: bareRecordMime, wasCompressed: true });
  } finally {
    cleanup();
  }
}

/** Same shape as describeUploadError, for the marketplace-videos bucket
 * (8MB hard cap, mp4/webm/quicktime only). Compression should keep a real
 * upload well under the cap, so this is the rare-recovery path for a
 * device where compression wasn't possible and the original file itself
 * is still too big or an unsupported container. */
export function describeVideoUploadError(error: unknown): string {
  if (error instanceof VideoTooLongError) return error.message;
  const raw = String((error as { message?: string } | null)?.message || "");
  if (/exceed|too large|maximum.*size|payload too large/i.test(raw)) {
    return "That video is too large even after compressing. Please choose a shorter clip.";
  }
  if (/mime type|not supported|invalid.*type|content.type/i.test(raw)) {
    return "That video format isn't supported. Please choose an MP4, WEBM or MOV file.";
  }
  if (raw) console.error("[marketplace] video upload failed:", error);
  return "The video didn't upload. Please check your connection and try again, or skip it, it's optional.";
}

/**
 * Turns a storage-upload rejection into a specific, human message. The
 * marketplace-listings bucket enforces a 5MB size limit and an image-only
 * MIME allowlist (jpeg/png/webp/heic/heif) — the client-side compression
 * pipeline re-encodes to ~170KB JPEG so this should almost never trigger in
 * normal use, which is exactly why it must still produce a clear message
 * rather than a raw error or a silent failure. Any error not matching a known
 * shape falls back to a generic message and logs the real detail to the
 * console, never shown to the person uploading.
 */
export function describeUploadError(error: unknown): string {
  if (error instanceof UnsupportedImageError) {
    return "That file doesn't look like a photo. Please choose a JPEG, PNG, WEBP or HEIC image.";
  }
  const raw = String((error as { message?: string } | null)?.message || "");
  if (/exceed|too large|maximum.*size|payload too large/i.test(raw)) {
    return "That photo is too large. Please choose one under 5MB, or retake it so it can be compressed again.";
  }
  if (/mime type|not supported|invalid.*type|content.type/i.test(raw)) {
    return "That file type isn't supported. Please choose a JPEG, PNG, WEBP or HEIC photo.";
  }
  if (raw) console.error("[marketplace] photo upload failed:", error);
  return "The upload did not complete. Please check your connection and try again.";
}

/**
 * The one place every OTHER, unrecognised database or network error is turned
 * into something safe to show a customer or seller. Only call this after
 * checking every known, deliberately-parsed error pattern (a bank name
 * mismatch, a locked legal name, missing required category details, ...) and
 * finding none match — those stay their own specific human message. Logs the
 * real detail to the console so it is never lost for debugging, never shown
 * on screen.
 */
export function genericErrorMessage(context: string, error: unknown): string {
  console.error(`[marketplace] ${context}:`, error);
  return "Something went wrong on our end. Please try again, or message us on WhatsApp if it keeps happening.";
}

/** Rounded-rect path, with a manual fallback for older canvas engines. */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  if (typeof (ctx as unknown as { roundRect?: unknown }).roundRect === "function") {
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, rr);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Picks the two-line split of `text` that minimises the widest resulting
 * line, at the ctx's current font — a balanced wrap for any wording, not a
 * hardcoded split point, so this keeps working if the text ever changes
 * again. Assumes at least two words; falls back to the whole text as a
 * single "line" if there is only one. */
function wrapToTwoLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): [string] | [string, string] {
  const words = text.split(" ");
  if (words.length < 2) return [text];
  let best: { line1: string; line2: string; worst: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const worst = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
    if (!best || worst < best.worst) best = { line1, line2, worst };
  }
  return [best!.line1, best!.line2];
}

/** The BundledMum watermark lozenge, bottom-centre, with a luminance-adaptive
 * scrim so cream text reads on both light and dark photos. The text is
 * roughly double the length of the mark's previous wording, so this never
 * assumes it fits on one line: it measures the real glyph width at the
 * canvas's actual font, wraps to two lines if needed, and only then shrinks
 * the font (down to a hard floor) if even two lines would still overflow —
 * so it can never run off the edges or clip, regardless of the exact
 * wording or image size. */
function drawWatermark(ctx: CanvasRenderingContext2D, size: number) {
  const text = "Buy Used Baby/Children Items on BundledMum";
  const inset = Math.round(size * 0.05);
  const maxLineWidth = size - inset * 2;
  const minFontSize = Math.max(6, Math.round(size * 0.018));

  let fontSize = Math.max(7, Math.round(size * 0.038));
  let lines: string[] = [text];
  for (;;) {
    ctx.font = `800 ${fontSize}px Nunito, "Helvetica Neue", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxLineWidth) { lines = [text]; break; }
    lines = wrapToTwoLines(ctx, text, maxLineWidth);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= maxLineWidth || fontSize <= minFontSize) break;
    fontSize -= 1;
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const padX = Math.round(fontSize * 0.9);
  const padY = Math.round(fontSize * 0.5);
  const lineHeight = Math.round(fontSize * 1.25);
  const textW = Math.max(...lines.map((l) => Math.ceil(ctx.measureText(l).width)));
  const lozW = Math.min(size - 2, textW + padX * 2);
  const lozH = padY * 2 + lines.length * lineHeight;
  const x = Math.round((size - lozW) / 2);
  const y = size - inset - lozH;

  // Measure average luminance of the region the lozenge now covers (bottom
  // centre, not the old bottom-left corner) to pick the scrim — the same
  // adaptive mechanism as before, just re-sampled at the new position.
  let dark = false;
  try {
    const region = ctx.getImageData(x, y, lozW, lozH).data;
    let sum = 0;
    for (let i = 0; i < region.length; i += 4) sum += 0.2126 * region[i] + 0.7152 * region[i + 1] + 0.0722 * region[i + 2];
    dark = sum / (region.length / 4) / 255 < 0.5;
  } catch { /* if the canvas is ever tainted, fall back to the light-photo scrim */ }

  ctx.fillStyle = dark ? "rgba(255,248,244,0.22)" : "rgba(0,0,0,0.30)";
  roundRectPath(ctx, x, y, lozW, lozH, Math.round(lozH * 0.25));
  ctx.fill();

  ctx.fillStyle = "#FFF8F4"; // cream text, always
  const cx = x + lozW / 2;
  lines.forEach((line, i) => {
    const cy = y + padY + lineHeight * i + lineHeight / 2;
    ctx.fillText(line, cx, cy);
  });
  ctx.textAlign = "left"; // restore the canvas default for any caller after this
}

/**
 * A seller relisting their OWN delisted listing. Returns true on success. It only
 * succeeds when the listing was delisted by the seller (not admin), the seller is
 * active with no outstanding debit, and stock remains, so a false result is real
 * and must be surfaced honestly, never shown as success. It re-enters the review
 * queue server side. Never call this for an admin-delisted listing.
 */
export async function sellerRelistListing(listingId: string): Promise<boolean> {
  const { data, error } = await sdb.rpc("seller_relist_listing", { p_listing_id: listingId });
  if (error) return false;
  return data === true;
}

/**
 * Takes a LIVE listing off the marketplace so its content (photos, category,
 * title, description, anything) can be edited freely — a live listing may
 * only have its price lowered otherwise (guard_seller_listing_edits is the
 * actual source of truth, this just triggers the same status change a
 * seller could make by hand). Status-only update, no other field in the
 * same write, so it clears that guard trivially; track_marketplace_delisting
 * stamps delisted_by='seller' so it can be told apart from an admin removal
 * and put back up later. Shared by every screen that offers this action
 * (dashboard, price edit, the full edit form's live-listing block) so the
 * one operation and its error handling can't drift between them.
 */
export async function sellerDelistForEdit(listingId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sdb.from("marketplace_listings").update({ status: "delisted" }).eq("id", listingId);
  if (error) return { ok: false, error: parseListingEditError(error.message) || genericErrorMessage("delist listing", error) };
  return { ok: true };
}

/** Buyer price from the seller asking price and the current markup percent. */
export function buyerPrice(askingNaira: number, markupPct: number): number {
  if (!isFinite(askingNaira) || askingNaira <= 0) return 0;
  return Math.round(askingNaira * (1 + (markupPct || 0) / 100));
}

/** Masks a bank account number, showing only the last 4 digits. */
export function maskAccount(acct: string | null | undefined): string {
  const s = String(acct || "").trim();
  if (s.length <= 4) return s ? `••••${s}` : "Not set";
  return `••••••${s.slice(-4)}`;
}

/**
 * Validates a public display name. It is shown to buyers, so it must not carry
 * contact details: no digits, no @ symbol, no URL. Returns an error string or
 * null when valid.
 */
export function validateDisplayName(name: string): string | null {
  const s = name.trim();
  if (s.length < 2) return "Please enter a display name.";
  if (/\d/.test(s)) return "The display name cannot contain numbers. It is shown to buyers, so keep out any contact details.";
  if (/@/.test(s)) return "The display name cannot contain an @ symbol. It is shown to buyers, so keep out any contact details.";
  if (/https?:\/\/|www\.|\.[a-z]{2,}\//i.test(s)) return "The display name cannot contain a web address. It is shown to buyers, so keep out any contact details.";
  return null;
}

/**
 * Anti-leakage control, mirrors the admin review check. Blocks listing text that
 * looks like a phone number or an attempt to route buyers off platform: a run of
 * 7 or more digits (with common separators), a +234 prefix, or the words
 * whatsapp, call me, dm me.
 */
export function hasContactLeak(...texts: Array<string | null | undefined>): boolean {
  const blob = texts.filter(Boolean).join("  ");
  if (!blob) return false;
  const lower = blob.toLowerCase();
  if (/whats\s*app|call me|dm me|\+?234\d/.test(lower)) return true;
  if (/(?:\d[\s().\-]?){7,}/.test(blob)) return true;
  return false;
}

/**
 * Mirrors the database's normalize_name_for_match(text) exactly: strip
 * everything that is not a letter, uppercase what remains. Used client side
 * so the bank-account-name guidance reflects the same rule the database
 * trigger actually enforces, ignoring case and punctuation the same way.
 */
export function normalizeNameForMatch(text: string): string {
  return (text || "").replace(/[^A-Za-z]/g, "").toUpperCase();
}

/**
 * Checks whether a bank account name genuinely contains both a legal first
 * and last name, the same substring test the database trigger runs. Returns
 * which of the two parts are missing (empty array means it matches, or one
 * of the three inputs is not yet filled in so there is nothing to check yet).
 */
export function missingNameParts(
  bankAcctName: string,
  legalFirstName: string,
  legalLastName: string,
): Array<"first" | "last"> {
  const first = normalizeNameForMatch(legalFirstName);
  const last = normalizeNameForMatch(legalLastName);
  const account = normalizeNameForMatch(bankAcctName);
  if (!first || !last || !account) return [];
  const missing: Array<"first" | "last"> = [];
  if (!account.includes(first)) missing.push("first");
  if (!account.includes(last)) missing.push("last");
  return missing;
}

/**
 * Parses the database's bank-name-match rejection, raised in the form
 * 'The bank account name must include your first and last name. We could
 * not match "X Y" against the account name "Z"', into a specific, human
 * message naming the actual first and last name. Returns null when the
 * message does not match that shape, so any other database error still
 * falls through to being shown as-is by the caller.
 */
export function parseBankNameMismatch(message: string, legalFirstName: string, legalLastName: string): string | null {
  if (!/must include your first and last name/i.test(message || "")) return null;
  return `The account name needs to include your name, ${legalFirstName.trim()} and ${legalLastName.trim()}, so we can confirm it is yours.`;
}

/**
 * A PREVIEW ONLY of the public name the database will derive from a seller's
 * legal first and last name (a trigger, derive_seller_display_name, sets
 * display_name itself on every insert/update once both are present; nothing
 * the client sends as display_name is ever stored). Ports
 * format_seller_display_name's exact algorithm: clean to letters, spaces,
 * apostrophes, hyphens and full stops, collapse whitespace, split on space,
 * the first token capitalised, the LAST token reduced to a single uppercase
 * initial, a single-word result (e.g. legal last name left blank) has no
 * initial. Always re-read the real stored display_name after saving, this is
 * never the source of truth.
 */
export function previewDisplayName(legalFirstName: string, legalLastName: string): string | null {
  const raw = `${legalFirstName || ""} ${legalLastName || ""}`;
  const clean = raw.replace(/[^A-Za-z\s'\-.]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const parts = clean.split(" ");
  const trimDots = (s: string) => s.replace(/^\.+|\.+$/g, "");
  const capWords = (s: string) => s.replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const first = capWords(trimDots(parts[0]));
  if (!first) return null;
  if (parts.length === 1) return first;
  const lastToken = trimDots(parts[parts.length - 1]);
  if (!lastToken) return first;
  return `${first} ${lastToken[0].toUpperCase()}.`;
}

/**
 * Strips the "{Condition label}. " prefix that create-listing composes onto
 * condition_notes on submit (see submit() in CreateListingPage.tsx), so
 * editing an existing listing shows the seller just their own free text
 * back in the notes field, not the label duplicated inside it. Returns the
 * notes unchanged if they do not start with that exact prefix (e.g. an
 * older listing saved before this composition existed).
 */
export function stripConditionPrefix(conditionLabel: string, notes: string): string {
  const prefix = `${conditionLabel}. `;
  return notes.startsWith(prefix) ? notes.slice(prefix.length) : notes;
}

/**
 * Parses the listing-edit rejections guard_seller_listing_edits can raise.
 * All three are already written as human copy in the database, so this just
 * confirms the message matches a known shape and passes it through as-is
 * (never a raw, unrecognised error). Returns null for anything else, which
 * the caller shows through genericErrorMessage instead.
 */
export function parseListingEditError(message: string): string | null {
  const raw = message || "";
  if (/can lower the price of a live listing/i.test(raw)) {
    return "You can lower the price of a live listing, but not raise it. Delist it first if you need to change the price upward.";
  }
  if (/delist this listing first, then edit it/i.test(raw)) {
    return "To change anything other than lowering the price, delist this listing first, then edit it. It will need reviewing again before it goes back up.";
  }
  if (/sold listing cannot be edited/i.test(raw)) {
    return "A sold listing cannot be edited.";
  }
  if (/only bundledmum can put a listing live/i.test(raw)) {
    return "Only BundledMum can put a listing live. Submit it for review instead.";
  }
  // Already written for a person to read — passed through verbatim rather
  // than reworded, per the original-price feature's own instruction. Client
  // validation on both price screens already mirrors this check, so this is
  // the rare-recovery path for a stale preview (e.g. markup changed between
  // page load and submit).
  if (/original price should be higher than what you are selling it for/i.test(raw)) {
    return raw;
  }
  return null;
}

/**
 * Parses the database's legal-name-lock rejection ('Your legal name cannot
 * be changed once set. Message BundledMum if it needs correcting.') into a
 * clear message with an obvious next step. Returns null for any other
 * database error, which the caller shows as-is.
 */
export function parseLegalNameLockError(message: string): string | null {
  if (!/legal name cannot be changed once set/i.test(message || "")) return null;
  return "Your legal name is locked once set, to keep every payout account genuinely matched to its owner. If it needs correcting, message us on WhatsApp and we will sort it out.";
}
