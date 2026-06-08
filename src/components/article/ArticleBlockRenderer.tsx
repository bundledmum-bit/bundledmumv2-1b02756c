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
  // Group consecutive promo_card blocks so a run of them renders as a
  // single responsive grid (2-up on desktop, full-width when alone).
  const grouped = (body as Block[]).reduce<Block[]>((acc, block) => {
    if (block.type === "promo_card") {
      const prev = acc[acc.length - 1];
      if (prev?.type === "promo_card_group") { prev.cards.push(block); return acc; }
      return [...acc, { type: "promo_card_group", cards: [block] }];
    }
    return [...acc, block];
  }, []);
  return (
    <div className="space-y-6 md:space-y-8">
      {grouped.map((item, i) =>
        item.type === "promo_card_group" ? (
          <div key={i} className={`grid grid-cols-1 gap-4 my-8 ${item.cards.length > 1 ? "md:grid-cols-2" : ""}`}>
            {(item.cards as Block[]).map((card, j) => <PromoCard key={j} card={card} />)}
          </div>
        ) : (
          <ArticleBlock key={i} block={item} productsData={productsData} productsLoading={productsLoading} onCartBump={onCartBump} />
        )
      )}
    </div>
  );
}

function PromoCard({ card }: { card: Block }) {
  const isExternal = /^https?:\/\//.test(card.url || "");
  const content = (
    <div className="h-full rounded-2xl p-6 flex flex-col items-start gap-3 border-2 border-[#2D6A4F]/20 bg-gradient-to-br from-[#2D6A4F]/[0.08] to-[#F4845F]/[0.08] shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer group">
      <span className="text-5xl leading-none">{card.emoji}</span>
      <div className="flex flex-col gap-1 min-w-0">
        <h3 className="text-lg font-bold text-foreground leading-tight break-words">{card.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-[#2D6A4F] group-hover:gap-2.5 transition-all duration-200">
        {card.cta_text}
        <span aria-hidden>→</span>
      </span>
    </div>
  );
  return isExternal ? (
    <a href={card.url} target="_blank" rel="noopener noreferrer" className="no-underline block h-full">{content}</a>
  ) : (
    <Link to={card.url || "#"} className="no-underline block h-full">{content}</Link>
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

    case "outro":
      return <p className="text-base text-text-light leading-relaxed italic">{block.text}</p>;

    default:
      return null;
  }
}
