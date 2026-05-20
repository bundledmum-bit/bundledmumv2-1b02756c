import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BundleSection } from "@/components/BundleSections";

/**
 * Standalone bundle-category page (e.g. /bundles/baby-shower-gift-boxes).
 *
 * Reuses the same <BundleSection> component the /bundles page uses, so
 * the card design and grid match exactly. The difference is this page
 * is dedicated — no "See all" link, all products shown.
 *
 * sectionKey identifies which shop_sections.bundle_group row drives
 * the title/subtitle/filter. Three thin route wrappers below export
 * pre-bound variants for the App router.
 */

interface ShopSection {
  id: string;
  section_key: string;
  title: string;
  subtitle: string | null;
  filter_value: string;
  standalone_page_slug: string | null;
}

interface BundleProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_gift_box: boolean;
  bundle_label: string | null;
  shop_section_order: number | null;
  brands: { id: string; sku: string | null; brand_name: string; price: number; tier: string | null; in_stock: boolean; image_url: string | null; images?: string[] | null }[];
}

interface EnrichedBundle extends BundleProduct {
  item_count: number;
  computed_price: number;
  is_maternity: boolean;
}

export default function BundleCategoryPage({ sectionKey }: { sectionKey: string }) {
  // ── Load the section row that defines title/subtitle/filter. ──────
  const sectionQuery = useQuery({
    queryKey: ["bundle-category-section", sectionKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shop_sections")
        .select("id, section_key, title, subtitle, filter_value, standalone_page_slug")
        .eq("section_key", sectionKey)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as ShopSection | null;
    },
    staleTime: 60_000,
  });

  const section = sectionQuery.data;
  const filterValue = section?.filter_value || "";

  useEffect(() => {
    document.title = section?.title
      ? `${section.title} | BundledMum`
      : "Bundles | BundledMum";
  }, [section?.title]);

  // ── Load every active bundle product matching the filter prefix. ──
  const productsQuery = useQuery({
    queryKey: ["bundle-category-products", filterValue],
    enabled: !!filterValue,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select(`id, name, slug, description, is_gift_box, bundle_label, shop_section_order,
                 brands:brands_public ( id, sku, brand_name, price, tier, in_stock, image_url, images )`)
        .eq("is_gift_box", true)
        .eq("is_active", true)
        .ilike("name", `${filterValue}%`)
        .order("shop_section_order", { ascending: true, nullsFirst: false })
        .order("slug");
      if (error) throw error;
      return (data || []) as BundleProduct[];
    },
    staleTime: 60_000,
  });

  // ── Enrich each product with item_count + freshest computed price.
  // Mirrors the BundleSections pipeline so cards display consistent
  // pricing across both pages.
  const productsKey = (productsQuery.data || []).map(p => p.id).join(",");
  const matIds = (productsQuery.data || [])
    .filter(p => /^Maternity Bundle/i.test(p.name))
    .map(p => p.id);

  const matSnapshotsQuery = useQuery({
    queryKey: ["bundle-category-snapshots", matIds.join(",")],
    enabled: matIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("maternity_bundle_snapshots")
        .select("bundle_id, item_count, sell_price, snapped_at")
        .in("bundle_id", matIds)
        .order("snapped_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, { item_count: number; sell_price: number }> = {};
      (data || []).forEach((s: any) => {
        if (!map[s.bundle_id]) {
          map[s.bundle_id] = { item_count: Number(s.item_count ?? 0), sell_price: Number(s.sell_price ?? 0) };
        }
      });
      return map;
    },
    staleTime: 60_000,
  });

  const enrichedQuery = useQuery({
    queryKey: ["bundle-category-enriched", productsKey, JSON.stringify(matSnapshotsQuery.data || {})],
    enabled: !!productsQuery.data,
    queryFn: async () => {
      const products = productsQuery.data || [];
      const matMap = matSnapshotsQuery.data || {};
      const out: EnrichedBundle[] = await Promise.all(products.map(async p => {
        const isMaternity = /^Maternity Bundle/i.test(p.name);
        if (isMaternity) {
          const snap = matMap[p.id];
          return {
            ...p,
            is_maternity: true,
            item_count: snap?.item_count ?? 0,
            computed_price: snap?.sell_price || Number(p.brands?.[0]?.price ?? 0),
          };
        }
        try {
          const { data } = await (supabase as any).rpc("get_gift_box_price", { p_gift_box_id: p.id });
          return {
            ...p,
            is_maternity: false,
            item_count: Number((data as any)?.item_count ?? 0),
            computed_price: Number((data as any)?.sell_price ?? p.brands?.[0]?.price ?? 0),
          };
        } catch {
          return {
            ...p,
            is_maternity: false,
            item_count: 0,
            computed_price: Number(p.brands?.[0]?.price ?? 0),
          };
        }
      }));
      return out;
    },
    staleTime: 60_000,
  });

  const loading = sectionQuery.isLoading
    || productsQuery.isLoading
    || (matIds.length > 0 && matSnapshotsQuery.isLoading)
    || enrichedQuery.isLoading;

  const isMaternity = sectionKey === "bundle_maternity_lists";
  const gridCols: "1-2-3" | "1-2-4" = isMaternity ? "1-2-4" : "1-2-3";

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-8">
      <div
        className="pt-[68px]"
        style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1A3D2E 100%)" }}
      >
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12">
          {/* Breadcrumb + back link */}
          <nav className="flex items-center gap-1.5 text-xs text-primary-foreground/60 mb-3 font-body">
            <Link to="/" className="hover:text-primary-foreground/90">Home</Link>
            <span>/</span>
            <Link to="/bundles" className="hover:text-primary-foreground/90">Bundles</Link>
            <span>/</span>
            <span className="text-primary-foreground/90 font-semibold">
              {section?.title || "Loading…"}
            </span>
          </nav>
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground mb-2.5">
            {section?.title || "Bundles"}
          </h1>
          {isMaternity ? (
            <p className="text-primary-foreground/70 text-sm md:text-base max-w-[620px] leading-relaxed">
              We pre-packed these bundles based on different budgets, so you don't have to.
            </p>
          ) : section?.subtitle ? (
            <p className="text-primary-foreground/70 text-sm md:text-base max-w-[620px] leading-relaxed">
              {section.subtitle}
            </p>
          ) : null}
          <div className="mt-4">
            <Link
              to="/bundles"
              className="inline-flex items-center text-primary-foreground/70 hover:text-primary-foreground text-xs font-semibold"
            >
              ← Back to all Bundles
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12">
        {/* Maternity-only: invite shoppers with a different budget into the
            60-second quiz before they scroll past the curated tiers. */}
        {isMaternity && (
          <div className="mt-2 mb-12 flex flex-col items-center text-center">
            <p className="text-base sm:text-lg text-gray-700 mb-3 max-w-2xl">
              Have a different budget in mind? Let us build a custom list, just for you.
            </p>
            <Link
              to="/quiz"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF8B6B] hover:bg-[#FF7757] text-white font-semibold rounded-full shadow-md hover:shadow-lg transition-all"
            >
              Take the 60-second quiz
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <BundleSection
          heading={section?.title || ""}
          subtitle=""
          items={enrichedQuery.data || []}
          loading={loading}
          variant="bundles"
          gridCols={gridCols}
        />

        {/* Maternity-only premium storytelling block — sits below the
            tiered cards so shoppers who scroll get the brand story, the
            inventory promise, the three-step flow, and a final CTA into
            the quiz for custom-budget shoppers. */}
        {isMaternity && (
          <section className="mt-24 py-16 px-6 sm:px-12 bg-gradient-to-br from-[#FFF8F0] to-[#F5EDE0] rounded-3xl">
            <div className="max-w-4xl mx-auto">
              {/* Intro story */}
              <div className="text-center mb-16">
                <span className="inline-block px-4 py-1.5 bg-[#2D6A4F]/10 text-[#2D6A4F] text-sm font-semibold rounded-full mb-4">
                  🤍 Why we built this
                </span>
                <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A1A] mb-6 leading-tight">
                  Because no Nigerian mum should prepare alone.
                </h2>
                <p className="text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto">
                  Pregnancy in Nigeria comes with a long shopping list — and even longer second-guessing. Between scrolling Instagram, asking your aunties, and worrying you've forgotten something, the prep alone drains you before baby even arrives.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto mt-4">
                  We built BundledMum so you skip the chaos. Every bundle here was curated with input from real Nigerian mums, midwives, and doulas — three thoughtful tiers, the same hospital-ready essentials, fully packed and delivered to your door.
                </p>
              </div>

              {/* What's inside */}
              <div className="mb-16">
                <h3 className="text-2xl font-bold text-[#1A1A1A] mb-8 text-center">
                  ✨ What's inside every bundle
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { emoji: "🏥", title: "Hospital bag essentials",         text: "Packed and ready for labour day. Pads, gown, going-home outfit — sorted." },
                    { emoji: "🤱", title: "Postpartum recovery kit",         text: "Supporting mum through the first weeks: pads, nipple cream, comfort wear, and more." },
                    { emoji: "👶", title: "Baby's first 6 weeks",            text: "Nappies, vests, wipes, feeding, and skincare — covered from day one." },
                    { emoji: "🌿", title: "Mum-curated brands",              text: "Trusted Nigerian and international brands, vetted by mums who've been there." },
                    { emoji: "📦", title: "One delivery, fully packed",      text: "No extra shopping trips. No missing items. Everything in one box." },
                    { emoji: "💚", title: "Hospital-ready before your due date", text: "48-hour packing. Free Lagos delivery on bundles over ₦200,000." },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4 p-5 bg-white/70 backdrop-blur rounded-xl shadow-sm hover:shadow-md transition-shadow">
                      <div className="text-3xl flex-shrink-0">{item.emoji}</div>
                      <div>
                        <h4 className="font-semibold text-[#1A1A1A] mb-1">{item.title}</h4>
                        <p className="text-sm text-gray-600 leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* How it works */}
              <div className="mb-16">
                <h3 className="text-2xl font-bold text-[#1A1A1A] mb-10 text-center">
                  🛍️ How it works
                </h3>
                <div className="grid sm:grid-cols-3 gap-6">
                  {[
                    { step: "1", title: "Pick your bundle", text: "Choose the budget that fits you: ₦200k, ₦500k, or ₦1M+. Same essentials, different quantity and premium upgrades." },
                    { step: "2", title: "We pack the box",  text: "Hand-checked, brand-verified, and prepared in 48 hours. You don't lift a finger." },
                    { step: "3", title: "You focus on baby", text: "Free Lagos delivery on bundles over ₦200,000. Hospital-ready before your due date. Done." },
                  ].map((item, i) => (
                    <div key={i} className="text-center">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#2D6A4F] text-white text-xl font-bold mb-4">
                        {item.step}
                      </div>
                      <h4 className="font-bold text-lg text-[#1A1A1A] mb-2">{item.title}</h4>
                      <p className="text-sm text-gray-700 leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Closing CTA */}
              <div className="text-center bg-[#2D6A4F] text-white rounded-2xl p-10">
                <h3 className="text-2xl sm:text-3xl font-bold mb-3">
                  Still not sure which to pick?
                </h3>
                <p className="text-base sm:text-lg text-white/90 mb-6 max-w-xl mx-auto">
                  Take our 60-second quiz and we'll build a list tailored to your exact budget, due date, and hospital plan.
                </p>
                <Link
                  to="/quiz"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF8B6B] hover:bg-[#FF7757] text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all"
                >
                  Build my custom list
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Route-friendly wrappers — App.tsx mounts these so each URL resolves
// to a single fixed sectionKey without needing route params.
export function BundleCategoryGiftBoxesPage()    { return <BundleCategoryPage sectionKey="bundle_gift_boxes" />; }
export function BundleCategoryRecoveryKitsPage() { return <BundleCategoryPage sectionKey="bundle_recovery_kits" />; }
export function BundleCategoryMaternityPage()    { return <BundleCategoryPage sectionKey="bundle_maternity_lists" />; }
