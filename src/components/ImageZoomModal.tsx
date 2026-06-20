import { useEffect } from "react";
import { X } from "lucide-react";

// Shared full-screen image lightbox. Used by admin pages, the maternity-
// bundle inline editor, and the public hospital-list page. The previous
// home of this component was src/components/admin/ImageZoomModal.tsx; that
// path now re-exports from here for backward compatibility.

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
    return () => window.removeEventListener("keydown", handler);
  }, [src, onClose]);

  if (!src) return null;

  return (
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
        className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
      >
        <X className="w-6 h-6" />
      </button>
      <div className="flex flex-col items-center gap-3 max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt || ""} className="max-w-[95vw] max-h-[85vh] object-contain" />
        {caption && <p className="text-white/90 text-sm font-medium text-center max-w-[90vw]">{caption}</p>}
      </div>
    </div>
  );
}
