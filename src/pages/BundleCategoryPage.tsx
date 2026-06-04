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
                 brands:brands_public ( id, sku, brand_name, price, tier, in_stock, image_url, stored_image_url, images )`)
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
    .filter(p => /^Maternity( \+ Baby Items)? Bundle/i.test(p.name))
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
        const isMaternity = /^Maternity( \+ Baby Items)? Bundle/i.test(p.name);
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
  const isRecoveryKits = sectionKey === "bundle_recovery_kits";
  const isGiftBoxes = sectionKey === "bundle_gift_boxes";
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
          ) : isRecoveryKits ? (
            <p className="text-primary-foreground/70 text-sm md:text-base max-w-[620px] leading-relaxed">
              We pre-packed these recovery kits so healing is the only thing you focus on.
            </p>
          ) : isGiftBoxes ? (
            <p className="text-primary-foreground/70 text-sm md:text-base max-w-[620px] leading-relaxed">
              Skip the guessing. We packed gift boxes new mums will actually use.
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
        <BundleSection
          heading={section?.title || ""}
          subtitle=""
          items={enrichedQuery.data || []}
          loading={loading}
          variant="bundles"
          gridCols={gridCols}
        />

        {/* Maternity-only: invite shoppers whose budget falls outside the
            three preset tiers into the 60-second quiz. Sits below the
            cards so the curated tiers get first attention. */}
        {isMaternity && (
          <div className="mt-12 mb-16 flex flex-col items-center text-center px-4">
            <p className="text-base sm:text-lg text-gray-700 mb-4 max-w-2xl">
              Have a different budget in mind? Let us build a custom list, just for you.
            </p>
            <Link
              to="/quiz"
              className="inline-flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-full shadow-md hover:shadow-lg transition-all bg-[#2e6b50]"
            >
              Take the 30-second quiz
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Maternity-only premium storytelling block — brand story, the
            inventory promise, the three-step flow, and a final CTA into
            the quiz for custom-budget shoppers. */}
        {isMaternity && (
          <section className="mt-8 py-16 px-6 sm:px-12 bg-gradient-to-br from-[#FFF8F0] to-[#F5EDE0] rounded-3xl">
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
                  We built BundledMum so you skip the chaos. Every bundle here was curated with input from real Nigerian mums & midwives, fully packed and delivered to your door.
                </p>
              </div>

              {/* What's inside */}
              <div className="mb-16">
                <h3 className="text-2xl font-bold text-[#1A1A1A] mb-8 text-center">
                  ✨ What's inside every bundle
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { emoji: "🏥", title: "Hospital bag essentials",         text: "Packed and ready for labour day. Pads, gown, going-home outfit — sorted." },
                    { emoji: "🤱", title: "Postpartum recovery kit",         text: "Supporting mum through the first weeks: pads, nipple cream, comfort wear, and more." },
                    { emoji: "👶", title: "Baby's first 6 weeks",            text: "Nappies, vests, wipes, feeding, and skincare — covered from day one." },
                    { emoji: "🌿", title: "Mum-curated brands",              text: "Trusted Nigerian and international brands, vetted by mums who've been there." },
                    { emoji: "📦", title: "One delivery, fully packed",      text: "No extra shopping trips. No missing items. Everything in one box." },
                    { emoji: "💚", title: "Hospital-ready before your due date", text: "24-hour packing. Free Lagos delivery on bundles over ₦200,000." },
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {[
                    { step: "1", title: "Pick your bundle", text: "Choose the budget that fits you: ₦200k, ₦500k, or ₦1M+. Same essentials, different quantity and premium upgrades." },
                    { step: "2", title: "We pack the box",  text: "Hand-checked, brand-verified, and prepared in 24 hours. You don't lift a finger." },
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
                  Take our 30-second quiz and we'll build a list tailored to your budget.
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

        {/* Recovery-kits-only: invite mums whose recovery needs don't
            match the preset kits into the 30-second quiz. Sits below
            the cards so the curated kits get first attention. */}
        {isRecoveryKits && (
          <div className="mt-12 mb-16 flex flex-col items-center text-center px-4">
            <p className="text-base sm:text-lg text-gray-700 mb-4 max-w-2xl">
              Your recovery is personal. Let us build a kit around your delivery type and what you actually need.
            </p>
            <Link
              to="/quiz"
              className="inline-flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-full shadow-md hover:shadow-lg transition-all bg-[#2e6b50]"
            >
              Take the 30-second quiz
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Recovery-kits-only premium storytelling block. Pain-point led:
            mum-vs-baby attention gap → Lagos sourcing gap → our promise.
            Strictly customer-facing copy — zero tier/budget vocabulary. */}
        {isRecoveryKits && (
          <section className="mt-8 py-16 px-6 sm:px-12 bg-gradient-to-br from-[#FFF8F0] to-[#F5EDE0] rounded-3xl">
            <div className="max-w-4xl mx-auto">
              {/* Intro story — pain → gap → promise */}
              <div className="text-center mb-16">
                <span className="inline-block px-4 py-1.5 bg-[#2D6A4F]/10 text-[#2D6A4F] text-sm font-semibold rounded-full mb-4">
                  🤍 Why we built this
                </span>
                <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A1A] mb-6 leading-tight">
                  You spent 9 months preparing for baby. We made sure someone was thinking about you.
                </h2>
                <p className="text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto">
                  In Nigeria, all eyes go to the baby the moment you give birth. The visitors, the gifts, the well-wishes. Meanwhile, you're bleeding for weeks, your breasts hurt, your stitches sting, and nobody packed anything for you.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto mt-4">
                  Hospitals discharge you with nothing. Lagos doesn't have one place that stocks everything you need. And by the time you realise what you should have bought, you're already crying through it at 2am.
                </p>
                <p className="text-lg leading-relaxed max-w-2xl mx-auto mt-4 font-medium text-[#2D6A4F]">
                  We packed every kit for the version of you that comes home after the hospital. So healing is the only thing you have to do.
                </p>
              </div>

              {/* What's inside — pain-point framed */}
              <div className="mb-16">
                <h3 className="text-2xl font-bold text-[#1A1A1A] mb-3 text-center">
                  ✨ What's inside every recovery kit
                </h3>
                <p className="text-center text-gray-600 mb-8 max-w-xl mx-auto">
                  The essentials nobody warns you about. Sorted, packed, and ready before you need them.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { emoji: "🌸", title: "Pad & flow care",         text: "Heavy-flow maternity pads, mesh underwear, and a peri bottle. Because the bleeding lasts longer than anyone tells you." },
                    { emoji: "🤱", title: "Breastfeeding comfort",   text: "Lanolin nipple cream, breast pads, and nursing-friendly basics. For the days when latching hurts more than labour." },
                    { emoji: "🛁", title: "Perineum & stitch care",  text: "Sitz bath salts, cooling pads, and soothing sprays. Tears and stitches deserve gentle." },
                    { emoji: "🌿", title: "Body recovery basics",    text: "Postpartum belly support, soft loungewear, and items for the bathroom struggles nobody mentioned." },
                    { emoji: "🌙", title: "Rest & sanity essentials", text: "Hydration support, comfort snacks, and small comforts for the 3am feeds when you forget what day it is." },
                    { emoji: "💛", title: "Mum-vetted, every item",  text: "Curated with Nigerian mums, midwives, and doulas. Nothing fluffy. Nothing you don't need." },
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

              {/* How it works — no tier language */}
              <div className="mb-16">
                <h3 className="text-2xl font-bold text-[#1A1A1A] mb-10 text-center">
                  🛍️ How it works
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {[
                    { step: "1", title: "Pick the kit that fits", text: "Choose the kit that matches what you need most. We make sure the essentials are covered in all of them." },
                    { step: "2", title: "We pack it with care",   text: "Hand-checked, mum-curated, and packed within 24 hours. You don't lift anything heavier than your baby." },
                    { step: "3", title: "You focus on healing",   text: "Free Lagos delivery on kits over ₦200,000. Delivered before baby arrives so it's ready when you are home." },
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
                  Want a kit built around your recovery?
                </h3>
                <p className="text-base sm:text-lg text-white/90 mb-6 max-w-xl mx-auto">
                  Take our 30-second quiz and we'll match you with what you actually need based on your delivery, your recovery, and your budget.
                </p>
                <Link
                  to="/quiz"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF8B6B] hover:bg-[#FF7757] text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all"
                >
                  Build my recovery kit
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Gift-boxes-only: catch gifters who want something more personal
            than the curated boxes. Sits below the cards so the ready-to-
            send options get first attention. */}
        {isGiftBoxes && (
          <div className="mt-12 mb-16 flex flex-col items-center text-center px-4">
            <p className="text-base sm:text-lg text-gray-700 mb-4 max-w-2xl">
              Want to give something more personal? Tell us about the mum-to-be and we'll build a gift box she'll actually open twice.
            </p>
            <Link
              to="/quiz"
              className="inline-flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-full shadow-md hover:shadow-lg transition-all bg-[#2e6b50]"
            >
              Build a custom gift in 30 seconds
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Gift-boxes-only storytelling block. Gifter-pain led: lazy gifts
            in Lagos → what mums actually need → what we let YOU give.
            All copy addresses the gifter (you) about the mum (her, she);
            never the mum directly. Strictly customer-facing — zero
            tier/budget vocabulary. */}
        {isGiftBoxes && (
          <section className="mt-8 py-16 px-6 sm:px-12 bg-gradient-to-br from-[#FFF8F0] to-[#F5EDE0] rounded-3xl">
            <div className="max-w-4xl mx-auto">
              {/* Intro story — gifter frustration → mum's real need → our solution */}
              <div className="text-center mb-16">
                <span className="inline-block px-4 py-1.5 bg-[#2D6A4F]/10 text-[#2D6A4F] text-sm font-semibold rounded-full mb-4">
                  🎁 Why we built this
                </span>
                <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A1A] mb-6 leading-tight">
                  The best gift for a new mum isn't another bib.
                </h2>
                <p className="text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto">
                  You've been invited to a baby shower or just heard the good news. You want to send something thoughtful. But every shop in Lagos shows you the same thing: cute outfits she'll outgrow in three weeks, generic plush toys, or a hamper of products she won't touch.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto mt-4">
                  Meanwhile, the new mum quietly needs nipple cream, maternity pads, a peri bottle, and a comfort drink she can sip at 3am. The things nobody thinks to gift. The things she'd never ask for.
                </p>
                <p className="text-lg leading-relaxed max-w-2xl mx-auto mt-4 font-medium text-[#2D6A4F]">
                  We built these gift boxes so you can give her what she actually needs and look like the most thoughtful person in her group chat.
                </p>
              </div>

              {/* What's inside — gifter framed */}
              <div className="mb-16">
                <h3 className="text-2xl font-bold text-[#1A1A1A] mb-3 text-center">
                  ✨ What's inside every gift box
                </h3>
                <p className="text-center text-gray-600 mb-8 max-w-xl mx-auto">
                  A blend of essentials and small comforts. Useful enough to be remembered. Lovely enough to feel like a gift.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { emoji: "🌸", title: "The things she actually needs",   text: "Postpartum essentials she'd be too shy to ask for. Maternity pads, nipple cream, comfort wear, recovery basics." },
                    { emoji: "👶", title: "A few baby treats too",           text: "Soft baby essentials so she doesn't feel left out of the cute stuff. But practical, not just decorative." },
                    { emoji: "🌿", title: "Curated, never random",           text: "Hand-picked by Nigerian mums, midwives, and doulas. Every item earns its spot. Nothing filler." },
                    { emoji: "🎀", title: "Gift-ready, beautifully packed",  text: "Premium packaging, ribbon-tied, with a card slot for your personal note. Ready to hand over." },
                    { emoji: "📦", title: "One delivery, one box",           text: "We deliver directly to her or to you. Lagos delivery in 24 hours." },
                    { emoji: "💛", title: "A gift she'll text you about",    text: "The kind of gift that gets a real thank-you message, not a polite emoji." },
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

              {/* How it works — no tier language */}
              <div className="mb-16">
                <h3 className="text-2xl font-bold text-[#1A1A1A] mb-10 text-center">
                  🛍️ How it works
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {[
                    { step: "1", title: "Choose your gift box",          text: "Pick the one that matches what you want to spend. Each is thoughtfully built and gift-ready." },
                    { step: "2", title: "Add a personal note",           text: "Write a message at checkout. We hand-write it onto a card and tuck it into the box." },
                    { step: "3", title: "We deliver, you get the credit", text: "Send to her door or yours. Free Lagos delivery on gift boxes over ₦200,000. Ready in 24 hours." },
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
                  Want to give something even more personal?
                </h3>
                <p className="text-base sm:text-lg text-white/90 mb-6 max-w-xl mx-auto">
                  Take our 30-second quiz. Tell us a little about her and we'll build a gift box that actually fits the mum you're sending it to.
                </p>
                <Link
                  to="/quiz"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF8B6B] hover:bg-[#FF7757] text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all"
                >
                  Build her custom gift
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
