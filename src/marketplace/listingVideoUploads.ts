import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { attachStagedListingVideo, LISTING_VIDEO_STAGING_BUCKET } from "./listingVideo";

/**
 * The listing-video upload, held ABOVE the router so it survives a seller
 * moving on to list another item.
 *
 * 36 of 90 sellers list several items in one sitting, so making them wait
 * on a 40MB transfer blocks exactly the most productive people. The upload
 * lives in this module rather than in any component, and a small dock
 * mounted outside <Routes> renders its state.
 *
 * RESUMABLE, via Supabase Storage's TUS endpoint. A drop at 80% resumes
 * from 80% rather than restarting, which on Nigerian mobile data is the
 * difference between finishing and giving up. tus-js-client is the
 * officially documented route; the alternative was hand rolling the
 * protocol over the XHR we already have, which is possible but is exactly
 * the code whose bugs only appear on the flaky connections it exists for.
 *
 * IT DOES NOT SURVIVE THE TAB CLOSING, and nothing here pretends otherwise.
 * Background Sync would, but Safari does not implement it, so iPhone
 * sellers would get a promise that fails silently, and iPhone is where
 * video has already broken twice here.
 *
 * `file.size` is the only thing ever read from the file.
 */

export type UploadStatus = "uploading" | "done" | "error" | "lost";

export interface UploadState {
  listingId: string;
  fileName: string;
  bytesTotal: number;
  bytesSent: number;
  progress: number;
  status: UploadStatus;
  message?: string;
  /** True while a screen is showing the full bar, so the dock stays out of
   * the way rather than duplicating it. */
  detailShown: boolean;
}

type Listener = (s: UploadState | null) => void;

let state: UploadState | null = null;
let upload: tus.Upload | null = null;
let currentFile: File | null = null;
let sellerAuthUid = "";
const listeners = new Set<Listener>();

function emit() { listeners.forEach((fn) => fn(state)); }

export function subscribeToListingVideoUpload(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}

export function getListingVideoUpload(): UploadState | null { return state; }

/** A screen with the full bar claims the display while it is mounted. */
export function setUploadDetailShown(v: boolean): void {
  if (!state) return;
  state = { ...state, detailShown: v };
  emit();
}

export function dismissListingVideoUpload(): void {
  state = null; upload = null; currentFile = null; emit();
}

/** Retries the SAME file. tus resumes from wherever it stopped. */
export function retryListingVideoUpload(): void {
  if (!currentFile || !state) return;
  void begin(state.listingId, currentFile, sellerAuthUid, state.fileName);
}

export function startListingVideoUpload(input: {
  listingId: string; file: File; sellerAuthUid: string;
}): void {
  currentFile = input.file;
  sellerAuthUid = input.sellerAuthUid;
  void begin(input.listingId, input.file, input.sellerAuthUid, input.file.name);
}

async function begin(listingId: string, file: File, authUid: string, fileName: string) {
  // A File held across a long form can have its blob evicted by the OS on a
  // low end device. Checked before anything is attempted so the seller gets
  // the honest message rather than a failed transfer.
  if (file.size === 0) {
    state = { listingId, fileName, bytesTotal: 0, bytesSent: 0, progress: 0, status: "lost",
      message: "the file was no longer readable", detailShown: state?.detailShown ?? false };
    emit();
    return;
  }

  state = { listingId, fileName, bytesTotal: file.size, bytesSent: 0, progress: 0,
    status: "uploading", detailShown: state?.detailShown ?? false };
  emit();

  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) {
    fail("You have been signed out. Sign in and try again.");
    return;
  }

  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const objectName = `${authUid}/listing-${listingId}.${ext}`;
  // The SAME expression client.ts uses, fallback included. Reading the env
  // var alone would give "undefined/storage/v1/..." in any build where it
  // is not set, which is exactly where the client still works fine.
  const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://rbtyprmkolqfylcbmgrk.supabase.co";
  const endpoint = `${baseUrl}/storage/v1/upload/resumable`;

  upload = new tus.Upload(file, {
    endpoint,
    retryDelays: [0, 3000, 6000, 12000, 24000],
    headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    metadata: {
      bucketName: LISTING_VIDEO_STAGING_BUCKET,
      objectName,
      contentType: file.type || "video/mp4",
      cacheControl: "3600",
    },
    // Supabase's TUS implementation requires exactly 6MB chunks.
    chunkSize: 6 * 1024 * 1024,
    onProgress(sent, total) {
      if (!state) return;
      state = { ...state, bytesSent: sent, bytesTotal: total,
        progress: total > 0 ? Math.round((sent / total) * 100) : 0 };
      emit();
    },
    onError() {
      fail("The connection dropped. Your listing is safe, tap to carry on sending.");
    },
    async onSuccess() {
      const res = await attachStagedListingVideo({ listingId, storagePath: objectName });
      if (!res.ok) { fail(res.message ?? "That could not be saved."); return; }
      if (!state) return;
      state = { ...state, progress: 100, bytesSent: state.bytesTotal, status: "done" };
      emit();
    },
  });

  // Resume from a previous attempt for this same file when one exists,
  // which is what turns a drop at 80% into 20% remaining rather than 100%.
  const previous = await upload.findPreviousUploads();
  if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
  upload.start();
}

function fail(message: string) {
  if (!state) return;
  state = { ...state, status: "error", message };
  emit();
}
