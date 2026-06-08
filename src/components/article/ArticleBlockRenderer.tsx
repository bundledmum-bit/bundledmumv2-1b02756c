import { Link } from "react-router-dom";
import { Info, Lightbulb, ArrowRight } from "lucide-react";
import ArticleProductCard, { type ProductWithBrands } from "@/components/article/ArticleProductCard";

// Renders an article's JSONB body — an array of typed blocks. Each
// block type gets its own visual treatment in BundledMum's tokens.
//
// Stage 2: `product` blocks render as interactive ArticleProductCards
// (image + price + add-to-cart). The parent bulk-fetches the products
// and passes them in via `productsData` (slug -> product+brands).

interface Block {
  type: string;
  [key: string]: any;
}

interface RendererProps {
  body: unknown;
  /** slug -> product+brands, bulk-fetched by the detail page. */
  productsData?: Map<string, ProductWithBrands>;
  /** undefined while the product fetch is still loading. */
  productsLoading?: boolean;
  /** fired after a successful add-to-cart so the parent can bump the cart icon. */
  onCartBump?: () => void;
}

export default function ArticleBlockRenderer({ body, productsData, productsLoading, onCartBump }: RendererProps) {
  if (!Array.isArray(body) || body.length === 0) return null;
  return (
    <div className="space-y-6 md:space-y-8">
      {(body as Block[]).map((block, i) => (
        <ArticleBlock key={i} block={block} productsData={productsData} productsLoading={productsLoading} onCartBump={onCartBump} />
      ))}
    </div>
  );
}

function PromoCard({ card }: { card: Block }) {
  const isExternal = /^https?:\/\//.test(card.url || "");
  const inner = (
    <div className="rounded-2xl p-6 flex flex-col gap-4 border-2 border-[#2D6A4F]/20 bg-gradient-to-br from-[#2D6A4F]/10 to-[#F4845F]/10 shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer group w-full">
      <div className="flex items-start gap-4">
        <span className="text-5xl leading-none shrink-0">{card.emoji}</span>
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground leading-tight break-words">{card.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2D6A4F] group-hover:gap-2.5 transition-all duration-200">
          {card.cta_text}
          <span aria-hidden>→</span>
        </span>
      </div>
    </div>
  );
  return isExternal ? (
    <a href={card.url} target="_blank" rel="noopener noreferrer" className="block no-underline my-8">{inner}</a>
  ) : (
    <Link to={card.url || "#"} className="block no-underline my-8">{inner}</Link>
  );
}

function ArticleBlock({ block, productsData, productsLoading, onCartBump }: { block: Block } & Omit<RendererProps, "body">) {
  switch (block.type) {
    case "intro":
      return <p className="text-lg md:text-xl text-text-med leading-relaxed">{block.text}</p>;

    case "paragraph":
      return <p className="text-base text-foreground leading-[1.75]">{block.text}</p>;

    case "callout": {
      const isTip = block.variant === "tip";
      return (
        <div className={`rounded-xl border-l-4 p-4 md:p-5 ${isTip ? "bg-forest-light/60 border-forest" : "bg-warm-cream border-coral"}`}>
          <div className="flex gap-3">
            {isTip
              ? <Lightbulb className="w-5 h-5 text-forest flex-shrink-0 mt-0.5" />
              : <Info className="w-5 h-5 text-coral flex-shrink-0 mt-0.5" />}
            <p className="text-sm md:text-base text-foreground leading-relaxed min-w-0">{block.text}</p>
          </div>
        </div>
      );
    }

    case "section":
      return (
        <div className="pt-2">
          {typeof block.banner_url === "string" && block.banner_url && (
            <img
              src={block.banner_url}
              alt={typeof block.banner_alt === "string" ? block.banner_alt : (block.title || "")}
              loading="lazy"
              className="w-full aspect-[3/1] object-cover rounded-2xl mb-6"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <h2 id={block.id} className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight scroll-mt-24 break-words">
            {block.title}
          </h2>
          {block.intro && <p className="text-base text-text-med leading-relaxed mt-3">{block.intro}</p>}
        </div>
      );

    case "product": {
      const product = productsData?.get(block.product_slug);
      // Orphaned reference (product not found / inactive): minimal link.
      if (productsData && !productsLoading && !product) {
        return (
          <div className="rounded-xl border border-border bg-muted/30 p-4 md:p-5">
            <Link
              to={`/products/${block.product_slug}`}
              className="group inline-flex items-center gap-1.5 text-base font-semibold text-foreground hover:text-coral transition-colors break-words"
            >
              {block.display_name}
              <ArrowRight className="w-4 h-4 text-coral flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
            {block.why_needed && <p className="text-sm text-text-med leading-relaxed mt-1.5">{block.why_needed}</p>}
          </div>
        );
      }
      return (
        <ArticleProductCard
          productSlug={block.product_slug}
          displayName={block.display_name}
          whyNeeded={block.why_needed}
          productData={productsLoading ? undefined : product}
          onAdded={onCartBump}
        />
      );
    }

    case "text_item":
      return (
        <div className="rounded-xl border border-border bg-muted/30 p-4 md:p-5">
          <p className="text-base font-semibold text-foreground break-words">{block.name}</p>
          {block.why_needed && <p className="text-sm text-text-med leading-relaxed mt-1.5">{block.why_needed}</p>}
          {block.note && <p className="text-xs text-text-light italic mt-2">{block.note}</p>}
        </div>
      );

    case "link_cta": {
      const isWhatsApp = (block.url || "").includes("wa.me") || (block.url || "").includes("whatsapp");
      if (isWhatsApp) {
        // wa.me URLs are external — always open in a new tab.
        return (
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 justify-center w-full rounded-xl px-6 py-3.5 mt-2 bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold text-base transition-colors duration-200 shadow-sm hover:shadow-md no-underline"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.121 1.535 5.856L.057 23.882a.75.75 0 0 0 .921.921l6.056-1.479A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.715 9.715 0 0 1-4.953-1.356l-.355-.211-3.673.896.913-3.584-.231-.368A9.715 9.715 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z" />
            </svg>
            {block.text}
          </a>
        );
      }
      const cls = "inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 py-3.5 text-sm font-semibold hover:bg-coral-dark transition-colors min-h-[48px]";
      const isExternal = /^https?:\/\//.test(block.url || "");
      return isExternal ? (
        <a href={block.url} target="_blank" rel="noopener noreferrer" className={cls}>
          {block.text} <ArrowRight className="w-4 h-4" />
        </a>
      ) : (
        <Link to={block.url || "#"} className={cls}>
          {block.text} <ArrowRight className="w-4 h-4" />
        </Link>
      );
    }

    case "promo_card":
      return <PromoCard card={block} />;

    case "outro":
      return <p className="text-base text-text-light leading-relaxed italic">{block.text}</p>;

    default:
      return null;
  }
}
