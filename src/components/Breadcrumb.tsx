import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Shared breadcrumb trail used across every storefront page.
 *
 * Pass an array of items AFTER "Home" -- the Home link is always prepended
 * automatically. The last item is treated as the current page (no link,
 * bold foreground text). Middle items link to their href if provided.
 *
 * Also emits a <script type="application/ld+json"> BreadcrumbList for
 * Google rich results -- no extra work needed at the call site.
 *
 * onDark: set true when rendering on a dark/coloured header so link
 * colours switch to white-alpha variants instead of the default dark-on-cream.
 *
 * Example:
 *   <Breadcrumb items={[
 *     { label: "Baby Shop", href: "/shop/baby" },
 *     { label: "Diapers & Nappies", href: "/shop/baby?category=diapers-nappies" },
 *     { label: "WaterWipes Sensitive" },
 *   ]} />
 */
export default function Breadcrumb({
  items,
  className = "",
  onDark = false,
}: {
  items: BreadcrumbItem[];
  className?: string;
  onDark?: boolean;
}) {
  if (!items.length) return null;

  const allItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }, ...items];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: allItems.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `https://bundledmum.ng${item.href}` } : {}),
    })),
  };

  const linkCls = onDark
    ? "text-white/60 hover:text-white/90 transition-colors truncate max-w-[140px] md:max-w-[200px]"
    : "text-muted-foreground hover:text-forest transition-colors truncate max-w-[140px] md:max-w-[200px]";
  const spanCls = onDark
    ? "text-white/50 truncate max-w-[140px] md:max-w-[200px]"
    : "text-muted-foreground truncate max-w-[140px] md:max-w-[200px]";
  const currentCls = onDark
    ? "text-white/90 font-semibold truncate max-w-[180px] md:max-w-[280px]"
    : "text-foreground font-semibold truncate max-w-[180px] md:max-w-[280px]";
  const chevronCls = onDark
    ? "w-3 h-3 shrink-0 text-white/30 mx-0.5"
    : "w-3 h-3 shrink-0 text-text-light mx-0.5";
  const homeCls = onDark
    ? "w-3 h-3 shrink-0 text-white/50 mr-0.5"
    : "w-3 h-3 shrink-0 text-muted-foreground mr-0.5";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav
        aria-label="Breadcrumb"
        className={`flex items-center flex-wrap gap-y-0.5 text-[11px] md:text-[12px] ${className}`}
      >
        {allItems.map((item, i) => {
          const isFirst = i === 0;
          const isLast = i === allItems.length - 1;
          return (
            <span key={i} className="inline-flex items-center gap-1 min-w-0">
              {!isFirst && (
                <ChevronRight className={chevronCls} />
              )}
              {isFirst && (
                <Home className={homeCls} />
              )}
              {isLast ? (
                <span className={currentCls} aria-current="page">
                  {item.label}
                </span>
              ) : item.href ? (
                <Link to={item.href} className={linkCls}>
                  {item.label}
                </Link>
              ) : (
                <span className={spanCls}>
                  {item.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </>
  );
}
