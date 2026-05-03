import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "bm_preview_token";

interface ValidateResult {
  valid: boolean;
  label: string | null;
}

async function validate(token: string): Promise<ValidateResult> {
  try {
    const { data, error } = await (supabase as any).rpc("validate_preview_token", { p_token: token });
    if (error) return { valid: false, label: null };
    // RPC can return either a boolean (legacy) or { valid, label } (current).
    if (typeof data === "boolean") return { valid: data, label: null };
    return {
      valid: !!data?.valid,
      label: typeof data?.label === "string" ? data.label : null,
    };
  } catch {
    return { valid: false, label: null };
  }
}

/**
 * Reads `?preview=TOKEN` on mount, validates against the DB via the
 * `validate_preview_token` RPC (which also auto-increments access_count),
 * and persists the token STRING in localStorage so subsequent visits bypass
 * the Coming Soon gate until the token is revoked/expired.
 *
 * Returns `{ ready, valid, label }`. While `ready` is false the gate must
 * not fire — otherwise a user arriving via a preview link would still see
 * the Coming Soon redirect for a frame before the bypass kicks in. `label`
 * is the human-readable token name from the RPC and may be used to greet
 * the visitor (e.g. "Welcome, Gladness").
 */
export function usePreviewToken(): { ready: boolean; valid: boolean; label: string | null } {
  const [state, setState] = useState<{ ready: boolean; valid: boolean; label: string | null }>({
    ready: false,
    valid: false,
    label: null,
  });

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      // 1. Consume ?preview= from the URL (one-shot).
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("preview");
      if (fromUrl) {
        const res = await validate(fromUrl);
        if (res.valid) {
          localStorage.setItem(STORAGE_KEY, fromUrl);
          // Clean up the URL so the token isn't copy-pasted around.
          const url = new URL(window.location.href);
          url.searchParams.delete("preview");
          window.history.replaceState({}, "", url.toString());
          if (mounted) setState({ ready: true, valid: true, label: res.label });
          return;
        }
        // Invalid token in URL — fall through to localStorage check.
      }

      // 2. Re-validate any stored token so revoked/expired ones get cleared.
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const res = await validate(stored);
        if (!res.valid) localStorage.removeItem(STORAGE_KEY);
        if (mounted) setState({ ready: true, valid: res.valid, label: res.label });
        return;
      }

      if (mounted) setState({ ready: true, valid: false, label: null });
    };

    run();
    return () => { mounted = false; };
  }, []);

  return state;
}
