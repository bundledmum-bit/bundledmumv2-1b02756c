import { useEffect } from "react";

// Shared full-screen image lightbox. Used by admin pages and the new
// maternity-bundle inline editor. The previous home of this component
// was src/components/admin/ImageZoomModal.tsx; that path now re-exports
// from here for backward compatibility.

interface Props {
  src: string | null | undefined;
  alt?: string;
  onClose: () => void;
}

export default function ImageZoomModal({ src, alt, onClose }: Props) {
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
      className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-2"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <img
        src={src}
        alt={alt || ""}
        className="max-w-[95vw] max-h-[95vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
