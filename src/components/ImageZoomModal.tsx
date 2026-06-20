import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Shared full-screen image lightbox used across the site (cart, hospital
// list, product detail/page, subscription, article cards, admin). The
// enlarged image is CONSTRAINED below the viewport (max-w-[90vw]
// max-h-[85vh], object-contain) so there is always clickable scrim around
// it to tap out on — at 375px and on desktop. Dismiss on scrim tap, the X
// button (≥44px, on-screen), or Esc. Tapping the image never closes or
// navigates; closing only calls onClose (never history.back).

interface Props {
  src: string | null | undefined;
  alt?: string;
  /** Optional caption rendered under the enlarged image. */
  caption?: string;
  onClose: () => void;
}

export default function ImageZoomModal({ src, alt, caption, onClose }: Props) {
  useEffect(() => {
    if (!src) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    // Lock body scroll while open; restore the previous value on close.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, onClose]);

  if (!src) return null;

  // Portal to <body> so the overlay always escapes any transformed /
  // overflow-clipped ancestor (e.g. animate-* transforms, drawers) — a
  // `position: fixed` element inside a transformed box is positioned
  // relative to that box, not the viewport, which would break the scrim.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
      >
        <X className="w-6 h-6" />
      </button>
      {/* Content wrapper shrinks to the image, so the gap on every side is
          scrim that closes on tap. Tapping the image/caption does not. */}
      <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt || ""}
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
        />
        {caption && <p className="text-white/90 text-sm font-medium text-center max-w-[90vw]">{caption}</p>}
      </div>
    </div>,
    document.body,
  );
}
