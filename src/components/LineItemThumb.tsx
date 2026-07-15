import { useState } from "react";
import { cn } from "@/lib/utils";

// Small rounded product thumbnail for line-item / order-item / cart rows.
// Shows the self-hosted product image (object-cover, rounded, subtle border);
// when the image is missing OR fails to load it falls back to a NEUTRAL muted
// placeholder box — never a box emoji and never the broken-image icon. Pass an
// already-resolved URL (e.g. getBrandImage(brand)); sizing comes from className.
export default function LineItemThumb({
  src,
  alt = "",
  className = "w-12 h-12",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = typeof src === "string" && /^https?:\/\//.test(src.trim()) ? src.trim() : null;
  return (
    <div className={cn("rounded-md border border-border bg-muted overflow-hidden flex-shrink-0", className)}>
      {url && !broken && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}
