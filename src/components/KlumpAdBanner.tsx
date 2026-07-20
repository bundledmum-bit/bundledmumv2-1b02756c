import { useEffect, useRef } from "react";

// Passive Klump "pay later" ad banner (informational — NOT a checkout button).
// Klump's klump.js scans the DOM for id="klump__ad" and renders an instalment
// message for the price in its child inputs.
//
// SPA re-init: klump.js finds #klump__ad via document.getElementById('klump__ad')
// ONLY at script-execution time — it has no MutationObserver, no DOMContentLoaded
// hook, and no exposed re-render API (confirmed by inspecting klump.js). So to
// (re)render the banner when this component mounts and when the shopper navigates
// between products (price changes), we build the #klump__ad element first and
// then RE-EXECUTE klump.js by appending a fresh script node. We reuse the same
// script id checkout uses ("klump-js-sdk") and remove any prior node first, so
// there's only ever one klump.js tag (no accumulation / true double-load).

const KLUMP_SCRIPT_ID = "klump-js-sdk";
const KLUMP_SCRIPT_SRC = "https://js.useklump.com/klump.js";

interface KlumpAdBannerProps {
  price: number;
  publicKey: string;
  enabled: boolean;
}

export default function KlumpAdBanner({ price, publicKey, enabled }: KlumpAdBannerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Nothing to show without a key, a positive price, or when Klump is off.
  const shouldRender = enabled && !!publicKey && Number(price) > 0;

  useEffect(() => {
    if (!shouldRender || !hostRef.current) return;
    const host = hostRef.current;

    // Build #klump__ad with THIS product's current price + the merchant key.
    const ad = document.createElement("div");
    ad.id = "klump__ad";
    const addInput = (type: string, id: string, value: string) => {
      const input = document.createElement("input");
      input.type = type;
      input.id = id;
      input.value = value;
      input.readOnly = true;
      // Hide by default. klump.js only reads these fields (by id) to render its
      // banner; it never needs them visible. Hiding them ourselves means that if
      // klump.js is slow, blocked, or fails to render, the raw price / merchant
      // key / currency never leak as plain text (previously they showed unstyled).
      input.style.display = "none";
      input.setAttribute("aria-hidden", "true");
      input.tabIndex = -1;
      ad.appendChild(input);
    };
    addInput("number", "klump__price", String(Math.round(Number(price))));
    addInput("text", "klump__merchant__public__key", publicKey);
    addInput("text", "klump__currency", "NGN");
    host.replaceChildren(ad);

    // Re-execute klump.js so it re-scans and renders into the new #klump__ad.
    const existing = document.getElementById(KLUMP_SCRIPT_ID);
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.id = KLUMP_SCRIPT_ID;
    script.src = KLUMP_SCRIPT_SRC;
    script.async = true;
    document.head.appendChild(script);

    return () => { host.replaceChildren(); };
  }, [shouldRender, price, publicKey]);

  if (!shouldRender) return null;
  // Klump owns the subtree (we populate it imperatively above), so keep the
  // JSX child empty to avoid React reconciling against Klump's injected DOM.
  return <div ref={hostRef} className="mt-2 mb-4" />;
}
