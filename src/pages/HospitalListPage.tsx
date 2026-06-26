import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search, Plus, Minus, X, Wallet, ShoppingBag, ChevronDown, MessageCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useCart, fmt, cartItemKey } from "@/lib/cart";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import HospitalListExitPopup, { HL_WA_USED_KEY } from "@/components/HospitalListExitPopup";
import { getCustomItemsRequest, setCustomItemsRequest, customItemsLines } from "@/lib/customItemsRequest";
import ImageZoomModal from "@/components/ImageZoomModal";
import { trackEvent } from "@/lib/analytics";
import { usePageEngagement } from "@/hooks/usePageEngagement";
import whatsappLogo from "@/assets/whatsapp-logo.svg";

// Fire-and-forget hospital-list interaction event (reuses the shared analytics
// helper; page_url is set by trackEvent and also echoed into event_data).
const trackHL = (action: string, extra?: Record<string, unknown>) => {
  try { trackEvent("hospital_list_interaction", { action, page_url: "/hospital-list", ...extra }); } catch { /* ignore */ }
};

// ── Types ────────────────────────────────────────────────────────────
// Rows returned by the search_hospital_list_products RPC. `price` is in
// NAIRA already (never /100). `image_url` is the CORS-safe stored copy.
interface HLProduct {
  product_id: string;
  name: string;
  slug: string | null;
  category: string | null; // 'baby' | 'mum' | 'both' | 'push-gift'
  subcategory: string | null;
  brand_id: string | null;
  brand_name: string | null;
  price: number;
  image_url: string | null;
  match_source?: string | null;
  // Resolved hospital-list section from the RPC (per-product override if
  // set, else derived server-side from category): 'baby'|'mother'|'hospital'.
  section?: string | null;
}

// hospital_list_budget_fit returns the same shape PLUS a fitted quantity.
interface HLBudgetItem extends HLProduct {
  quantity: number;
}

// A selectable colour variant (product_colors row).
interface ColorOption {
  name: string;
  hex: string | null;
}

// One in-stock brand option for a product (lazy-loaded on "Other Options").
interface BrandOption {
  id: string;
  brand_name: string | null;
  price: number;
  image_url: string | null;
}

// The brand a card is currently offering — defaults to the RPC default,
// swapped when the customer picks an alternative under "Other Options".
interface ChosenBrand {
  id: string;
  brand_name: string | null;
  price: number;
  image_url: string | null;
}

// category → STABLE section key (independent of the display heading, which
// is now admin-configurable). 'both'/'push-gift'/anything → hospital.
type SectionKey = "baby" | "mother" | "hospital";
const SECTION_KEY_FOR_CATEGORY = (cat: string | null): SectionKey =>
  cat === "baby" ? "baby" : cat === "mum" ? "mother" : "hospital";
const SECTION_KEY_ORDER: SectionKey[] = ["baby", "mother", "hospital"];

// Resolve a row's section: prefer the RPC-resolved `section` (per-product
// override or server-derived), falling back to the category lookup if it's
// ever missing so grouping never breaks.
const SECTION_KEY_OF = (row: { section?: string | null; category: string | null }): SectionKey => {
  const s = row.section;
  if (s === "baby" || s === "mother" || s === "hospital") return s;
  return SECTION_KEY_FOR_CATEGORY(row.category);
};

// Section tab filter — "all" plus one tab per section key.
type TabKey = "all" | SectionKey;

// Page copy/labels/toggles come from get_hospital_list_config(). These
// defaults mirror the previously-hardcoded values and are used while the
// config loads or when a field is missing/null.
type HLConfig = Record<string, any>;
const CONFIG_DEFAULTS: HLConfig = {
  page_enabled: true,
  heading: "Build your hospital bag",
  subheading: "Tap Add on anything you need — your total updates as you go.",
  budget_enabled: true,
  budget_prompt_label: "Have a budget? We’ll build a bag for it.",
  budget_summary_template: "Here’s a hospital bag for {budget}: {count} items, total {total}.",
  search_placeholder: "Search e.g. cotton wool, pampers, rubber sheet",
  tabs_enabled: true,
  tab_label_all: "All",
  tab_label_baby: "Baby",
  tab_label_mother: "Mother",
  tab_label_hospital: "Hospital",
  section_heading_baby: "Baby Items",
  section_heading_mother: "Mother Items",
  section_heading_hospital: "Hospital Items",
  add_more_enabled: true,
  add_more_label: "Add More Products",
  add_more_path: "/shop",
  whatsapp_enabled: true,
  whatsapp_label: "Need help? Chat on WhatsApp",
  whatsapp_number: "",
  empty_state_text: "Try a simpler word, or clear the search to see everything.",
};

const PLACEHOLDER = "/placeholder.svg";

