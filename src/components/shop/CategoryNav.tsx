import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { ProductCategory } from "@/hooks/useProductCategories";

// Shared category navigation for the Shop landings, category, and subcategory
// pages. Desktop shows a horizontal side-scrolling row of circular emoji
// icons; mobile collapses to a dropdown so it stays compact. An optional
// leading "All" item links back to the section landing.
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

  const activeCat = activeSlug ? categories.find((c) => c.slug === activeSlug) : undefined;
  const currentLabel = activeCat?.name || all?.label || "Categories";
  const currentIcon = activeCat?.icon || all?.icon || "🗂️";

  const circle = (active: boolean) =>
    `w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-colors ${
      active ? "bg-forest-light ring-2 ring-forest" : "bg-warm-cream group-hover:bg-forest-light"
    }`;
  const circleLabel = (active: boolean) =>
    `text-[11px] font-medium text-center leading-tight line-clamp-2 ${
      active ? "text-forest font-semibold" : "text-foreground"
    }`;
  const row = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${
      active ? "bg-forest-light text-forest font-semibold" : "text-foreground hover:bg-muted/60"
    }`;

  return (
    <>
      {/* Mobile: dropdown */}
      <details className="md:hidden group relative">
        <summary className="list-none flex items-center justify-between gap-2 rounded-pill border-[1.5px] border-border bg-card px-4 py-2.5 min-h-[44px] text-sm font-semibold cursor-pointer">
          <span className="inline-flex items-center gap-2 truncate">
            <span className="text-base leading-none">{currentIcon}</span>
            <span className="truncate">{currentLabel}</span>
          </span>
          <ChevronDown className="w-4 h-4 flex-shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute left-0 right-0 mt-2 z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-[0_10px_40px_-12px_rgba(32,37,26,0.35)] p-2">
          {all && (
            <Link to={all.href} className={row(!activeSlug)}>
              <span className="text-lg leading-none">{all.icon || "🛍️"}</span>
              {all.label}
            </Link>
          )}
          {categories.map((c) => (
            <Link key={c.id} to={linkFor(c)} className={row(activeSlug === c.slug)}>
              <span className="text-lg leading-none">{c.icon || "🛍️"}</span>
              {c.name}
            </Link>
          ))}
        </div>
      </details>

      {/* Desktop: horizontal side-scroll strip */}
      <div className="hidden md:block overflow-x-auto scrollbar-none">
        <div className="flex gap-4 min-w-max py-0.5">
          {all && (
            <Link to={all.href} className="flex flex-col items-center gap-1.5 group flex-shrink-0 w-[76px]">
              <span className={circle(!activeSlug)}>{all.icon || "🛍️"}</span>
              <span className={circleLabel(!activeSlug)}>{all.label}</span>
            </Link>
          )}
          {categories.map((c) => (
            <Link key={c.id} to={linkFor(c)} className="flex flex-col items-center gap-1.5 group flex-shrink-0 w-[76px]">
              <span className={circle(activeSlug === c.slug)}>{c.icon || "🛍️"}</span>
              <span className={circleLabel(activeSlug === c.slug)}>{c.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
