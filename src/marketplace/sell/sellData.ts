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
