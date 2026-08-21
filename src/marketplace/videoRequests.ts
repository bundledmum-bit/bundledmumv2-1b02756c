import { useQuery } from "@tanstack/react-query";
import { cdb } from "./checkout/orders";
import { sdb } from "./sell/sellData";
import { mdb } from "./data/mdb";
import { uploadWithProgress } from "./lib/uploadWithProgress";

/**
 * "Ask for a video" data layer — a buyer requests a short, bespoke video of
 * a specific listing (does it power on, does the zip open, ...), a seller
 * films it on their own phone and uploads it, and only that one buyer can
 * ever watch it. A completely different feature from the paused public
 * listing-video upload (marketplace_video_enabled, videoSettings.ts) despite
 * the similar name — this doesn't touch that flag or that bucket.
 *
 * THE ONE RULE THAT MATTERS MOST: nothing here ever reads a video's
 * duration, creates a <video> element to probe it, touches a canvas, or
 * compresses anything. A previous feature did exactly that and hung
 * indefinitely on iPhone (handoff §87-92) — the file's own `.size`,
 * available the instant it's picked with zero decoding, is the only check
 * used, and the raw file is uploaded exactly as selected. The one place a
 * <video> element legitimately appears anywhere in this feature is the
 * BUYER's own player once they choose to watch — normal, visible HTML5
 * playback with a src URL, nothing hidden, nothing probing metadata.
 */

export const REQUEST_VIDEO_BUCKET = "marketplace-request-videos";

/** Live from site_settings, never hardcoded — currently 60. Read once and
 * cached; a stale value here would only ever be slightly conservative
 * (the bucket itself enforces the real limit regardless). */
export function useVideoRequestMaxMb() {
  return useQuery({
    queryKey: ["mkt-video-request-max-mb"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      const { data } = await mdb.from("site_settings").select("value").eq("key", "marketplace_video_request_max_mb").maybeSingle();
      const n = Number((data as { value?: unknown } | null)?.value);
      return isFinite(n) && n > 0 ? n : 60;
    },
  });
}

// ─── Buyer side ─────────────────────────────────────────────────────────────

export interface BuyerVideoRequest {
  id: string;
  listing_id: string;
  note: string | null;
  video_path: string | null;
  watched_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
}

const BUYER_VR_SELECT = "id, listing_id, note, video_path, watched_at, declined_at, decline_reason, created_at";

/** The buyer's own request on this listing, if they have made one. At most
 * one ever exists per (listing_id, buyer_id) — re-requesting updates the
 * note server side rather than creating a second row, per
 * buyer_request_video's own contract. Readable directly (RLS: buyer reads
 * own requests) even once video_path is set — seeing that a video exists
 * is not the same as claiming it, see buyerClaimVideoRequest below for the
 * one call that actually starts the deletion clock. */
export async function fetchBuyerVideoRequestForListing(listingId: string): Promise<BuyerVideoRequest | null> {
  const { data, error } = await cdb.from("marketplace_video_requests")
    .select(BUYER_VR_SELECT)
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as BuyerVideoRequest) ?? null;
}

/** Requests a video, or updates the note if one already exists on this
 * listing. p_note runs through marketplace_detect_bypass_attempt server
 * side regardless of what detectBypassAttempt (questions.ts) already
 * caught client side. */
export async function buyerRequestVideo(listingId: string, note: string): Promise<{ ok: true; requestId: string } | { ok: false; message: string }> {
  const { data, error } = await cdb.rpc("buyer_request_video", { p_listing_id: listingId, p_note: note.trim() || null });
  if (error) {
    const message = String((error as { message?: string }).message || "") || "We could not send this. Please refresh and try again.";
    return { ok: false, message };
  }
  return { ok: true, requestId: data as string };
}

/**
 * Starts the deletion clock. Call this ONLY at the exact moment a buyer
 * deliberately taps to watch — never on page load, never merely to check
 * whether a video exists (fetchBuyerVideoRequestForListing above already
 * covers that without claiming anything).
 */
export async function buyerClaimVideoRequest(requestId: string): Promise<{ ok: true; videoPath: string; firstWatch: boolean } | { ok: false; message: string }> {
  const { data, error } = await cdb.rpc("buyer_claim_request_video", { p_request_id: requestId });
  if (error) return { ok: false, message: error.message || "Could not open this video. Please try again." };
  const row = (Array.isArray(data) ? data[0] : data) as { video_path?: string; first_watch?: boolean } | null;
  if (!row?.video_path) return { ok: false, message: "This video isn't ready yet." };
  return { ok: true, videoPath: row.video_path, firstWatch: !!row.first_watch };
}

