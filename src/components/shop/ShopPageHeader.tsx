import { Search } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";

export type ShopAccent = "all" | "baby" | "mum";

type Crumb = { label: string; href?: string };

// Editorial page header shared by every shop listing surface. Calm cream
// surface with a Playfair title, a section-tinted accent chip, a muted
// subtitle, and an optional pill search. Deliberately not a dark hero, so the
// storefront reads premium and consistent rather than loud marketplace.
export default function ShopPageHeader({
  accent = "all",
  eyebrow,
  title,
  icon,
  subtitle,
  count,
  breadcrumbs,
  search,
}: {
  accent?: ShopAccent;
  eyebrow?: string;
  title: string;
  icon?: string | null;
  subtitle?: string;
  count?: number;
  breadcrumbs?: Crumb[];
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
}) {
  // Section tint: a whisper of colour on the surface, plus an accent-coloured
  // icon chip. Coral stays reserved for CTAs, so mum uses a warmer forest tone
  // rather than flooding coral here.
  const surface =
    accent === "baby"
      ? "bg-forest-light"
      : accent === "mum"
      ? "bg-coral-blush"
      : "bg-background";
  const chip =
    accent === "baby"
      ? "bg-forest text-primary-foreground"
      : accent === "mum"
      ? "bg-coral text-primary-foreground"
      : "bg-warm-cream text-forest";

  return (
    <div className={`pt-[68px] border-b border-border ${surface}`}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-6 md:py-9">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumb items={breadcrumbs} className="mb-4" />
        )}
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3 mb-2">
          {icon && (
            <span
              className={`flex-shrink-0 w-10 h-10 md:w-11 md:h-11 rounded-full ${chip} flex items-center justify-center text-xl md:text-2xl`}
            >
              {icon}
            </span>
          )}
          <h1 className="pf text-[26px] md:text-[38px] font-bold leading-[1.1] text-foreground">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="text-muted-foreground text-sm md:text-[15px] max-w-[560px]">
            {subtitle}
          </p>
        )}
        {typeof count === "number" && (
          <p className="text-muted-foreground text-[13px] mt-1">
            {count} product{count === 1 ? "" : "s"}
          </p>
        )}
        {search && (
          <div className="relative max-w-[520px] mt-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
            <input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder || "Search products..."}
              className="w-full rounded-pill bg-card border border-border text-foreground text-sm pl-11 pr-4 py-3 outline-none placeholder:text-text-light focus:border-forest transition-colors min-h-[48px] shadow-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
