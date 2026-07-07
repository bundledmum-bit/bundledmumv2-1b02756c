import { Link } from "react-router-dom";
import type { ProductCategory } from "@/hooks/useProductCategories";

// Horizontal sibling-navigation chips for category and subcategory pages.
// Lets a shopper hop between subcategories in the same section without going
// back up. hrefBase is "/shop/baby" or "/shop/mum"; the first chip ("All")
// links to the section landing, each other chip to `${hrefBase}/${slug}`.
export default function SubcategoryChips({
  categories,
  hrefBase,
  activeSlug,
  allLabel = "All",
}: {
  categories: ProductCategory[];
  hrefBase: string;
  activeSlug?: string;
  allLabel?: string;
}) {
  if (!categories.length) return null;
  return (
    <div className="overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
      <div className="flex gap-2 min-w-max">
        <Link
          to={hrefBase}
          className={`inline-flex items-center rounded-pill px-4 py-2 text-[13px] font-semibold border transition-colors min-h-[40px] whitespace-nowrap ${
            !activeSlug
              ? "bg-forest border-forest text-primary-foreground"
              : "bg-card border-border text-muted-foreground hover:border-forest/50 hover:text-forest"
          }`}
        >
          {allLabel}
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            to={`${hrefBase}/${c.slug}`}
            className={`inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-medium border transition-colors min-h-[40px] whitespace-nowrap ${
              activeSlug === c.slug
                ? "bg-forest border-forest text-primary-foreground"
                : "bg-card border-border text-muted-foreground hover:border-forest/50 hover:text-forest"
            }`}
          >
            {c.icon && <span className="text-sm">{c.icon}</span>}
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
