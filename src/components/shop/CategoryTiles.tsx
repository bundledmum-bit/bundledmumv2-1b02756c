import { Link } from "react-router-dom";
import type { ProductCategory } from "@/hooks/useProductCategories";

// Premium category browse tiles. Warm cream surface, big emoji, tight label,
// gentle hover lift. Used on the Shop landing and the Baby/Mum section pages to
// let shoppers jump straight into a subcategory. hrefBase is "/shop/baby" or
// "/shop/mum"; each tile routes to `${hrefBase}/${slug}`.
export default function CategoryTiles({
  categories,
  hrefBase,
  columns = "grid-cols-3 md:grid-cols-6",
}: {
  categories: ProductCategory[];
  hrefBase: string;
  columns?: string;
}) {
  if (!categories.length) return null;
  return (
    <div className={`grid ${columns} gap-2.5 md:gap-3`}>
      {categories.map((c) => (
        <Link
          key={c.id}
          to={`${hrefBase}/${c.slug}`}
          className="group flex flex-col items-center gap-2 rounded-[14px] border border-border bg-card p-3 md:p-4 card-hover text-center"
        >
          <span className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-warm-cream flex items-center justify-center text-2xl md:text-[28px] group-hover:bg-forest-light transition-colors">
            {c.icon || "🛍️"}
          </span>
          <span className="text-[11px] md:text-[12px] font-semibold text-foreground leading-tight line-clamp-2">
            {c.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