/** A short-lived signed URL to play the video — the bucket is private by
 * design (only the requesting buyer should ever see it), so a plain public
 * URL would not work even if used. Same convention as
 * getPayoutProofSignedUrl in admin/marketplace/opsData.ts: a fresh 5-minute
 * link generated only when actually about to be shown, never cached or
 * stored. */
export async function getRequestVideoSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await cdb.storage.from(REQUEST_VIDEO_BUCKET).createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ─── Seller side ────────────────────────────────────────────────────────────

export interface SellerVideoRequest {
  id: string;
  listing_id: string;
  note: string | null;
  video_path: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
  listing?: { title: string | null; image_url: string | null } | null;
}

const SELLER_VR_SELECT = "id, listing_id, note, video_path, declined_at, decline_reason, created_at, listing:marketplace_listings(title, image_url)";

/** Every request on this seller's listings still awaiting a video (not yet
 * uploaded, not declined) — own numbers only, RLS-scoped. */
export async function fetchSellerVideoRequestsNeedingAttention(sellerId: string): Promise<SellerVideoRequest[]> {
  const { data, error } = await sdb.from("marketplace_video_requests")
    .select(SELLER_VR_SELECT)
    .eq("seller_id", sellerId)
    .is("video_path", null)
    .is("declined_at", null)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as SellerVideoRequest[];
}

/** One request, the deep-link destination for the seller's own detail page
 * — RLS ("seller reads requests on own listings") is what actually
 * enforces this belongs to them, not this query. */
export async function fetchSellerVideoRequest(requestId: string): Promise<SellerVideoRequest | null> {
  const { data, error } = await sdb.from("marketplace_video_requests")
    .select(SELLER_VR_SELECT)
    .eq("id", requestId)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as SellerVideoRequest) ?? null;
}

function extensionFor(file: File): string {
  const fromName = file.name?.split(".").pop()?.toLowerCase();
  if (fromName && /^(mp4|webm|mov|m4v|3gp)$/.test(fromName)) return fromName;
  const byType: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
    "video/3gpp": "3gp",
  };
  return byType[file.type] || "mp4";
}

/** Uploads the raw file exactly as selected — no compression, no
 * re-encoding, no metadata reads — then attaches it to the request. Path is
 * namespaced under the seller's own auth uid, same convention
 * SellerDispatchPage.tsx already uses, since the storage policy requires
 * it. onProgress fires real byte-level percentages via uploadWithProgress,
 * not a fake/simulated one. */
export async function sellerUploadVideoForRequest(
  requestId: string,
  sellerUserId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const path = `${sellerUserId}/request-${requestId}-${Date.now()}.${extensionFor(file)}`;
  try {
    await uploadWithProgress(sdb, REQUEST_VIDEO_BUCKET, path, file, onProgress);
  } catch (e) {
    return { ok: false, message: describeVideoRequestUploadError(e) };
  }
  const { data, error } = await sdb.rpc("seller_attach_request_video", { p_request_id: requestId, p_video_path: path });
  if (error) return { ok: false, message: error.message || "This could not be saved. Please try again." };
  if (data !== true) return { ok: false, message: "This could not be saved. Refresh and check the request is still there." };
  return { ok: true };
}

export async function sellerDeclineVideoRequest(requestId: string, reason: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await sdb.rpc("seller_decline_video_request", { p_request_id: requestId, p_reason: reason.trim() || null });
  if (error) return { ok: false, message: error.message || "This could not be saved. Please try again." };
  if (data !== true) return { ok: false, message: "This could not be saved. Refresh and check the request is still there." };
  return { ok: true };
}

/** Wording in TIME, not megabytes, per the task's own instruction — nobody
 * films in megabytes. Used both for the upfront file.size check (before any
 * upload is attempted) and for the rare case the bucket's own size guard
 * rejects it anyway (client size read and server enforcement disagreeing
 * slightly is always possible, so this path still needs a real message). */
export function describeVideoRequestUploadError(error: unknown): string {
  const raw = String((error as { message?: string } | null)?.message || "");
  if (/exceed|too large|maximum.*size|payload too large/i.test(raw)) {
    return "That video is too long, please record about 30 seconds or less.";
  }
  if (/mime type|not supported|invalid.*type|content.type/i.test(raw)) {
    return "That video format isn't supported. Please choose an MP4, MOV or WEBM file.";
  }
  if (raw) console.error("[marketplace] video request upload failed:", error);
  return "The upload did not go through. Please check your connection and try again.";
}
