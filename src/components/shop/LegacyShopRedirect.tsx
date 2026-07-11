import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { useProductCategories } from "@/hooks/useProductCategories";

/**
 * Runtime legacy-URL redirect gate for the shop.
 *
 * When site_settings.storefront_legacy_redirects_enabled is on, old category
 * URLs are forwarded to the new /shop/{parent}/{slug} structure:
 *   - /shop/:slug                              -> /shop/{parent}/{slug}
 *   - /shop?category=<slug> (+ optional ?tab=) -> /shop/{parent}/{slug}
 *   - /shop/{baby|mum}?category=<slug>         -> /shop/{parent}/{slug}
 *
 * parent comes from ?tab= when present (for the query form), otherwise from
 * product_categories.parent_category ('mum' -> mum; 'baby'/'both'/null -> baby).
 *
 * The switch is read from site_settings at runtime, so flipping the DB value
 * takes effect on next page load with no rebuild. When off, or when the slug
 * has no matching category, we render the wrapped page unchanged (never a 404,
 * never a redirect loop -- the target /shop/{parent}/{slug} is a distinct
 * route handled by SubcategoryPage, so it can't re-enter this gate).
 */
export default function LegacyShopRedirect({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug?: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const { data: settings, isLoading: settingsLoading } = useSiteSettings();
  const { data: categories, isLoading: categoriesLoading } = useProductCategories();

  const categoryParam = params.get("category") || "";
  const tabParam = params.get("tab") || "";

  // A legacy category slug only comes from the /shop/:slug route; the section
  // landings /shop/baby and /shop/mum are their own routes, so skip them.
  const legacySlug = slug && slug !== "baby" && slug !== "mum" ? slug : "";
  const targetSlug = legacySlug || categoryParam;

  // No legacy signal at all -> render immediately, no waiting.
  if (!targetSlug) return <>{children}</>;

  // A redirect is possible: wait for settings + categories so we resolve the
  // parent correctly and never flash the wrong page before redirecting.
  if (settingsLoading || categoriesLoading || !settings || !categories) {
    return (
      <div className="min-h-screen bg-background pt-[68px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-forest" />
      </div>
    );
  }

  const enabled = (settings as any).storefront_legacy_redirects_enabled;
  const redirectsEnabled = enabled !== false && enabled !== "false";
  if (!redirectsEnabled) return <>{children}</>;

  // Resolve the category. No match -> render the wrapped page (no 404).
  const cat = categories.find(c => c.slug === targetSlug);
  if (!cat) return <>{children}</>;

  // parent: ?tab wins for the query form; otherwise the category's own parent.
  const tabParent = tabParam === "mum" ? "mum" : tabParam === "baby" ? "baby" : null;
  const catParent = cat.parent_category === "mum" ? "mum" : "baby"; // baby/both/null -> baby
  const parent = (categoryParam && tabParent) ? tabParent : catParent;

  const target = `/shop/${parent}/${cat.slug}`;
  // Loop guard: never redirect onto the current path.
  if (location.pathname === target) return <>{children}</>;

  return <Navigate to={target} replace />;
}
