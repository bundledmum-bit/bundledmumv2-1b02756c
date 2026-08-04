import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A stable per-browser-per-device identifier, built from things that stay the
 * same for this device across sessions (user agent, screen size, timezone)
 * but differ between devices. Not forensically precise by design, it only
 * needs to reliably tell "the same phone as last time" from "a different
 * device" for the new-device sign-in alert. Hashed so nothing readable about
 * the device leaves the browser as-is.
 */
async function deviceFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  ].join("|");
  const bytes = new TextEncoder().encode(parts);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Calls the already-deployed record-login-event edge function once a
 * magic-link sign-in has completed and the session is established. It
 * silently records the device, and only when this device has never been seen
 * for this customer before, sends a "new device" email alert itself (this
 * function does not build or send that email, the backend does).
 *
 * Fire-and-forget by design: a seller must never be blocked or bounced back
 * to signed-out because this courtesy call failed. Every error here is
 * swallowed on purpose.
 */
export async function recordLoginEvent(supabase: SupabaseClient): Promise<void> {
  try {
    const fingerprint = await deviceFingerprint();
    await supabase.functions.invoke("record-login-event", {
      body: { device_fingerprint: fingerprint, user_agent: navigator.userAgent },
    });
  } catch {
    // Courtesy layer, not a gate — never surface or rethrow.
  }
}
