import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ShoppingBag, Download, AlertCircle } from "lucide-react";
import Seo from "@/components/Seo";
import ProductImage from "@/components/ProductImage";
import { useCart, fmt } from "@/lib/cart";
import { OG_FALLBACK_IMAGE } from "@/lib/seo";
import { useQuizResultShare, shareUrlFor, type SharedListItem } from "@/hooks/useQuizResultShare";
import { shareQuizListPdf } from "@/lib/quizListPdf";

/**
 * /list/:token — someone else's list.
 *
 * The reader is NOT the mum: she sent this to them. So the page leads with
 * buying it for her, never "your list", and starting their own quiz is a
 * secondary route rather than the headline.
 *
 * Prices here are live (re-read on every open), which is exactly what the
 * attached PDF cannot be — hence the date on the PDF and not on this page.
 */
export default function SharedListPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading } = useQuizResultShare(token);
  const { addToCart } = useCart();

  const ownerName = data?.owner_label?.trim() || null;
  const listTitle = ownerName ? `${ownerName}'s list` : "A BundledMum list";

  const buyable = useMemo(
    () => (data?.items || []).filter((i) => i.available && i.brand?.price != null),
    [data],
  );
  const unavailable = useMemo(
    () => (data?.items || []).filter((i) => !i.available || i.brand?.price == null),
    [data],
  );

  const addAll = () => {
    let added = 0;
    buyable.forEach((it) => {
      const qty = Math.max(1, it.quantity || 1);
      for (let i = 0; i < qty; i++) {
        const ok = addToCart({
          id: it.product_id,
          name: `${it.name}${it.brand?.brand_name ? ` (${it.brand.brand_name})` : ""}`,
          price: it.brand?.price ?? 0,
          imageUrl: it.brand?.image_url || undefined,
          baseImg: "📦",
          selectedBrand: {
            id: it.brand!.id,
            label: it.brand?.brand_name || "Standard",
            price: it.brand?.price ?? 0,
            imageUrl: it.brand?.image_url || null,
          },
          selectedSize: it.size || "",
          selectedColor: it.color || undefined,
          category: it.category as any,
        } as any);
        if (ok) added++;
      }
    });
    if (added) toast.success(`Added ${added} item${added === 1 ? "" : "s"} to your cart`);
  };

  const downloadPdf = async () => {
    if (!data || !token) return;
    const how = await shareQuizListPdf({
      items: data.items.map((i) => ({
        name: i.name,
        brand_name: i.brand?.brand_name ?? null,
        size: i.size,
        color: i.color,
        quantity: i.quantity,
        unit_price: i.brand?.price ?? null,
        available: i.available && i.brand?.price != null,
      })),
      listTotal: data.list_total,
      shareUrl: shareUrlFor(token),
      ownerLabel: ownerName,
      pricedAt: data.priced_at,
    });
    if (how === "downloaded") toast.success("List saved. Attach it to your chat.");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-24 px-4">
        <div className="max-w-[640px] mx-auto animate-pulse space-y-3">
          <div className="h-7 w-48 bg-muted rounded" />
          <div className="h-24 bg-muted rounded-card" />
          <div className="h-24 bg-muted rounded-card" />
        </div>
      </div>
    );
  }

  // Not found is a clean dead end, not an error page.
  if (!data || !data.found) {
    return (
      <>
        <Seo title="List not found | BundledMum" description="This shared list is no longer available." image={OG_FALLBACK_IMAGE} />
        <div className="min-h-screen bg-background pt-24 px-4 flex items-start justify-center">
          <div className="max-w-[420px] w-full text-center">
            <p className="pf text-xl font-bold text-foreground mb-1.5">This list isn't available</p>
            <p className="text-text-med text-sm mb-5">
              The link may be old, or the list may have been replaced by a newer one.
            </p>
            <Link
              to="/quiz"
              className="inline-flex items-center justify-center rounded-pill bg-forest text-primary-foreground px-6 min-h-[48px] text-sm font-semibold"
            >
              Build a list
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Owner-aware, but never the budget: that is hidden from recipients on
          the page and must not leak through a meta tag either. Fallback image
          only, never one composed from the products in the list. */}
      <Seo
        title={`${listTitle} | BundledMum`}
        description={
          ownerName
            ? `${ownerName}'s BundledMum list, ${data.item_count} item${data.item_count === 1 ? "" : "s"} priced live today.`
            : `A BundledMum list, ${data.item_count} item${data.item_count === 1 ? "" : "s"} priced live today.`
        }
        image={OG_FALLBACK_IMAGE}
      />
      <div className="min-h-screen bg-background pt-20 md:pt-24 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="max-w-[640px] mx-auto px-4">
          {/* Written for the recipient. Never "your list". */}
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-coral">Shared with you</p>
          <h1 className="pf text-[26px] md:text-[32px] font-bold text-foreground leading-tight mt-1.5">
            {listTitle}
          </h1>
          <p className="text-text-med text-sm mt-1.5">
            {ownerName ? `${ownerName} put this together.` : "Put together with the BundledMum quiz."}{" "}
            {data.item_count} item{data.item_count === 1 ? "" : "s"}, priced live today.
          </p>

          {/* Primary action: buy it FOR her. */}
          <div className="mt-5 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-text-med text-[13px] font-semibold">Total today</span>
              <span className="font-mono-price text-forest font-extrabold text-[24px] leading-none">
                {fmt(data.list_total)}
              </span>
            </div>
            <button
              type="button"
              onClick={addAll}
              disabled={buyable.length === 0}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground min-h-[52px] text-[15px] font-extrabold hover:bg-coral-dark transition-colors disabled:opacity-40"
            >
              <ShoppingBag className="w-4 h-4" />
              {ownerName ? `Buy this for ${ownerName}` : "Buy this list"}
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-pill border-[1.5px] border-border text-text-med min-h-[44px] text-[13px] font-semibold hover:border-forest hover:text-forest transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Save as PDF
            </button>
          </div>

          <div className="mt-6 space-y-2.5">
            {data.items.map((it, i) => (
              <SharedRow key={`${it.product_id}-${i}`} item={it} />
            ))}
          </div>

          {unavailable.length > 0 && (
            <p className="text-[12px] text-text-med mt-4 leading-snug">
              {unavailable.length} item{unavailable.length === 1 ? " is" : "s are"} no longer available and
              {unavailable.length === 1 ? " is" : " are"} not included in the total.
            </p>
          )}

          {/* Secondary, deliberately not the headline. */}
          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-text-med text-[13px] mb-2.5">Expecting too?</p>
            <Link
              to="/quiz"
              className="inline-flex items-center justify-center rounded-pill border-[1.5px] border-forest text-forest px-5 min-h-[44px] text-[13px] font-semibold hover:bg-forest/5 transition-colors"
            >
              Build your own list
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

function SharedRow({ item }: { item: SharedListItem }) {
  const gone = !item.available || item.brand?.price == null;
  const unit = item.brand?.price ?? 0;
  const detail = [item.size ? `Size: ${item.size}` : null, item.color ? `Colour: ${item.color}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`flex gap-3 items-start rounded-2xl border bg-card p-2.5 ${gone ? "border-border opacity-70" : "border-border"}`}>
      <div className="w-[64px] h-[64px] shrink-0 rounded-xl overflow-hidden bg-muted/30">
        <ProductImage imageUrl={item.brand?.image_url || null} emoji="📦" alt={item.name} className="w-full h-full" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-foreground leading-snug">{item.name}</p>
        {item.brand?.brand_name && (
          <p className="text-[11.5px] text-text-med mt-0.5">{item.brand.brand_name}</p>
        )}
        {detail && <p className="text-[11.5px] text-text-med mt-0.5">{detail}</p>}
        {gone ? (
          // Shown, not dropped: the recipient must see the same list she sent.
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-pill bg-muted text-text-med border border-border px-2 py-0.5 text-[10.5px] font-bold">
            <AlertCircle className="w-3 h-3" /> Currently unavailable
          </span>
        ) : (
          <p className="mt-1 font-mono-price text-forest font-bold text-[14px]">
            {item.quantity > 1 ? `${item.quantity} × ${fmt(unit)}` : fmt(unit)}
          </p>
        )}
      </div>
      {!gone && item.quantity > 1 && (
        <span className="shrink-0 font-mono-price text-forest font-bold text-[14px]">
          {fmt(unit * item.quantity)}
        </span>
      )}
    </div>
  );
}