export default function HospitalListPage() {
  const navigate = useNavigate();
  const { cart, addToCart, updateQty, getCartItem, totalItems, subtotal } = useCart();
  const isMobile = useIsMobile();
  // Time-on-page + scroll-depth tracking (writes page_views metrics on exit).
  usePageEngagement("/hospital-list");
  // Fire custom-items focus only on the FIRST focus.
  const customItemsFocusedRef = useRef(false);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [products, setProducts] = useState<HLProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Admin-controlled page copy/labels/toggles. Render defaults until it
  // loads (never flash empty); a missing/null field falls back to default.
  const [rawConfig, setRawConfig] = useState<HLConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_hospital_list_config");
      if (cancelled) return;
      if (error) console.warn("get_hospital_list_config failed:", error);
      else setRawConfig((data || {}) as HLConfig);
      setConfigLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);
  // Resolved config: default for any missing/null field.
  const cfg = useMemo(() => {
    const out: HLConfig = { ...CONFIG_DEFAULTS };
    if (rawConfig) for (const k of Object.keys(CONFIG_DEFAULTS)) {
      if (rawConfig[k] !== null && rawConfig[k] !== undefined && rawConfig[k] !== "") out[k] = rawConfig[k];
    }
    return out;
  }, [rawConfig]);

  // Budget mode (Change 1). `budgetItems === null` means we're NOT in
  // budget mode; an array (even empty) means the budget RPC has run.
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetAmount, setBudgetAmount] = useState<number | null>(null);
  const [budgetItems, setBudgetItems] = useState<HLBudgetItem[] | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  // Budget builder is collapsed by default behind an "I have a budget" toggle.
  const [budgetOpen, setBudgetOpen] = useState(false);
  // Free-text "other items not listed" — persisted to localStorage so it
  // survives the trip to checkout. Unpriced; never affects any total.
  const [customItems, setCustomItems] = useState<string>(() => getCustomItemsRequest());

  // product_ids that have >1 in-stock brand — so "Other Options" only
  // appears where there's actually an alternative to choose.
  const [multiBrandIds, setMultiBrandIds] = useState<Set<string>>(new Set());

  // Per-product variant dimensions (sizes / colors) for visible products,
  // loaded in ONE batched query through the anon-safe products embed.
  const [sizesByProduct, setSizesByProduct] = useState<Map<string, string[]>>(new Map());
  const [colorsByProduct, setColorsByProduct] = useState<Map<string, ColorOption[]>>(new Map());

  // Sticky offset so the search bar pins just below the fixed sitewide
  // navbar (Change 2). Measured because the announcement bar above the
  // navbar is dismissable, which shifts the navbar's bottom edge.
  const [navBottom, setNavBottom] = useState(108);
  useLayoutEffect(() => {
    const measure = () => {
      const nav = document.querySelector("nav");
      if (nav) setNavBottom(Math.round(nav.getBoundingClientRect().bottom));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);

  const inBudgetMode = budgetItems !== null;

  // Debounce the search text ~250ms so each keystroke doesn't hit the RPC.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch the searchable list whenever the debounced query changes. Empty
  // string returns the full default list straight from the RPC.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any).rpc("search_hospital_list_products", {
        p_query: debounced,
      });
      if (cancelled) return;
      if (error) {
        console.warn("search_hospital_list_products failed:", error);
        setProducts([]);
      } else {
        const rows = (data || []) as HLProduct[];
        setProducts(rows);
        // Capture genuine zero-result searches so we learn the real terms
        // people type (feeds alias learning). Only for actual user searches
        // — never the empty-string default list — and once per settled
        // debounce, not per keystroke. Fire-and-forget; the RPC re-checks
        // and no-ops on blank/short/actually-matching terms.
        if (debounced.length > 0 && rows.length === 0) {
          try {
            void (supabase as any).rpc("record_search_miss", { p_query: debounced });
          } catch {
            /* ignore — invisible capture must never affect the UI */
          }
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // The list currently on screen — budget results take precedence.
  const displayList: HLProduct[] = inBudgetMode ? (budgetItems as HLBudgetItem[]) : products;
  const displayIdsSig = useMemo(
    () => Array.from(new Set(displayList.map((p) => p.product_id))).sort().join(","),
    [displayList],
  );

  // After the visible list changes, tally in-stock brand counts in ONE
  // query so "Other Options" shows only for genuinely multi-brand products.
  useEffect(() => {
    if (!displayIdsSig) {
      setMultiBrandIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = displayIdsSig.split(",");
      const { data, error } = await (supabase as any)
        .from("brands_public")
        .select("product_id")
        .in("product_id", ids)
        .eq("in_stock", true);
      if (cancelled || error) return;
      const counts = new Map<string, number>();
      for (const row of (data || []) as { product_id: string }[]) {
        counts.set(row.product_id, (counts.get(row.product_id) || 0) + 1);
      }
      const multi = new Set<string>();
      counts.forEach((n, id) => {
        if (n > 1) multi.add(id);
      });
      setMultiBrandIds(multi);
    })();
    return () => {
      cancelled = true;
    };
  }, [displayIdsSig]);

  // Batched variant load (sizes + colors) for the visible products, via the
  // SAME anon-safe products embed the storefront uses (product_sizes /
  // product_colors are RLS-locked directly, but readable through products).
  // One query, not per-card. Only in-stock rows count; ordered by display_order.
  useEffect(() => {
    if (!displayIdsSig) {
      setSizesByProduct(new Map());
      setColorsByProduct(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = displayIdsSig.split(",");
      const { data, error } = await (supabase as any)
        .from("products")
        .select(
          "id, product_sizes(size_label, display_order, in_stock), product_colors(color_name, color_hex, display_order, in_stock)",
        )
        .in("id", ids);
      if (cancelled || error) {
        if (error) console.warn("variant load failed:", error);
        return;
      }
      const sizeMap = new Map<string, string[]>();
      const colorMap = new Map<string, ColorOption[]>();
      for (const row of (data || []) as any[]) {
        const sizes = ((row.product_sizes || []) as any[])
          .filter((s) => s.in_stock)
          .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
          .map((s) => s.size_label as string)
          .filter(Boolean);
        if (sizes.length) sizeMap.set(row.id, sizes);
        const colors = ((row.product_colors || []) as any[])
          .filter((c) => c.in_stock)
          .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
          .map((c) => ({ name: c.color_name as string, hex: (c.color_hex as string) ?? null }))
          .filter((c) => !!c.name);
        if (colors.length) colorMap.set(row.id, colors);
      }
      setSizesByProduct(sizeMap);
      setColorsByProduct(colorMap);
    })();
    return () => {
      cancelled = true;
    };
  }, [displayIdsSig]);

  const isSearching = debounced.length > 0;

  // Admin-configurable display heading per stable section key.
  const sectionHeading = (key: SectionKey): string =>
    key === "baby" ? cfg.section_heading_baby
      : key === "mother" ? cfg.section_heading_mother
      : cfg.section_heading_hospital;

  // Group the default view into sections (by stable key), then apply the
  // tab filter. The band heading text comes from config.
  const sections = useMemo(() => {
    const map = new Map<SectionKey, HLProduct[]>();
    for (const p of products) {
      const key = SECTION_KEY_OF(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return SECTION_KEY_ORDER.filter((k) => map.has(k)).map((key) => ({
      key,
      heading: sectionHeading(key),
      rows: map.get(key)!,
    }));
  }, [products, cfg]);

  // Tabs from config labels (key 'all' + one per section key).
  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: cfg.tab_label_all },
    { key: "baby", label: cfg.tab_label_baby },
    { key: "mother", label: cfg.tab_label_mother },
    { key: "hospital", label: cfg.tab_label_hospital },
  ];
  const visibleSections =
    activeTab === "all" ? sections : sections.filter((s) => s.key === activeTab);

  // Budget summary numbers (honest — show the real total even if it edges
  // slightly over the requested budget; essentials have a price floor).
  const budgetCount = (budgetItems || []).reduce((s, i) => s + (i.quantity || 1), 0);
  const budgetTotal = (budgetItems || []).reduce((s, i) => s + i.price * (i.quantity || 1), 0);

  // ── Handlers ──────────────────────────────────────────────────────
  const applyBudget = async () => {
    const amt = parseInt(budgetInput.replace(/[^\d]/g, ""), 10);
    if (!amt || amt <= 0) return;
    trackHL("budget_applied", { amount: amt });
    setBudgetLoading(true);
    // Budget + search are alternate ways to populate the list — entering
    // budget mode clears any active search.
    setQuery("");
    setDebounced("");
    const { data, error } = await (supabase as any).rpc("hospital_list_budget_fit", {
      p_budget_amount: amt,
    });
    setBudgetLoading(false);
    if (error) {
      console.warn("hospital_list_budget_fit failed:", error);
    }
    setBudgetItems((data || []) as HLBudgetItem[]);
    setBudgetAmount(amt);
  };

  const clearBudget = () => {
    setBudgetItems(null);
    setBudgetAmount(null);
    setBudgetInput("");
  };

  // Typing a search exits budget mode and returns to the normal list.
  const onSearchChange = (v: string) => {
    if (inBudgetMode && v.length > 0) clearBudget();
    setQuery(v);
  };

  const goToCheckout = () =>
    navigate("/checkout", { state: { from: "/hospital-list" } });

  const cardProps = {
    cart,
    addToCart,
    updateQty,
    getCartItem,
  };

  // WhatsApp link: build wa.me from the configured number, else fall back
  // to the sitewide WHATSAPP_BASE.
  // Digits-only number: configured number wins, else the sitewide fallback.
  const waDigits = cfg.whatsapp_number
    ? String(cfg.whatsapp_number).replace(/[^\d]/g, "")
    : WHATSAPP_BASE.replace(/[^\d]/g, "");
  // Optional "other items not listed" block, appended to both WhatsApp messages.
  const customItemsBlock = (() => {
    const lines = customItemsLines(customItems);
    return lines.length
      ? `\n\n*Other items I'd like (not listed):*\n${lines.map((l) => `- ${l}`).join("\n")}`
      : "";
  })();
  const waHref = `https://wa.me/${waDigits}?text=${encodeURIComponent("Hi BundledMum, I need help building my hospital bag." + customItemsBlock)}`;

  // Exit-intent WhatsApp message: the current cart grouped by the page's
  // sections (skipping empties), or a generic purchase note when empty.
  const buildExitWhatsAppHref = (): string => {
    const bySection: Record<SectionKey, string[]> = { baby: [], mother: [], hospital: [] };
    (cart || []).forEach((line: any) => {
      const key = SECTION_KEY_OF({ section: line.section ?? null, category: line.category ?? null });
      bySection[key].push(`- ${line.name} x${line.qty}`);
    });
    const hasItems = SECTION_KEY_ORDER.some((k) => bySection[k].length > 0);
    let message: string;
    if (hasItems) {
      const parts: string[] = ["Hi BundledMum, I'd like to purchase these items from my hospital list:", ""];
      SECTION_KEY_ORDER.forEach((k) => {
        if (!bySection[k].length) return;
        parts.push(`*${sectionHeading(k)}*`);
        parts.push(...bySection[k]);
        parts.push("");
      });
      parts.push("Please help me complete my order.");
      message = parts.join("\n");
    } else {
      message = "Hi BundledMum, I'd like to purchase my delivery items. Please help me get started.";
    }
    return `https://wa.me/${waDigits}?text=${encodeURIComponent(message + customItemsBlock)}`;
  };

  const whatsappLink = cfg.whatsapp_enabled ? (
    <a
      href={waHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => { try { sessionStorage.setItem(HL_WA_USED_KEY, "1"); } catch { /* ignore */ } trackHL("whatsapp_click", { source: "main_button" }); }}
      className="text-center text-forest font-semibold underline underline-offset-4 py-2"
    >
      {cfg.whatsapp_label}
    </a>
  ) : null;

  // Admin can disable the whole page.
  if (configLoaded && !cfg.page_enabled) {
    return (
      <div className="min-h-screen bg-background pt-[68px] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-forest leading-tight">{cfg.heading}</h1>
        <p className="text-base text-text-med">This page is currently unavailable. Please check back soon.</p>
        {whatsappLink}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-[68px]">
      {/* Heading + helper */}
      <header className="px-4 pt-5 pb-3 max-w-screen-sm mx-auto">
        <h1 className="text-2xl font-bold text-forest leading-tight">{cfg.heading}</h1>
        <p className="text-base text-text-med mt-1">{cfg.subheading}</p>
      </header>

      {/* Budget builder (Change 1) — collapsed behind an "I have a budget" toggle */}
      {cfg.budget_enabled && (
      <div className="px-4 max-w-screen-sm mx-auto">
        <button
          type="button"
          onClick={() => setBudgetOpen((v) => { if (!v) trackHL("budget_toggle_open"); return !v; })}
          aria-expanded={budgetOpen}
          className="w-full flex items-center justify-between gap-2 bg-forest-light/60 border border-forest/20 rounded-card px-4 py-3 text-sm font-semibold text-forest hover:bg-forest-light transition-colors"
        >
          <span className="inline-flex items-center gap-2"><Wallet className="w-4 h-4" /> I have a budget</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${budgetOpen ? "rotate-180" : ""}`} />
        </button>
        {budgetOpen && (
        <div className="bg-forest-light/60 border border-forest/20 rounded-card p-3 mt-2">
          <label htmlFor="budget" className="block text-sm font-semibold text-forest mb-1.5">
            {cfg.budget_prompt_label}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-med font-semibold pointer-events-none">
                ₦
              </span>
              <input
                id="budget"
                type="text"
                inputMode="numeric"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value.replace(/[^\d,]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyBudget();
                }}
                placeholder="e.g. 150,000"
                className="w-full h-12 pl-7 pr-3 rounded-pill border-2 border-border bg-card text-base text-text-dark placeholder:text-text-light focus:border-forest focus:outline-none"
                aria-label="Budget amount in naira"
              />
            </div>
            <button
              type="button"
              onClick={applyBudget}
              disabled={budgetLoading}
              className="h-12 px-4 rounded-pill bg-forest text-primary-foreground font-semibold text-sm hover:bg-forest-deep disabled:opacity-50 whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <Wallet className="w-4 h-4" />
              {budgetLoading ? "Building…" : "Build my bag"}
            </button>
          </div>
        </div>
        )}
      </div>
      )}

      {/* Sticky search — pinned just below the fixed sitewide navbar */}
      <div
        className="sticky z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 mt-3"
        style={{ top: navBottom }}
      >
        <div className="max-w-screen-sm mx-auto relative">
          <Search className="w-5 h-5 text-text-light absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={cfg.search_placeholder}
            className="w-full h-12 pl-11 pr-11 rounded-pill border-2 border-border bg-card text-base text-text-dark placeholder:text-text-light focus:border-forest focus:outline-none"
            aria-label="Search products"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-text-med"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Product list — pad the bottom so the sticky bar never covers the last card */}
      <main className="max-w-screen-sm mx-auto px-4 pt-4 pb-40 md:pb-36 grid grid-cols-1 gap-4">
        {inBudgetMode ? (
          // ── Budget-fitted results (flat) ────────────────────────────
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-text-dark">
                {budgetLoading
                  ? "Building your bag…"
                  : (budgetItems as HLBudgetItem[]).length === 0
                  ? `We couldn’t fit a bag into ${fmt(budgetAmount || 0)}. Try a higher amount.`
                  : (
                    <>
                      {String(cfg.budget_summary_template)
                        .split("{budget}").join(fmt(budgetAmount || 0))
                        .split("{count}").join(String(budgetCount))
                        .split("{total}").join(fmt(budgetTotal))}
                      {budgetTotal > (budgetAmount || 0) && (
                        <span className="block text-text-med text-xs mt-0.5">
                          (A little over — these are the essentials and they have a price floor.)
                        </span>
                      )}
                    </>
                  )}
              </p>
              <button
                type="button"
                onClick={clearBudget}
                className="shrink-0 text-sm text-forest font-semibold underline underline-offset-2"
              >
                Clear
              </button>
            </div>
            {(budgetItems as HLBudgetItem[]).map((p) => (
              <ProductCard
                key={`${p.product_id}-${p.brand_id}`}
                product={p}
                canSwap={multiBrandIds.has(p.product_id)}
                sizes={sizesByProduct.get(p.product_id) || []}
                colors={colorsByProduct.get(p.product_id) || []}
                initialQty={p.quantity || 1}
                {...cardProps}
              />
            ))}
          </div>
        ) : loading ? (
          <p className="text-center text-text-med py-12">Loading…</p>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-dark font-semibold">No matches for “{debounced}”.</p>
            <p className="text-text-med mt-1">{cfg.empty_state_text}</p>
          </div>
        ) : isSearching ? (
          // Flat result list while searching.
          <div className="grid grid-cols-1 gap-4">
            {products.map((p) => (
              <ProductCard
                key={`${p.product_id}-${p.brand_id}`}
                product={p}
                canSwap={multiBrandIds.has(p.product_id)}
                sizes={sizesByProduct.get(p.product_id) || []}
                colors={colorsByProduct.get(p.product_id) || []}
                {...cardProps}
              />
            ))}
          </div>
        ) : (
          // Grouped default view: tab filter, then green-banded sections.
          <>
            {/* Section tab filter (Change 3) */}
            {cfg.tabs_enabled && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by section">
              {tabs.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setActiveTab(t.key); trackHL("section_tab", { tab: t.key }); }}
                    className={`h-10 px-4 rounded-pill text-sm font-semibold border-2 transition-colors ${
                      active
                        ? "bg-forest text-primary-foreground border-forest"
                        : "bg-card text-text-med border-border"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            )}

            {visibleSections.map((sec) => (
              <section key={sec.key} className="grid grid-cols-1 gap-4">
                <div className="bg-forest border-t-4 border-forest-deep px-5 py-2.5 rounded-t-card -mb-1">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-primary-foreground">
                    {sec.heading}
                  </h2>
                </div>
                {sec.rows.map((p) => (
                  <ProductCard
                    key={`${p.product_id}-${p.brand_id}`}
                    product={p}
                    canSwap={multiBrandIds.has(p.product_id)}
                    sizes={sizesByProduct.get(p.product_id) || []}
                    colors={colorsByProduct.get(p.product_id) || []}
                    {...cardProps}
                  />
                ))}
              </section>
            ))}
          </>
        )}

        {/* Other items not listed — free text, unpriced; carried to checkout +
            WhatsApp. Never affects any total. */}
        <div className="bg-card border border-border rounded-card p-3" style={{ backgroundColor: "#FFF8F4" }}>
          <label htmlFor="hl-custom-items" className="block text-sm font-semibold text-forest mb-1">
            Need something that's not listed?
          </label>
          <p className="text-xs text-text-med mb-2">
            Add any other items you'd like, and describe them in as much detail as you can (brand, size, quantity, anything helpful). Go ahead and check out, we'll receive your list and reach out with the prices for these extras.
          </p>
          <textarea
            id="hl-custom-items"
            value={customItems}
            onFocus={() => { if (!customItemsFocusedRef.current) { customItemsFocusedRef.current = true; trackHL("custom_items_focused"); } }}
            onChange={(e) => { setCustomItems(e.target.value); setCustomItemsRequest(e.target.value); }}
            rows={3}
            placeholder={"e.g.\nNursing pillow (medium)\nBaby nail clippers x2"}
            className="w-full rounded-card border-2 border-border bg-card text-sm text-text-dark placeholder:text-text-light focus:border-forest focus:outline-none p-3 resize-y"
          />
        </div>

        {/* Keep-shopping: same global cart, so the hospital-bag items are
            preserved when the customer adds more from the storefront. */}
        {cfg.add_more_enabled && (
          <Link
            to={cfg.add_more_path}
            onClick={() => trackHL("add_more_click")}
            className="min-h-12 inline-flex items-center justify-center gap-2 rounded-pill border-2 border-forest text-forest font-semibold text-base px-5 hover:bg-forest-light transition-colors"
          >
            <ShoppingBag className="w-4 h-4" /> {cfg.add_more_label}
          </Link>
        )}

        {/* WhatsApp fallback */}
        {whatsappLink}
      </main>

      {/* Persistent sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
        {/* Checkout row. On MOBILE a round WhatsApp secondary action (label
            stacked above the button) sits on the left; the primary CORAL
            "View Bag / Checkout" button stays dominant on the right. The
            WhatsApp message + source:'sticky_button' tracking are unchanged
            (reuse buildExitWhatsAppHref()). The round control is md:hidden so
            desktop keeps the original [Your bag][checkout] layout. */}
        <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center gap-3">
          {cfg.whatsapp_enabled && (
            <div className="md:hidden flex flex-col items-center shrink-0">
              <span className="text-[10px] font-semibold text-text-med leading-tight text-center mb-1 max-w-[64px]">
                {totalItems > 0 ? "Checkout via WhatsApp" : "Order via WhatsApp"}
              </span>
              <a
                href={buildExitWhatsAppHref()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackHL("whatsapp_click", { source: "sticky_button" })}
                aria-label={totalItems > 0 ? "Checkout via WhatsApp" : "Order via WhatsApp"}
                className="w-12 h-12 active:scale-95 transition-transform block"
              >
                <svg viewBox="0 0 48 48" className="w-full h-full" aria-hidden="true">
                  <path fill="#25D366" d="M4.868 43.303l2.694-9.835A18.96 18.96 0 0 1 5.029 24C5.034 13.5 13.58 4.957 24.077 4.957c5.092.002 9.873 1.985 13.467 5.583a18.93 18.93 0 0 1 5.575 13.476c-.004 10.497-8.552 19.041-19.044 19.041h-.008a19.05 19.05 0 0 1-9.105-2.319l-10.094 2.565zM15.015 37.71l.578.343a15.83 15.83 0 0 0 8.067 2.208h.006c8.724 0 15.825-7.099 15.828-15.825a15.71 15.71 0 0 0-4.633-11.197 15.73 15.73 0 0 0-11.194-4.642c-8.731 0-15.832 7.099-15.835 15.824a15.78 15.78 0 0 0 2.418 8.43l.376.6L9.03 39.27l5.985-1.56z"/>
                  <path fill="#FFFFFF" d="M28.665 26.083c-.41-.205-2.42-1.193-2.795-1.33-.375-.137-.648-.205-.92.205-.273.41-1.056 1.33-1.295 1.603-.239.273-.477.307-.886.102-.41-.205-1.728-.637-3.291-2.03-1.216-1.085-2.037-2.424-2.276-2.834-.239-.41-.025-.631.18-.835.184-.184.41-.478.614-.717.205-.239.273-.41.41-.683.137-.273.068-.512-.034-.717-.102-.205-.92-2.219-1.262-3.04-.332-.797-.67-.69-.92-.702-.239-.012-.512-.014-.785-.014-.273 0-.717.102-1.092.512-.375.41-1.432 1.398-1.432 3.413 0 2.014 1.466 3.96 1.671 4.232.205.273 2.886 4.408 6.992 6.182.978.422 1.74.674 2.335.863.98.312 1.873.268 2.578.163.787-.118 2.42-.989 2.762-1.945.341-.956.341-1.775.239-1.945-.102-.171-.375-.273-.785-.478z"/>
                  <path fill="#25D366" d="M24.014 11.535c-6.88 0-12.479 5.595-12.482 12.473a12.43 12.43 0 0 0 1.905 6.634l.296.47-1.257 4.591 4.71-1.235.455.27a12.46 12.46 0 0 0 6.346 1.738h.005c6.876 0 12.475-5.6 12.478-12.477a12.4 12.4 0 0 0-3.654-8.825 12.4 12.4 0 0 0-8.802-3.659z"/>
                  <path fill="#FFFFFF" d="M28.665 26.083c-.41-.205-2.42-1.193-2.795-1.33-.375-.137-.648-.205-.92.205-.273.41-1.056 1.33-1.295 1.603-.239.273-.477.307-.886.102-.41-.205-1.728-.637-3.291-2.03-1.216-1.085-2.037-2.424-2.276-2.834-.239-.41-.025-.631.18-.835.184-.184.41-.478.614-.717.205-.239.273-.41.41-.683.137-.273.068-.512-.034-.717-.102-.205-.92-2.219-1.262-3.04-.332-.797-.67-.69-.92-.702-.239-.012-.512-.014-.785-.014-.273 0-.717.102-1.092.512-.375.41-1.432 1.398-1.432 3.413 0 2.014 1.466 3.96 1.671 4.232.205.273 2.886 4.408 6.992 6.182.978.422 1.74.674 2.335.863.98.312 1.873.268 2.578.163.787-.118 2.42-.989 2.762-1.945.341-.956.341-1.775.239-1.945-.102-.171-.375-.273-.785-.478z"/>
                </svg>
              </a>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-med leading-none">Your bag</p>
            <p className="text-base font-bold text-text-dark leading-tight mt-0.5">
              {totalItems} {totalItems === 1 ? "item" : "items"} · {fmt(subtotal)}
            </p>
          </div>
          <button
            type="button"
            disabled={totalItems === 0}
            onClick={goToCheckout}
            className="h-12 px-5 rounded-pill text-white font-semibold text-base hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            style={{ backgroundColor: "#F4845F" }}
          >
            View Bag / Checkout
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)] bg-card" />
      </div>

      {/* Exit-intent WhatsApp popup — DESKTOP ONLY (mobile uses the sticky
          WhatsApp button above). Respects whatsapp_enabled. */}
      {!isMobile && (
        <HospitalListExitPopup enabled={!!cfg.whatsapp_enabled} getWhatsAppHref={buildExitWhatsAppHref} />
      )}
    </div>
  );
}

