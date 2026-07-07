import { Link } from "react-router-dom";
import type { ProductCategory } from "@/hooks/useProductCategories";

// Shared category navigation used on every page that browses categories
// (Shop landings, category, subcategory). Circular emoji icons with labels in a
// wrapping grid, so all links are visible without horizontal scrolling on any
// screen. An optional leading "All" item links back to the section landing.
export default function CategoryNav({
  categories,
  linkFor,
  activeSlug,
  all,
}: {
  categories: ProductCategory[];
  linkFor: (c: ProductCategory) => string;
  activeSlug?: string;
  all?: { label: string; href: string; icon?: string };
}) {
  if (!categories.length) return null;

  const circle = (active: boolean) =>
    `w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-2xl md:text-[26px] transition-colors ${
      active ? "bg-forest-light ring-2 ring-forest" : "bg-warm-cream group-hover:bg-forest-light"
    }`;
  const label = (active: boolean) =>
    `text-[10px] md:text-[11px] font-medium text-center leading-tight line-clamp-2 ${
      active ? "text-forest font-semibold" : "text-foreground"
    }`;

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-y-3 gap-x-1">
      {all && (
        <Link to={all.href} className="flex flex-col items-center gap-1.5 group">
          <span className={circle(!activeSlug)}>{all.icon || "🛍️"}</span>
          <span className={label(!activeSlug)}>{all.label}</span>
        </Link>
      )}
      {categories.map((c) => (
        <Link key={c.id} to={linkFor(c)} className="flex flex-col items-center gap-1.5 group">
          <span className={circle(activeSlug === c.slug)}>{c.icon || "🛍️"}</span>
          <span className={label(activeSlug === c.slug)}>{c.name}</span>
        </Link>
      ))}
    </div>
  );
}
