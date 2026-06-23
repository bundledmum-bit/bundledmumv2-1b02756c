import { useSiteSettings } from "@/hooks/useSupabaseData";

// Admin-editable copy for the PWA install prompt and the push opt-in card.
// Values live in site_settings (Public read) as JSON strings. We render the
// hardcoded defaults until settings arrive and fall back to them whenever a
// key is missing/empty — never a blocking load.

export const PROMPT_COPY_DEFAULTS = {
  pwa_install_title: "Install BundledMum",
  pwa_install_body: "Add the app to your home screen for faster shopping.",
  pwa_install_cta: "Install App",
  push_optin_title: "Get notified?",
  push_optin_body: "Order updates, restocks and offers.",
  push_optin_cta: "Allow",
  push_optin_decline: "Not now",
} as const;

export type PromptCopyKey = keyof typeof PROMPT_COPY_DEFAULTS;

// site_settings values are stored as plain strings in jsonb, but tolerate a
// double-encoded value (e.g. '"Install App"') just in case.
export function coercePromptValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") {
    if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) {
      try { return JSON.parse(v); } catch { return v; }
    }
    return v;
  }
  return String(v);
}

export function usePromptCopy() {
  const { data } = useSiteSettings();
  const get = (k: PromptCopyKey) => coercePromptValue(data?.[k]).trim() || PROMPT_COPY_DEFAULTS[k];
  return {
    installTitle: get("pwa_install_title"),
    installBody: get("pwa_install_body"),
    installCta: get("pwa_install_cta"),
    optinTitle: get("push_optin_title"),
    optinBody: get("push_optin_body"),
    optinCta: get("push_optin_cta"),
    optinDecline: get("push_optin_decline"),
  };
}
