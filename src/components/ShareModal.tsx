import { useState, useRef, useEffect } from "react";
import { X, Copy, Download, Check } from "lucide-react";
import { toast } from "sonner";
import brandLogoWhite from "@/assets/logos/BM-LOGO-WHITE.png";

interface ShareModalProps {
  onClose: () => void;
  title: string;
  subtitle: string;
  items: { name: string; price: number }[];
  totalPrice: number;
  badge?: string;
  shareUrl: string;
  shareText: string;
  gender?: string;
  hospitalType?: string;
  budgetLabel?: string;
  itemCount?: number;
}

const BRAND_TAGLINE = "Get All Your Baby Things in One Place — No Market Runs & Stress";
const BRAND_CTA = "Shop baby essentials, mum items, and baby gifts without stepping foot in any market.";
const BRAND_INVITE = "Build your own personalised list FREE at";
const SITE_URL = "bundledmum.com/quiz";

export default function ShareModal({ onClose, title, subtitle, items, totalPrice, badge, shareUrl, shareText, gender, hospitalType, budgetLabel, itemCount }: ShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Load brand logo then draw everything
    const logoImg = new Image();
    logoImg.crossOrigin = "anonymous";
    logoImg.onload = () => drawCanvas(ctx, canvas, logoImg);
    logoImg.onerror = () => drawCanvas(ctx, canvas, null);
    logoImg.src = brandLogoWhite;
  }, [title, items, totalPrice, badge, gender, hospitalType, budgetLabel, itemCount]);

  const drawCanvas = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, logoImg: HTMLImageElement | null) => {
    canvas.width = 1080;
    canvas.height = 1350;

    // Background
    ctx.fillStyle = "#2D6A4F";
    ctx.fillRect(0, 0, 1080, 1350);

    // Subtle decorative circles
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.beginPath();
    ctx.arc(900, 200, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(150, 1100, 200, 0, Math.PI * 2);
    ctx.fill();

    // Brand logo image
    if (logoImg) {
      const logoHeight = 55;
      const logoWidth = (logoImg.naturalWidth / logoImg.naturalHeight) * logoHeight;
      ctx.drawImage(logoImg, 60, 35, logoWidth, logoHeight);
    } else {
      // Fallback text
      ctx.fillStyle = "#FFF8F4";
      ctx.font = "bold 32px 'DM Sans', sans-serif";
      ctx.fillText("BundledMum", 60, 80);
    }

    // Tagline under logo
    ctx.fillStyle = "rgba(255,248,244,0.5)";
    ctx.font = "16px 'DM Sans', sans-serif";
    ctx.fillText("...making being a mum easier.", 60, 110);

    // Badge
    if (badge) {
      ctx.fillStyle = "#F4845F";
      ctx.font = "bold 20px 'DM Sans', sans-serif";
      ctx.fillText(badge, 60, 155);
    }

    // Title
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 44px 'DM Sans', sans-serif";
    const titleY = badge ? 210 : 190;
    ctx.fillText(title, 60, titleY);

    // Subtitle info pills
    ctx.fillStyle = "#FFF8F4";
    ctx.font = "22px 'DM Sans', sans-serif";
    const infoLine = [
      gender === "boy" ? "👶 Boy" : gender === "girl" ? "👧 Girl" : "🌈 Neutral",
      hospitalType ? `🏥 ${hospitalType}` : "",
      budgetLabel ? `${budgetLabel} Budget` : "",
      itemCount ? `${itemCount} items` : "",
    ].filter(Boolean).join(" · ");
    ctx.fillText(infoLine, 60, titleY + 55);

    // Price
    ctx.fillStyle = "#F4845F";
    ctx.font = "bold 60px 'DM Sans', sans-serif";
    ctx.fillText(`₦${totalPrice.toLocaleString()}`, 60, titleY + 140);

    // Divider
    const dividerY = titleY + 170;
    ctx.strokeStyle = "rgba(255,248,244,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, dividerY);
    ctx.lineTo(1020, dividerY);
    ctx.stroke();

    // Items
    ctx.fillStyle = "#FFF8F4";
    ctx.font = "20px 'DM Sans', sans-serif";
    const itemStartY = dividerY + 40;
    const displayItems = items.slice(0, 10);
    displayItems.forEach((item, i) => {
      const y = itemStartY + i * 38;
      ctx.fillStyle = "#FFF8F4";
      ctx.fillText(`✅ ${item.name}`, 60, y);
      ctx.fillStyle = "rgba(255,248,244,0.5)";
      ctx.font = "18px 'DM Sans', sans-serif";
      ctx.fillText(`₦${item.price.toLocaleString()}`, 750, y);
      ctx.font = "20px 'DM Sans', sans-serif";
    });
    if (items.length > 10) {
      ctx.fillStyle = "rgba(255,248,244,0.5)";
      ctx.fillText(`+ ${items.length - 10} more items`, 60, itemStartY + 10 * 38);
    }

    // Bottom branded section with coral accent bar
    const footerY = 1100;

    // Coral accent bar
    ctx.fillStyle = "#F4845F";
    ctx.fillRect(60, footerY, 960, 4);

    // Painpoint / value proposition
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 24px 'DM Sans', sans-serif";
    wrapText(ctx, BRAND_TAGLINE, 60, footerY + 45, 960, 30);

    // CTA
    ctx.fillStyle = "rgba(255,248,244,0.6)";
    ctx.font = "18px 'DM Sans', sans-serif";
    ctx.fillText(BRAND_INVITE, 60, footerY + 110);
    ctx.fillStyle = "#F4845F";
    ctx.font = "bold 22px 'DM Sans', sans-serif";
    ctx.fillText(SITE_URL, 60, footerY + 140);

    // Social proof
    ctx.fillStyle = "rgba(255,248,244,0.4)";
    ctx.font = "16px 'DM Sans', sans-serif";
    ctx.fillText("⭐ 4.9/5 · 200+ mums served · Free quiz · No login needed", 60, footerY + 185);

    setImageUrl(canvas.toDataURL("image/png"));
  };

  const fullShareText = `${shareText}\n\n${BRAND_CTA}\n\n${BRAND_INVITE} ${shareUrl}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(fullShareText)}`, "_blank");
  };

  const handleTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + " " + BRAND_CTA)}&url=${encodeURIComponent(shareUrl)}`, "_blank");
  };

  const handleFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank");
  };

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = "BundledMum-List.png";
    a.click();
    toast.success("Image saved!");
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" />
      <div className="relative bg-card rounded-[20px] shadow-2xl max-w-[420px] w-full max-h-[90vh] overflow-y-auto animate-fade-in p-5 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center hover:bg-foreground/20">
          <X className="h-4 w-4" />
        </button>

        <h2 className="pf text-xl font-bold mb-3">Share Your List</h2>

        {/* Preview */}
        {imageUrl && (
          <div className="rounded-xl overflow-hidden mb-4 border border-border">
            <img src={imageUrl} alt="Share card" className="w-full" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />

        {/* Share buttons */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={handleWhatsApp} className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] text-primary-foreground py-2.5 text-sm font-semibold interactive">
            📱 WhatsApp
          </button>
          <button onClick={handleDownload} className="flex items-center justify-center gap-2 rounded-xl bg-forest text-primary-foreground py-2.5 text-sm font-semibold interactive">
            <Download className="h-4 w-4" /> Save Image
          </button>
          <button onClick={handleTwitter} className="flex items-center justify-center gap-2 rounded-xl bg-foreground text-primary-foreground py-2.5 text-sm font-semibold interactive">
            🐦 Twitter/X
          </button>
          <button onClick={handleFacebook} className="flex items-center justify-center gap-2 rounded-xl bg-[#1877F2] text-primary-foreground py-2.5 text-sm font-semibold interactive">
            📘 Facebook
          </button>
        </div>

        {/* Copy link */}
        <div className="bg-warm-cream rounded-xl p-3">
          <p className="text-text-light text-[11px] mb-1.5">Your unique link:</p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold truncate flex-1">{shareUrl}</p>
            <button onClick={handleCopyLink} className="flex-shrink-0 rounded-pill bg-forest px-3 py-1.5 text-[11px] font-semibold text-primary-foreground interactive flex items-center gap-1">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Helper to wrap long text on canvas */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const testLine = line + (line ? " " : "") + word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
}
