import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Printer, MessageCircle, ShoppingBag, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useQuoteByShareToken,
  useQuoteItemsByShareToken,
  recordQuoteView,
  recordQuoteDownload,
  PENDING_QUOTE_TOKEN_KEY,
  type QuoteShareItem,
} from "@/hooks/useQuoteShare";
import { useCart, fmt, cartItemKey, type CartItem } from "@/lib/cart";
import { formatQuoteDeliveryFee, QUOTE_DELIVERY_TBD } from "@/lib/quotes";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
// Coral logo — matches the local-import convention used on every other
// public/customer-facing surface (PaymentReceivedPage, AccountLoginPage,
// SubscribeLanding, NotFound, etc.). The hosted PNG referenced in the
// email exists, but importing the bundled SVG avoids a cross-origin
// hop and stays in step with the rest of the codebase.
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

/** Public customer-facing quote viewer at /quote/:shareToken. */
export default function QuotePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const { setCart } = useCart();
  const { data: settings } = useSiteSettings();
  const whatsappNumber = String(settings?.whatsapp_number ?? "").replace(/^"|"$/g, "").replace(/\D/g, "");

  const quoteQ = useQuoteByShareToken(shareToken);
  const itemsQ = useQuoteItemsByShareToken(shareToken);
  const quote = quoteQ.data;
  const items: QuoteShareItem[] = itemsQ.data || [];

  // Record one view per mount even under React 18 StrictMode's double-fire.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (!shareToken || viewedRef.current) return;
    viewedRef.current = true;
    void recordQuoteView(shareToken);
  }, [shareToken]);

  useEffect(() => {
    if (quote?.quote_number) {
      document.title = `Quote ${quote.quote_number} · BundledMum`;
    } else {
      document.title = "Quote · BundledMum";
    }
  }, [quote?.quote_number]);

  const [confirmReplace, setConfirmReplace] = useState(false);
  const [loadingCart, setLoadingCart] = useState(false);

  const deliveryFee = quote
    ? (quote.delivery_fee_override != null ? quote.delivery_fee_override : quote.estimated_delivery_fee)
    : 0;
  const hasDiscount = (quote?.discount_amount ?? 0) > 0;

  const isExpired = !!quote?.is_expired;
  const isLocked = quote?.status === "converted" || quote?.status === "declined";
  const acceptDisabled = isExpired || isLocked;

  const expiresLine = useMemo(() => {
    if (!quote?.expires_at) return null;
    const d = new Date(quote.expires_at);
    return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  }, [quote?.expires_at]);

  const createdLine = useMemo(() => {
    if (!quote?.created_at) return null;
    return new Date(quote.created_at).toLocaleDateString("en-NG", {
      day: "numeric", month: "long", year: "numeric",
    });
  }, [quote?.created_at]);

  const handleAddToCart = () => {
    if (!quote || acceptDisabled) return;
    setConfirmReplace(true);
  };

  const confirmAndCheckout = () => {
    if (!shareToken || !quote) return;
    setLoadingCart(true);
    try {
      const next: CartItem[] = items
        .filter((it) => it.product_id) // skip orphaned ad-hoc lines (no product ref)
        .map((it) => ({
          id: String(it.product_id),
          _key: cartItemKey(String(it.product_id), it.brand_id || undefined, it.size || undefined, it.color || undefined),
          name: it.product_name,
          price: Number(it.unit_price || 0),
          qty: Math.max(1, Number(it.quantity || 1)),
          // Image source priority used by cartItemImage: selectedBrand.imageUrl
          // → product.imageUrl → placeholder. We assign both so the cart row
          // and order summary find a real image either way.
          imageUrl: it.current_image_url || undefined,
          selectedBrand: it.brand_id
            ? {
                id: it.brand_id,
                label: it.brand_name || undefined,
                price: Number(it.unit_price || 0),
                imageUrl: it.current_image_url || undefined,
                inStock: it.current_in_stock !== false,
              }
            : undefined,
          selectedSize: it.size || undefined,
          selectedColor: it.color || undefined,
        }) as CartItem);
      setCart(next);
      sessionStorage.setItem(PENDING_QUOTE_TOKEN_KEY, shareToken);
      setConfirmReplace(false);
      setLoadingCart(false);
      navigate("/checkout");
    } catch (e: any) {
      console.error("[quote] cart replace failed:", e);
      toast.error("Could not load the quoted items into your cart.");
      setLoadingCart(false);
    }
  };

  // ── Loading / not-found ────────────────────────────────────────
  if (quoteQ.isLoading || itemsQ.isLoading) {
    return (
      <div className="min-h-screen bg-background py-10 px-4">
        <div className="max-w-[820px] mx-auto">
          <div className="h-8 w-48 bg-muted rounded animate-pulse mb-3" />
          <div className="h-4 w-72 bg-muted rounded animate-pulse mb-10" />
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <div className="h-5 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-5 w-2/3 bg-muted rounded animate-pulse" />
            <div className="h-5 w-1/3 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-background py-16 px-4 flex items-center justify-center">
        <div className="max-w-[480px] text-center">
          <AlertCircle className="w-12 h-12 text-text-light mx-auto mb-3" />
          <h1 className="pf text-2xl font-bold mb-2">Quote not found</h1>
          <p className="text-text-med text-sm">
            This quote link is invalid or has been removed. If you think this is a mistake, contact us on WhatsApp.
          </p>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 bg-[#25D366] text-white px-5 py-2 rounded-pill text-sm font-bold"
            >
              <MessageCircle className="w-4 h-4" /> Message us on WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4 print:py-2 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          html, body {
            background: #fff !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }
          body, body * { visibility: visible !important; }
          .quote-print-hide { display: none !important; }
          .quote-card {
            box-shadow: none !important;
            border-color: #d4d4d4 !important;
            background: #fff !important;
          }
          /* Forest-green grand total + emerald accents render in colour
             instead of plain black on most printers. */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Hide react-medium-image-zoom overlay / modal markup so a
             half-opened zoom never bleeds into the printed PDF. */
          [data-rmiz-modal-overlay],
          [data-rmiz-modal-content],
          [data-rmiz-portal] {
            display: none !important;
          }
        }
      `}</style>

      {/* Brand bar — bridges the visual handoff from the quote email
          (coral logo on a cream/white surface). Hidden in print so the
          PDF output stays clean. */}
      <header className="bg-white border-b border-border px-4 py-3 md:py-4 mb-6 -mx-4 -mt-8 print:hidden quote-print-hide">
        <a
          href="https://bundledmum.com"
          aria-label="BundledMum"
          className="block max-w-[820px] mx-auto text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-forest rounded"
        >
          <img
            src={bmLogoCoral}
            alt="BundledMum"
            className="inline-block w-[140px] md:w-[180px] h-auto"
          />
        </a>
      </header>

      <div className="max-w-[820px] mx-auto">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <p className="text-text-med text-sm mt-1">Quote prepared for you</p>
          </div>
          <div className="text-right text-xs text-text-med">
            <p className="font-mono font-semibold text-foreground">{quote.quote_number}</p>
            {createdLine && <p className="mt-0.5">Prepared on {createdLine}</p>}
            {expiresLine && <p className={isExpired ? "text-destructive font-semibold" : ""}>
              Valid until {expiresLine}
            </p>}
          </div>
        </div>

        {/* Status banner */}
        {isExpired && (
          <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 mb-4 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-700 mt-0.5 flex-shrink-0" />
              <p className="text-red-900 text-sm">
                This quote expired on <strong>{expiresLine}</strong>. Contact us for a new one.
              </p>
            </div>
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="quote-print-hide inline-flex items-center gap-1.5 bg-[#25D366] text-white text-xs font-bold px-3 py-1.5 rounded-pill"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp us
              </a>
            )}
          </div>
        )}
        {quote.status === "converted" && (
          <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 mb-4">
            <p className="text-green-900 text-sm">
              You've already accepted this quote and placed your order. Thanks!
            </p>
          </div>
        )}
        {quote.status === "declined" && (
          <div className="bg-muted border border-border rounded-xl px-4 py-3 mb-4">
            <p className="text-text-med text-sm">This quote was declined.</p>
          </div>
        )}

        {/* Greeting + delivery summary + customer note */}
        {(quote.customer_name || quote.customer_notes || quote.delivery_city || quote.delivery_state) && (
          <div className="bg-card quote-card border border-border rounded-xl p-5 mb-4">
            {quote.customer_name && (
              <p className="text-sm">
                <span className="text-text-med">Prepared for:</span>{" "}
                <span className="font-semibold">{quote.customer_name}</span>
              </p>
            )}
            {(quote.delivery_city || quote.delivery_state) && (
              <p className="text-sm mt-1">
                <span className="text-text-med">Deliver to:</span>{" "}
                <span className="font-semibold">
                  {[quote.delivery_city, quote.delivery_state].filter(Boolean).join(", ")}
                </span>
              </p>
            )}
            {quote.customer_notes && (
              <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-widest font-semibold text-yellow-900 mb-1">A note from us</p>
                <p className="text-sm text-yellow-900 whitespace-pre-wrap leading-relaxed">{quote.customer_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Items */}
        <div className="bg-card quote-card border border-border rounded-xl overflow-hidden mb-4">
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-sm font-bold uppercase tracking-widest text-text-med">Items</h2>
          </div>
          {items.length === 0 ? (
            <p className="px-5 py-6 text-text-med text-sm text-center">No items on this quote.</p>
          ) : (() => {
            const renderRow = (it: typeof items[number]) => (
              <div key={it.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 border border-border">
                  {it.current_image_url ? (
                    // Wrap in react-medium-image-zoom so customers can tap
                    // the thumbnail to inspect what they're getting at
                    // full size. Defaults: dark backdrop, Escape closes,
                    // tap outside closes, native pinch-to-zoom on mobile.
                    <Zoom zoomMargin={32} wrapElement="div">
                      <img
                        src={it.current_image_url}
                        alt={it.product_name}
                        className="w-full h-full object-cover cursor-zoom-in"
                      />
                    </Zoom>
                  ) : (
                    <div className="w-full h-full grid place-items-center text-text-light">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{it.product_name}</p>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-text-med">
                    {it.brand_name && <span>Brand: {it.brand_name}</span>}
                    {it.size && <span>Size: {it.size}</span>}
                    {it.color && <span>Colour: {it.color}</span>}
                  </div>
                  {it.current_in_stock === false && (
                    <p className="mt-1 text-[11px] font-semibold text-red-700">
                      Out of stock — contact us to substitute
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-text-med">{it.quantity} × {fmt(it.unit_price)}</p>
                  <p className="text-sm font-bold">{fmt(it.line_total)}</p>
                </div>
              </div>
            );
            // No section on any item → flat list exactly as before.
            if (!items.some((it) => !!it.section)) {
              return <div className="divide-y divide-border">{items.map(renderRow)}</div>;
            }
            // Otherwise group: Baby / Mother / Hospital (fixed order), Other last.
            const byOrder = (a: typeof items[number], b: typeof items[number]) => (a.display_order || 0) - (b.display_order || 0);
            const SECTIONS = [
              { key: "baby", label: "Baby Items" },
              { key: "mother", label: "Mother Items" },
              { key: "hospital", label: "Hospital Items" },
            ];
            const groups = [
              ...SECTIONS.map((s) => ({ label: s.label, rows: items.filter((it) => it.section === s.key).sort(byOrder) })),
              { label: "Other Items", rows: items.filter((it) => !it.section).sort(byOrder) },
            ].filter((g) => g.rows.length > 0);
            return (
              <div>
                {groups.map((g) => (
                  <div key={g.label}>
                    {/* Highlighted band — matches the customer email: solid
                        brand-green fill, darker top accent, white bold caps. */}
                    <div className="bg-forest border-t-4 border-forest-deep px-5 py-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-primary-foreground">{g.label}</h3>
                    </div>
                    <div className="divide-y divide-border">{g.rows.map(renderRow)}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Totals */}
        <div className="bg-card quote-card border border-border rounded-xl p-5 mb-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-med mb-3">Totals</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-med">Subtotal</span>
              <span>{fmt(quote.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-med">Service fee</span>
              <span>{quote.service_fee === 0 ? "FREE" : fmt(quote.service_fee)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-text-med flex-shrink-0">Delivery</span>
              {(() => {
                const d = formatQuoteDeliveryFee(quote, fmt);
                return (
                  <span className={d === QUOTE_DELIVERY_TBD ? "text-xs text-text-med text-right" : "text-right"}>{d}</span>
                );
              })()}
            </div>
            {/* Gift wrapping — shown only when the admin set it on the
                quote. No admin indicators (Auto / Manually set) leak
                through here; the customer just sees the fee line. */}
            {quote.gift_wrapping && (
              <div className="flex justify-between">
                <span className="text-text-med">Gift wrapping</span>
                <span>{fmt(quote.gift_wrap_fee)}</span>
              </div>
            )}
            {hasDiscount && (
              <div className="flex justify-between text-forest">
                <span>
                  Discount
                  {quote.discount_reason && (
                    <span className="block text-[11px] text-text-med">{quote.discount_reason}</span>
                  )}
                </span>
                <span>- {fmt(quote.discount_amount)}</span>
              </div>
            )}
            <div className="border-t border-border pt-3 mt-2 flex justify-between items-baseline">
              <span className="text-sm font-semibold">Total</span>
              <span className="pf text-2xl font-bold text-forest">{fmt(quote.total)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="quote-print-hide flex flex-col sm:flex-row gap-3 mb-6">
          <button
            onClick={handleAddToCart}
            disabled={acceptDisabled || loadingCart || items.length === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-coral text-primary-foreground px-6 py-3 rounded-pill text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShoppingBag className="w-4 h-4" />
            {isExpired ? "Quote expired" : isLocked ? "Quote already used" : "Add to Cart & Checkout"}
          </button>
          <button
            onClick={() => { if (shareToken) void recordQuoteDownload(shareToken); window.print(); }}
            className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-pill text-sm font-semibold hover:bg-muted"
          >
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
        </div>

        {/* WhatsApp contact strip */}
        {whatsappNumber && (
          <div className="quote-print-hide text-center text-xs text-text-med">
            Questions? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="text-forest font-semibold hover:underline">Chat with us on WhatsApp</a>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirmReplace && (
        <div
          className="quote-print-hide fixed inset-0 bg-foreground/60 z-[150] flex items-center justify-center p-4 max-md:items-end max-md:p-0"
          onClick={() => !loadingCart && setConfirmReplace(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-[420px] p-5 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base mb-1">Replace your cart?</h3>
            <p className="text-xs text-text-med leading-relaxed">
              This will clear anything currently in your cart and replace it with the quoted items. You'll still be able to edit quantities at checkout.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setConfirmReplace(false)}
                disabled={loadingCart}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={confirmAndCheckout}
                disabled={loadingCart}
                className="flex-1 px-4 py-2 bg-coral text-primary-foreground rounded-lg text-xs font-bold hover:bg-coral-dark disabled:opacity-40"
              >
                {loadingCart ? "Loading…" : "Yes, Replace Cart"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

