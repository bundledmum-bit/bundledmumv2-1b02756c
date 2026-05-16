import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { analytics } from "@/lib/ga";

const BAR_HEIGHT = 40;

export function useAnnouncementHeight() {
  const { data: settings } = useSiteSettings();
  const [dismissed, setDismissed] = useState(false);
  const visible = !dismissed && settings?.announcement_enabled === true && !!settings?.announcement_text;
  return { height: visible ? BAR_HEIGHT : 0, dismissed, setDismissed };
}

export default function AnnouncementBar({
  dismissed,
  onDismiss,
}: {
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const { data: settings, isLoading } = useSiteSettings();

  if (
    isLoading ||
    dismissed ||
    settings?.announcement_enabled !== true ||
    !settings?.announcement_text
  ) {
    return null;
  }

  const bgColor = settings.announcement_bg_color || "#1a2e1a";
  const textColor = settings.announcement_text_color || "#ffffff";
  const text = settings.announcement_text;
  const link = settings.announcement_link;
  const promoId = `announcement_bar_${(text || "").slice(0, 40)}`;
  const promoName = text || "Announcement";

  return (
    <AnnouncementImpressionTracker promoId={promoId} promoName={promoName}>
      <div
        className="fixed top-0 left-0 right-0 z-[1001] flex items-center justify-center px-10 transition-all duration-300"
        style={{ backgroundColor: bgColor, color: textColor, height: BAR_HEIGHT }}
      >
      {link ? (
        <a
          href={link}
          onClick={() => {
            try {
              analytics.push({
                event: "select_promotion",
                promotion_id: promoId,
                promotion_name: promoName,
                creative_slot: "announcement_bar",
              });
            } catch { /* ignore */ }
          }}
          className="text-[13px] font-medium font-body hover:underline truncate"
          style={{ color: textColor }}
        >
          {text}
        </a>
      ) : (
        <span className="text-[13px] font-medium font-body truncate">{text}</span>
      )}
      <button
        onClick={onDismiss}
        className="absolute right-3 p-1 rounded-full hover:opacity-70 transition-opacity"
        aria-label="Dismiss announcement"
      >
        <X size={14} style={{ color: textColor }} />
      </button>
      </div>
    </AnnouncementImpressionTracker>
  );
}

/**
 * Wrapper that fires a single GA4 view_promotion event when the banner
 * scrolls into view (≥50% intersection). Ref-guarded so it fires once
 * per page load per promo id.
 */
function AnnouncementImpressionTracker({
  promoId,
  promoName,
  children,
}: {
  promoId: string;
  promoName: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.intersectionRatio < 0.5) continue;
          if (firedRef.current) return;
          firedRef.current = true;
          try {
            analytics.push({
              event: "view_promotion",
              promotion_id: promoId,
              promotion_name: promoName,
              creative_slot: "announcement_bar",
            });
          } catch { /* ignore */ }
          obs.disconnect();
          return;
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [promoId, promoName]);
  return <div ref={ref}>{children}</div>;
}
