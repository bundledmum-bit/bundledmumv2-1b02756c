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

/**
 * Compresses an image before upload. Phone photos are 3 to 4MB each, and four
 * of them per listing is slow on Nigerian mobile data and wasteful in storage.
 * We draw the photo to a canvas with the longest edge capped at maxEdge and
 * export a moderate quality JPEG. A 3 to 4MB photo typically comes out around
 * 200 to 350KB. Falls back to the original file if anything goes wrong so an
 * upload is never lost.
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
      .catch(() => createImageBitmap(file));
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
 *  - burns in the "Uploaded on BundledMum" watermark: a lozenge bottom-left, inset
 *    5% of width, height ~8%, Nunito 800 text in cream, with an adaptive scrim
 *    (black 30% on light corners, cream 22% on dark) chosen from the measured
 *    corner luminance, so it stays legible on a white cot sheet and a navy pram.
 *  - exports a moderate-quality JPEG.
 * Baked into the stored file permanently, and only ever called for NEW listing
 * uploads. Dispatch and dispute photos keep the plain compressImage. Falls back to
 * the original file if anything fails so an upload is never lost.
 */
export async function processListingImage(file: File, size = 1200, quality = 0.82): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== "function") return compressImage(file);
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
      .catch(() => createImageBitmap(file));
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

/** The "Uploaded on BundledMum" lozenge, bottom-left, with a luminance-adaptive
 * scrim so cream text reads on both light and dark photos. */
function drawWatermark(ctx: CanvasRenderingContext2D, size: number) {
  const text = "Uploaded on BundledMum";
  const inset = Math.round(size * 0.05);
  const fontSize = Math.max(7, Math.round(size * 0.045));
  ctx.font = `800 ${fontSize}px Nunito, "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = "middle";
  const padX = Math.round(fontSize * 0.9);
  const textW = Math.ceil(ctx.measureText(text).width);
  const lozH = Math.max(Math.round(size * 0.08), fontSize + Math.round(fontSize * 0.9));
  const lozW = textW + padX * 2;
  const x = inset;
  const y = size - inset - lozH;

  // Measure average luminance of the corner the lozenge covers, to pick the scrim.
  let dark = false;
  try {
    const rw = Math.max(1, Math.min(lozW, size - x));
    const region = ctx.getImageData(x, y, rw, lozH).data;
    let sum = 0;
    for (let i = 0; i < region.length; i += 4) sum += 0.2126 * region[i] + 0.7152 * region[i + 1] + 0.0722 * region[i + 2];
    dark = sum / (region.length / 4) / 255 < 0.5;
  } catch { /* if the canvas is ever tainted, fall back to the light-photo scrim */ }

  ctx.fillStyle = dark ? "rgba(255,248,244,0.22)" : "rgba(0,0,0,0.30)";
  roundRectPath(ctx, x, y, lozW, lozH, Math.round(lozH * 0.3));
  ctx.fill();

  ctx.fillStyle = "#FFF8F4"; // cream text and mark, always
  ctx.fillText(text, x + padX, y + lozH / 2 + Math.round(fontSize * 0.06));
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
