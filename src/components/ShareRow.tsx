import { toast } from "sonner";
import { copyToClipboard } from "@/lib/copyToClipboard";

// Inline brand glyphs (white fill) so the row is uniform and never hotlinks an
// external logo. lucide-react has no WhatsApp or TikTok mark, so all four are
// inline for a consistent filled-glyph look.
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}
function TikTokGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}
function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function IconButton({
  label,
  bgClass,
  style,
  onClick,
  href,
  children,
}: {
  label: string;
  bgClass?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const cls = `w-11 h-11 rounded-full grid place-items-center text-white shadow-[0_2px_8px_-1px_rgba(32,37,26,0.25)] hover:opacity-90 active:scale-95 transition ${bgClass || ""}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={cls} style={style}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cls} style={style}>
      {children}
    </button>
  );
}

/**
 * Shared "Share this with someone that needs it" row used by the public quote
 * page and the public landing (package) page. Takes the composed share `message`
 * and the absolute `url`. Never prints (print:hidden) so it stays off the quote
 * PDF/print output.
 */
export default function ShareRow({ message, url }: { message: string; url: string }) {
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  // Instagram + TikTok have no web share link: use the OS native share sheet when
  // available, otherwise copy the message and tell the user where to paste it.
  const nativeShareOrCopy = async (platform: "Instagram" | "TikTok") => {
    if (typeof navigator !== "undefined" && typeof (navigator as any).share === "function") {
      try {
        await (navigator as any).share({ text: message, url });
      } catch {
        // User dismissed the share sheet; nothing to do.
      }
      return;
    }
    const ok = await copyToClipboard(message);
    toast[ok ? "success" : "error"](
      ok ? `Link copied, paste it into ${platform}` : "Could not copy the link",
    );
  };

  return (
    <div className="print:hidden bg-card quote-card border border-border rounded-xl p-4 mb-4">
      <p className="text-sm font-bold text-center text-foreground mb-3">Share this with someone that needs it</p>
      <div className="flex items-center justify-center gap-3">
        <IconButton label="Share on WhatsApp" href={waHref} style={{ backgroundColor: "#25D366" }}>
          <WhatsAppGlyph />
        </IconButton>
        <IconButton
          label="Share on Instagram"
          onClick={() => nativeShareOrCopy("Instagram")}
          style={{ background: "linear-gradient(45deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)" }}
        >
          <InstagramGlyph />
        </IconButton>
        <IconButton label="Share on TikTok" onClick={() => nativeShareOrCopy("TikTok")} style={{ backgroundColor: "#010101" }}>
          <TikTokGlyph />
        </IconButton>
        <IconButton label="Share on Facebook" href={fbHref} style={{ backgroundColor: "#1877F2" }}>
          <FacebookGlyph />
        </IconButton>
      </div>
    </div>
  );
}
