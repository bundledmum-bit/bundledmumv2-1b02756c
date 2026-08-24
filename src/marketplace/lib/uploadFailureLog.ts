import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/** log_upload_failure post-dates the generated types, so this goes through
 * the same untyped-client cast the rest of the marketplace uses for newer
 * RPCs. Cast locally rather than importing sellData's sdb, which would
 * create an import cycle (sellData imports this module). */
const db = supabase as unknown as SupabaseClient;

/**
 * Records a photo-upload failure so we stop guessing.
 *
 * A seller reporting "I cannot add images" tells us nothing actionable:
 * not their device, not the file size, not the format, not which step
 * broke. Every failure point in the photo path calls this, so the next
 * seller who hits one generates a row that names all four.
 *
 * log_upload_failure is SECURITY DEFINER, anon callable, resolves the
 * seller from auth.uid() itself, and swallows its own errors server side.
 * This wrapper swallows transport errors too, and is never awaited by the
 * upload path: logging a failure must never itself break an upload.
 */

/** Every point the photo path can fail. Kept as a union so a typo cannot
 * silently create a new stage name that nothing groups by. */
export type UploadFailureStage =
  | "read_file"
  | "decode_timeout"
  | "decode_unsupported"
  | "canvas_context"
  | "canvas_draw"
  | "compress"
  | "compress_timeout"
  | "size_after_compress"
  | "storage_upload"
  | "storage_upload_timeout";

export function logUploadFailure(
  stage: UploadFailureStage,
  reason: string,
  file?: { size?: number; type?: string } | null,
): void {
  try {
    void db.rpc("log_upload_failure", {
      p_stage: stage,
      p_reason: reason.slice(0, 500),
      p_file_size_bytes: file?.size ?? null,
      p_file_type: file?.type || null,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }).then(() => {}, () => { /* logging must never break an upload */ });
  } catch {
    /* logging must never break an upload */
  }
}
