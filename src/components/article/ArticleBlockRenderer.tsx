import { Link } from "react-router-dom";
import { Info, Lightbulb, ArrowRight } from "lucide-react";

// Renders an article's JSONB body — an array of typed blocks. Each
// block type gets its own visual treatment in BundledMum's tokens.
//
// Stage 1: `product` blocks render as PLACEHOLDER cards (link + name +
// why). Stage 2 replaces them with a full product card + brand-picker
// add-to-cart modal.

interface Block {
  type: string;
  [key: string]: any;
}

export default function ArticleBlockRenderer({ body }: { body: unknown }) {
  if (!Array.isArray(body) || body.length === 0) return null;
  return (
    <div className="space-y-6 md:space-y-8">
      {(body as Block[]).map((block, i) => (
        <ArticleBlock key={i} block={block} />
      ))}
    </div>
  );
}

function ArticleBlock({ block }: { block: Block }) {
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
          <h2 id={block.id} className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight scroll-mt-24 break-words">
            {block.title}
          </h2>
          {block.intro && <p className="text-base text-text-med leading-relaxed mt-3">{block.intro}</p>}
        </div>
      );

    case "product":
      return (
        // TODO Stage 2: replace with full product card + brand picker modal
        <div className="rounded-xl border border-coral/40 bg-coral/[0.04] p-4 md:p-5">
          <Link
            to={`/products/${block.product_slug}`}
            className="group inline-flex items-center gap-1.5 text-base font-semibold text-foreground hover:text-coral transition-colors break-words"
          >
            {block.display_name}
            <ArrowRight className="w-4 h-4 text-coral flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
          {block.why_needed && <p className="text-sm text-text-med leading-relaxed mt-1.5">{block.why_needed}</p>}
          <Link
            to={`/products/${block.product_slug}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:underline mt-3"
          >
            View product <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      );

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