// ── Product card ─────────────────────────────────────────────────────
interface ProductCardProps {
  product: HLProduct;
  canSwap: boolean;
  sizes?: string[];
  colors?: ColorOption[];
  initialQty?: number;
  cart: ReturnType<typeof useCart>["cart"];
  addToCart: ReturnType<typeof useCart>["addToCart"];
  updateQty: ReturnType<typeof useCart>["updateQty"];
  getCartItem: ReturnType<typeof useCart>["getCartItem"];
}

// If a product has more sizes than this, use a dropdown instead of chips
// (e.g. Nursing Bra spans S–8XL).
const SIZE_CHIP_LIMIT = 5;

function ProductCard({
  product,
  canSwap,
  sizes = [],
  colors = [],
  initialQty = 1,
  addToCart,
  updateQty,
  getCartItem,
}: ProductCardProps) {
  // The brand this card currently offers — starts as the RPC default.
  const [chosen, setChosen] = useState<ChosenBrand>({
    id: product.brand_id || "",
    brand_name: product.brand_name,
    price: product.price,
    image_url: product.image_url,
  });
  const [options, setOptions] = useState<BrandOption[] | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const fetchedRef = useRef(false);

  // Variant selections — NEVER auto-picked. Empty = unchosen. A product that
  // has sizes and/or colors can't be added until the required one(s) are set.
  const hasSizes = sizes.length > 0;
  const hasColors = colors.length > 0;
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const variantMissing = (hasSizes && !selectedSize) || (hasColors && !selectedColor);

  const hasMultiple = canSwap;

  // Eagerly load the in-stock brand list for multi-brand products so the
  // brand dropdown is always populated (no show/hide step). Read from
  // brands_public — the anon-safe view the storefront uses (raw `brands`
  // is RLS-blocked for anon). Prefer the CORS-safe stored image copy.
  useEffect(() => {
    if (!hasMultiple || fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("brands_public")
        .select("id, brand_name, price, in_stock, image_url, stored_image_url")
        .eq("product_id", product.product_id)
        .eq("in_stock", true)
        .order("price", { ascending: true });
      if (error) {
        console.warn("brand options fetch failed:", error);
        setOptions([]);
        return;
      }
      const mapped = ((data || []) as any[]).map((b) => ({
        id: b.id,
        brand_name: b.brand_name,
        price: b.price,
        image_url:
          b.stored_image_url && String(b.stored_image_url).trim() !== ""
            ? b.stored_image_url
            : b.image_url,
      })) as BrandOption[];
      setOptions(mapped);
    })();
  }, [hasMultiple, product.product_id]);

  // Look up the cart row for THIS exact (brand, size, color) combination so
  // the stepper tracks the chosen variant, mirroring the storefront.
  const cartRow = getCartItem(product.product_id, {
    brandId: chosen.id,
    size: selectedSize || null,
    color: selectedColor || null,
  });
  const qty = cartRow?.qty ?? 0;

  const buildItem = () => ({
    id: product.product_id,
    name: chosen.brand_name ? `${product.name} (${chosen.brand_name})` : product.name,
    price: chosen.price,
    category: product.category,
    subcategory: product.subcategory,
    image_url: chosen.image_url,
    imageUrl: chosen.image_url,
    // Same cart fields the storefront uses → checkout maps these to
    // order_items.size / order_items.color with no extra plumbing.
    selectedSize: selectedSize || null,
    selectedColor: selectedColor || null,
    selectedBrand: {
      id: chosen.id,
      label: chosen.brand_name || "Standard",
      price: chosen.price,
      image_url: chosen.image_url,
      inStock: true,
    },
  });

  // First add seeds the budget-fitted quantity (initialQty); afterwards the
  // stepper drives the count. Subsequent taps just bump by one.
  const handleAdd = () => {
    if (variantMissing) return; // required size/colour not chosen yet
    if (cartRow) {
      updateQty(cartRow._key, cartRow.qty + 1);
      return;
    }
    addToCart(buildItem());
    if (initialQty > 1) {
      updateQty(
        cartItemKey(product.product_id, chosen.id, selectedSize || null, selectedColor || null),
        initialQty,
      );
    }
  };
  const handleInc = () => {
    if (cartRow) updateQty(cartRow._key, cartRow.qty + 1);
    else handleAdd();
  };
  const handleDec = () => {
    if (cartRow) updateQty(cartRow._key, cartRow.qty - 1); // 0 removes
  };

  const img = chosen.image_url || PLACEHOLDER;

  const canZoom = !!chosen.image_url;

  return (
    <div className="bg-card rounded-card shadow-card border border-border p-3 flex gap-3 items-start">
      <button
        type="button"
        onClick={() => canZoom && setZoomOpen(true)}
        disabled={!canZoom}
        aria-label={`View larger image of ${product.name}`}
        className="shrink-0 rounded-lg overflow-hidden bg-[#f5f5f5] disabled:cursor-default enabled:cursor-zoom-in"
      >
        <img
          src={img}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
          }}
          className="w-16 h-16 object-cover block"
        />
      </button>
      {zoomOpen && (
        <ImageZoomModal
          src={chosen.image_url}
          alt={product.name}
          caption={product.name}
          onClose={() => setZoomOpen(false)}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-text-dark leading-snug">{product.name}</p>
        <p className="text-lg font-bold text-forest mt-0.5">{fmt(chosen.price)}</p>

        {/* Size selector — chips, or a dropdown when there are many. Never
            pre-selected; the customer must choose before Add unlocks. */}
        {hasSizes && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-text-med uppercase tracking-wide mb-1">
              Size{!selectedSize && <span className="text-coral normal-case"> — choose one</span>}
            </p>
            {sizes.length > SIZE_CHIP_LIMIT ? (
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                aria-label={`Choose size for ${product.name}`}
                className="w-full h-10 px-3 rounded-lg border-2 border-border bg-card text-sm text-text-dark focus:border-forest focus:outline-none"
              >
                <option value="">Select size…</option>
                {sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sizes.map((s) => {
                  const active = selectedSize === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedSize(active ? "" : s)}
                      aria-pressed={active}
                      className={`min-h-10 px-3 py-1.5 rounded-pill text-sm font-semibold border-2 transition-colors ${
                        active
                          ? "border-forest bg-forest text-primary-foreground"
                          : "border-border bg-card text-text-med"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Color selector — swatch chips (color_hex + color_name). */}
        {hasColors && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-text-med uppercase tracking-wide mb-1">
              Color{!selectedColor && <span className="text-coral normal-case"> — choose one</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {colors.map((c) => {
                const active = selectedColor === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setSelectedColor(active ? "" : c.name)}
                    aria-pressed={active}
                    className={`min-h-10 pl-1.5 pr-3 py-1 rounded-pill text-sm font-semibold border-2 inline-flex items-center gap-1.5 transition-colors ${
                      active
                        ? "border-forest bg-forest-light text-forest"
                        : "border-border bg-card text-text-med"
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-black/10 shrink-0"
                      style={{ backgroundColor: c.hex || "#e5e5e5" }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Brand selector — always-visible dropdown for multi-brand
            products. Selecting drives the card price + image and the
            brand added to cart. */}
        {hasMultiple && (
          <div className="mt-2">
            <label className="block text-xs font-semibold text-text-med uppercase tracking-wide mb-1">
              Other Options
            </label>
            <select
              value={chosen.id}
              disabled={!options}
              onChange={(e) => {
                const b = options?.find((o) => o.id === e.target.value);
                if (b) {
                  setChosen({
                    id: b.id,
                    brand_name: b.brand_name,
                    price: b.price,
                    // Fall back to the product/default image if the brand has none.
                    image_url: b.image_url || product.image_url,
                  });
                }
              }}
              aria-label={`Choose option for ${product.name}`}
              className="w-full h-11 px-3 rounded-lg border-2 border-border bg-card text-sm text-text-dark focus:border-forest focus:outline-none disabled:opacity-60"
            >
              {options ? (
                options.map((b) => (
                  <option key={b.id} value={b.id}>
                    {(b.brand_name || "Standard") + " — " + fmt(b.price)}
                  </option>
                ))
              ) : (
                <option value={chosen.id}>{chosen.brand_name || "Standard"}</option>
              )}
            </select>
          </div>
        )}
      </div>

      {/* Add → stepper */}
      <div className="shrink-0">
        {qty === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            disabled={variantMissing}
            title={variantMissing ? "Choose a size/color first" : undefined}
            className="h-12 min-w-[72px] px-4 rounded-pill bg-forest text-primary-foreground font-semibold text-base hover:bg-forest-deep inline-flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Add ${product.name}`}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        ) : (
          <div className="flex items-center gap-1 h-12">
            <button
              type="button"
              onClick={handleDec}
              aria-label="Remove one"
              className="w-12 h-12 rounded-full border-2 border-forest text-forest flex items-center justify-center"
            >
              <Minus className="w-5 h-5" />
            </button>
            <span className="w-8 text-center text-lg font-bold text-text-dark" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              onClick={handleInc}
              aria-label="Add one"
              className="w-12 h-12 rounded-full bg-forest text-primary-foreground flex items-center justify-center"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
