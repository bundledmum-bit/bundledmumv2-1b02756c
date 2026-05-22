/**
 * 3-tier clipboard strategy. The modern Clipboard API only works in HTTPS
 * + top-level contexts — iframes (Lovable preview), some older mobile
 * browsers, and pages with restrictive permissions silently reject it.
 *
 *   Tier 1: navigator.clipboard.writeText (when isSecureContext)
 *   Tier 2: legacy <textarea> + document.execCommand("copy")
 *   Tier 3: caller renders a manual-copy fallback with the URL preselected
 *
 * Returns true when text actually made it onto the clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Tier 1 — modern Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard && (window as any).isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("[clipboard] modern API failed, trying legacy method", e);
    }
  }

  // Tier 2 — legacy textarea + execCommand. Works inside iframes and
  // older Safari, which is critical for the Lovable preview surface.
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    // iOS Safari needs the selection range explicitly set, not just .select().
    textarea.focus();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (ok) return true;
  } catch (e) {
    console.warn("[clipboard] legacy method failed", e);
  }

  // Tier 3 — both failed; caller should show the manual copy UI.
  return false;
}
