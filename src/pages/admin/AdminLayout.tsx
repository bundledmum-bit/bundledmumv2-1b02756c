import { useEffect, useState, useMemo } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { AdminPermissionsProvider, usePermissions } from "@/hooks/useAdminPermissionsContext";
import IdleTimeoutGuard from "@/components/admin/IdleTimeoutGuard";
import { useQuery } from "@tanstack/react-query";
import { usePendingApprovalsCount } from "@/hooks/useApprovals";
import {
  Package, ShoppingBag, ClipboardList, Truck, MessageSquare, Settings,
  BarChart3, Gift, LogOut, LayoutDashboard, FileText, Users, Image, Bell,
  Search, X, Menu, ChevronLeft, ChevronDown, MessageCircleQuestion, Workflow, Mail, Rocket,
  Smartphone, Banknote, Gavel, Coins, ClipboardCheck, ListTree, Contact, Star, ShoppingCart,
  Inbox, Video, FolderOpen, Wrench, CreditCard, Clock, Film, Search as SearchIcon, PhoneCall,
  type LucideIcon,
} from "lucide-react";
import { Tag, Boxes, MapPin, FileText as PageIcon, Layout, Shield, ShieldCheck, RotateCcw, Megaphone } from "lucide-react";
import logoWhite from "@/assets/logos/BM-LOGO-WHITE.svg";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import AdminMobileBottomNav from "@/components/admin/AdminMobileBottomNav";

// Map icon-name strings stored on admin_nav_items.icon to lucide components.
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Package, Boxes, ShoppingBag, ClipboardList, Users, Tag,
  Gift, Truck, MapPin, MessageSquare, FileText, Image, MessageCircleQuestion,
  Workflow, BarChart3, Settings, Mail, Rocket,
  Layout, Shield, ShieldCheck, RotateCcw, Megaphone,
  PageIcon, // alias
};

// Per-nav_key fallback for rows whose icon column is null or unrecognised.
// We never want a missing icon to silently drop a sidebar item — this map
// gives stable defaults for known nav keys, and getIcon() falls through to
// LayoutDashboard for anything else so the link always renders.
const NAV_KEY_ICON_MAP: Record<string, LucideIcon> = {
  admin_users: Shield,
  delivery: Truck,
};

function getIcon(iconName: string | null, navKey?: string): LucideIcon {
  if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
  if (navKey && NAV_KEY_ICON_MAP[navKey]) return NAV_KEY_ICON_MAP[navKey];
  return LayoutDashboard;
}

interface NavItemFromDB {
  nav_key: string;
  label: string;
  icon: string | null;
  path: string;
  parent_key: string | null;
  display_order: number;
  is_built: boolean;
}

function AdminLayoutInner() {
  const { isAdmin, isAdminLoading, loading, signOut, user } = useAdmin();
  const { can, adminUser } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  
  
  const isSuperAdmin = adminUser?.role === "super_admin";
  const { data: pendingApprovalsCount } = usePendingApprovalsCount(isSuperAdmin);

  // Context switcher: two worlds, one login. The marketplace world is only
  // offered to admins who can manage the marketplace, and the active world is
  // derived from the path so the nav swaps as soon as you enter a marketplace
  // route. The storefront world is unchanged for everyone.
  const canMarketplace = can("marketplace", "manage");
  const world: "bundledmum" | "marketplace" =
    location.pathname.startsWith("/admin/marketplace") ? "marketplace" : "bundledmum";
  const { data: mktPendingCount } = useQuery({
    queryKey: ["mkt-pending-review-count"],
    queryFn: async () => {
      const { count } = await (supabase as unknown as { from: (t: string) => any })
        .from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review");
      return count ?? 0;
    },
    enabled: canMarketplace,
    staleTime: 30000,
  });
  /**
   * The marketplace sidebar, grouped rather than flat.
   *
   * It had grown to 21 items appended one at a time, 821px of rail in a
   * 603px viewport, with six of them sharing a placeholder ShoppingCart
   * icon because each was added to the end without deciding where it
   * belonged. The grouping is by WHY YOU OPEN IT, not by which entity it
   * touches: almost everything here touches listings or orders, which is
   * exactly why entity-grouping produced a flat list.
   *
   * WHERE A NEW ITEM GOES. First rule that matches wins:
   *   1. shows a count that should reach zero      -> Queues
   *      ...and clearing it means messaging someone -> Follow up
   *   2. you open it to find one known thing        -> Records
   *   3. money in or out                            -> Money
   *   4. changes behaviour for everyone             -> Setup
   *   5. read to decide, never to act               -> top level, alone
   * If two match, ask which would make you open it at 9am.
   *
   * And the rules that stop it drifting back:
   *   - a group needs TWO members; one child stays top level
   *   - six children means it is really two groups
   *   - a reused generic icon means the item was appended without deciding
   *   - ADD TO A GROUP, never to the end. If nothing fits, that is evidence
   *     for a new group, not permission to append.
   *
   * A group may itself be a link (`to`), for when the parent is the general
   * case and the children are the specific ones: "Follow up" is the whole
   * outreach queue, and the three under it are slices of it.
   */
  type MktNavItem = { label: string; to: string; icon: LucideIcon; exact?: boolean; badge?: number };
  type MktNavEntry = MktNavItem & { children?: MktNavItem[] };

  const MARKETPLACE_NAV: MktNavEntry[] = [
    { label: "Dashboard", to: "/admin/marketplace", icon: LayoutDashboard, exact: true },
    // Out of Queues on purpose: it is the first thing opened most days, so
    // it earns a top-level row of its own directly under Dashboard.
    { label: "Review queue", to: "/admin/marketplace/review", icon: ClipboardCheck, badge: mktPendingCount },
    {
      label: "Queues", to: "/admin/marketplace/payouts", icon: Inbox,
      children: [
        { label: "Payout queue", to: "/admin/marketplace/payouts", icon: Banknote },
        { label: "Disputes", to: "/admin/marketplace/disputes", icon: Gavel },
        { label: "Returns", to: "/admin/marketplace/returns", icon: RotateCcw },
      ],
    },
    {
      // The parent IS the general outreach queue; the children are slices.
      label: "Follow up", to: "/admin/marketplace/outreach", icon: Megaphone,
      children: [
        { label: "Everyone to chase", to: "/admin/marketplace/outreach", icon: Megaphone },
        { label: "Did not finish paying", to: "/admin/marketplace/pending-payments", icon: CreditCard },
        { label: "Abandoned checkouts", to: "/admin/marketplace/abandoned", icon: ShoppingCart },
        { label: "Waiting on the buyer", to: "/admin/marketplace/awaiting-confirmation", icon: Clock },
      ],
    },
    {
      label: "Video", to: "/admin/marketplace/needs-video", icon: Video,
      children: [
        { label: "Listings with no video", to: "/admin/marketplace/needs-video", icon: Video },
        { label: "Videos to check", to: "/admin/marketplace/videos-to-review", icon: Film },
      ],
    },
    {
      label: "Records", to: "/admin/marketplace/sellers", icon: FolderOpen,
      children: [
        { label: "Sellers", to: "/admin/marketplace/sellers", icon: Users },
        { label: "Buyers", to: "/admin/marketplace/buyers", icon: Contact },
        { label: "Listings", to: "/admin/marketplace/listings", icon: Tag },
        { label: "Orders", to: "/admin/marketplace/orders", icon: ShoppingBag },
      ],
    },
    {
      label: "Money", to: "/admin/marketplace/money-owed", icon: Coins,
      children: [
        { label: "Money owed", to: "/admin/marketplace/money-owed", icon: Coins },
        { label: "Finance", to: "/admin/marketplace/finance", icon: BarChart3 },
      ],
    },
    // Read to decide, never to act on, and the only one of its kind. A group
    // of one is worse than no group, so it stays top level until a second
    // insight screen exists.
    { label: "What buyers searched for", to: "/admin/marketplace/search-demand", icon: SearchIcon },
    {
      label: "Setup", to: "/admin/marketplace/settings", icon: Wrench,
      children: [
        { label: "Categories", to: "/admin/marketplace/categories", icon: ListTree },
        { label: "Featured categories", to: "/admin/marketplace/featured-categories", icon: Star },
        { label: "Settings", to: "/admin/marketplace/settings", icon: Settings },
      ],
    },
  ];
  const [mobileOpen, setMobileOpen] = useState(false);
  // Which marketplace nav groups the user has explicitly opened or closed.
  // Unset means "follow the current page", so the group holding the current
  // screen opens by itself and nobody has to remember where a screen lives.
  const [openMktGroups, setOpenMktGroups] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch nav items exclusively from get_admin_nav RPC. Always considered
  // stale + refetched on mount so a newly-built page (is_built flipped from
  // false to true), a permission grant elsewhere, or a server-side function
  // update reflects in the sidebar without a hard refresh.
  // The QueryClient's 5-minute default staleTime is overridden here on
  // purpose — nav freshness matters more than network savings.
  const { data: dbNavItems, refetch: refetchNav } = useQuery({
    queryKey: ["admin-nav-items", adminUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_nav");
      if (error) throw error;
      return (data as unknown as NavItemFromDB[]) || [];
    },
    enabled: !!adminUser,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (adminUser) refetchNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Path corrections for DB entries that don't match actual routes
  const PATH_FIXES: Record<string, string> = {
    "/admin/quiz": "/admin/quiz-engine",
  };

  // Build visible nav as a TREE — top-level entries each carry a `children`
  // array. Children are NEVER rendered at the top level; they only appear
  // nested when their parent is expanded. Orphan children (parent_key set
  // but parent not in the top-level set) get promoted to top-level so
  // they're never dropped.
  // get_admin_nav() is the single source of truth for which items the
  // current user can see — no client-side filtering on top.
  type NavEntry = {
    to: string;
    label: string;
    icon: LucideIcon;
    exact: boolean;
    navKey: string;
  };
  type NavTreeEntry = NavEntry & { children: NavEntry[] };

  const visibleNav = useMemo<NavTreeEntry[]>(() => {
    if (!dbNavItems) return [];
    // Drop unbuilt items entirely — they should never appear in the
    // sidebar (no page exists behind them yet). Filter before any
    // tree-building so unbuilt parents don't orphan their children either.
    const builtItems = dbNavItems.filter(item => item.is_built === true);
    const toEntry = (item: NavItemFromDB): NavEntry => {
      const resolvedPath = PATH_FIXES[item.path] || item.path;
      return {
        to: resolvedPath,
        label: item.label,
        icon: getIcon(item.icon, item.nav_key),
        exact: resolvedPath === "/admin",
        navKey: item.nav_key,
      };
    };

    const sortByOrder = (a: NavItemFromDB, b: NavItemFromDB) =>
      (a.display_order || 0) - (b.display_order || 0);

    const topLevel = builtItems.filter(i => !i.parent_key).sort(sortByOrder);
    const topLevelKeys = new Set(topLevel.map(t => t.nav_key));

    // Group children under their parent.
    const childMap: Record<string, NavItemFromDB[]> = {};
    for (const item of builtItems) {
      if (!item.parent_key) continue;
      if (!childMap[item.parent_key]) childMap[item.parent_key] = [];
      childMap[item.parent_key].push(item);
    }
    Object.values(childMap).forEach(arr => arr.sort(sortByOrder));

    const tree: NavTreeEntry[] = topLevel.map(parent => ({
      ...toEntry(parent),
      children: (childMap[parent.nav_key] || []).map(toEntry),
    }));

    // Orphans — promote to top-level (no children, sorted by display_order).
    const orphanItems = builtItems
      .filter(i => i.parent_key && !topLevelKeys.has(i.parent_key))
      .sort(sortByOrder);
    for (const o of orphanItems) {
      tree.push({ ...toEntry(o), children: [] });
    }

    return tree;
  }, [dbNavItems]);

  // The DB nav is the source of truth, but the Push Notifications page is a
  // frontend addition (no admin_nav_items row / not yet is_built). Append a
  // static entry when the user can see settings and the DB nav doesn't already
  // include it, so it's discoverable without duplicating a seeded row.
  const navTree = useMemo<NavTreeEntry[]>(() => {
    const base = visibleNav;
    const extras: NavTreeEntry[] = [];

    const hasPush = base.some(
      (e) => e.to === "/admin/push" || e.navKey === "push_notifications" || e.children.some((c) => c.to === "/admin/push"),
    );
    const canSeePush = isSuperAdmin || can("settings", "view") || can("settings", "manage");
    if (!hasPush && canSeePush) {
      extras.push({ to: "/admin/push", label: "Push Notifications", icon: Bell, exact: false, navKey: "push_notifications", children: [] });
    }

    // Deals management (curated deal products + deals storefront settings).
    const hasDeals = base.some((e) => e.to === "/admin/deals" || e.navKey === "deals");
    const canSeeDeals = isSuperAdmin || can("promotions", "view") || can("promotions", "manage") || can("content", "edit_settings");
    if (!hasDeals && canSeeDeals) {
      extras.push({ to: "/admin/deals", label: "Deals", icon: Tag, exact: false, navKey: "deals", children: [] });
    }

    // Homepage content (hero slides, category tiles, most-loved brands).
    const hasHome = base.some((e) => e.to === "/admin/home-content" || e.navKey === "home_content");
    const canSeeHome = isSuperAdmin || can("content", "edit_settings") || can("content", "view");
    if (!hasHome && canSeeHome) {
      extras.push({ to: "/admin/home-content", label: "Homepage", icon: Layout, exact: false, navKey: "home_content", children: [] });
    }

    // Cart Data (abandoned carts, checkout drop-offs, checkout errors).
    const hasCartData = base.some((e) => e.to === "/admin/cart-data" || e.navKey === "cart_data");
    const canSeeCartData = isSuperAdmin || can("analytics", "view");
    if (!hasCartData && canSeeCartData) {
      extras.push({ to: "/admin/cart-data", label: "Cart Data", icon: ShoppingBag, exact: false, navKey: "cart_data", children: [] });
    }

    // Follow-ups queue (Day 1/3/5/7 quote follow-up cadence). Frontend page
    // with no admin_nav_items row yet, so append it for anyone who can view
    // quotes.
    const hasFollowups = base.some((e) => e.to === "/admin/followups" || e.navKey === "followups");
    const canSeeFollowups = isSuperAdmin || can("quotes", "view");
    if (!hasFollowups && canSeeFollowups) {
      extras.push({ to: "/admin/followups", label: "Follow-ups", icon: MessageSquare, exact: false, navKey: "followups", children: [] });
    }

    // Image Improvement — temporary tool for re-shooting product photos with AI
    // and reviewing before/after. Frontend page with no admin_nav_items row.
    const hasImageImp = base.some((e) => e.to === "/admin/image-improvement" || e.navKey === "image_improvement");
    const canSeeImageImp = isSuperAdmin || can("products", "edit");
    if (!hasImageImp && canSeeImageImp) {
      extras.push({ to: "/admin/image-improvement", label: "Image Improvement", icon: Image, exact: false, navKey: "image_improvement", children: [] });
    }

    return extras.length ? [...base, ...extras] : base;
  }, [visibleNav, isSuperAdmin, can]);

  // Flat lookup for the search palette (parents + children).
  const flatNav = useMemo<NavEntry[]>(() => {
    const out: NavEntry[] = [];
    for (const p of navTree) {
      out.push({ to: p.to, label: p.label, icon: p.icon, exact: p.exact, navKey: p.navKey });
      for (const c of p.children) out.push(c);
    }
    return out;
  }, [navTree]);

  // Track which parents are user-expanded. A parent auto-expands when the
  // current route matches itself or any of its children.
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const autoExpandedKey = useMemo(() => {
    for (const p of visibleNav) {
      if (p.children.length === 0) continue;
      const path = location.pathname;
      const parentMatch = path === p.to || path.startsWith(p.to + "/");
      const childMatch = p.children.some(c => path === c.to || path.startsWith(c.to + "/"));
      if (parentMatch || childMatch) return p.navKey;
    }
    return null;
  }, [visibleNav, location.pathname]);

  const isExpanded = (navKey: string) =>
    expandedParents.has(navKey) || autoExpandedKey === navKey;
  const toggleExpanded = (navKey: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(navKey)) next.delete(navKey);
      else next.add(navKey);
      return next;
    });
  };

  useEffect(() => {
    if (!adminUser) return;
    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      setNotifications(data || []);
    };
    fetchNotifications();

    const channel = supabase.channel("admin-notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, () => {
        fetchNotifications();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [adminUser]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    // Only redirect once the admin check has fully resolved, so an admin is
    // never bounced mid-check and a non-admin never lingers on the shell.
    if (!loading && !isAdminLoading && !isAdmin) {
      const here = location.pathname + location.search;
      // Avoid an infinite loop if the user is already heading to login.
      if (!location.pathname.startsWith("/admin/login")) {
        navigate(`/admin/login?next=${encodeURIComponent(here)}`);
      } else {
        navigate("/admin/login");
      }
    }
  }, [loading, isAdminLoading, isAdmin, navigate, location.pathname, location.search]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    for (const n of unread) {
      await supabase.from("admin_notifications").update({ is_read: true }).eq("id", n.id);
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // Show the neutral loader while EITHER the session or the admin check is still
  // resolving, so the admin shell never paints before admin status is confirmed.
  if (loading || isAdminLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "transparent" }}>
      <div className="text-center">
        <div className="mx-auto mb-3 flex items-center justify-center">
          <BMLoadingAnimation size={140} />
        </div>
        <div className="text-text-med text-sm font-body">Loading admin...</div>
      </div>
    </div>
  );
  if (!isAdmin) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen flex bg-muted/30">
      <IdleTimeoutGuard />
      <Helmet>
        <link rel="manifest" href="/admin-manifest.webmanifest" />
        <meta name="theme-color" content="#2D6A4F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BM Admin" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Helmet>
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside className={`fixed h-full z-50 flex flex-col transition-transform lg:translate-x-0 w-60 flex-shrink-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ background: "linear-gradient(180deg, #2D6A4F 0%, #1A4A33 100%)" }}>
        
        
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2.5">
            <img src={logoWhite} alt="BundledMum" className="h-7 w-auto" />
          </Link>
          <button className="lg:hidden text-white/60 hover:text-white" onClick={() => setMobileOpen(false)}>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {canMarketplace && (
          <div className="px-3 pt-3">
            <div className="flex rounded-xl p-1 gap-1" style={{ background: "rgba(255,248,244,0.12)" }}>
              <button type="button" onClick={() => navigate("/admin")}
                className="flex-1 text-[12.5px] font-heading font-extrabold py-2 rounded-lg transition"
                style={world === "bundledmum" ? { background: "#FFF8F4", color: "#1A4A33" } : { color: "rgba(255,255,255,0.6)" }}>
                BundledMum
              </button>
              <button type="button" onClick={() => navigate("/admin/marketplace/review")}
                className="flex-1 text-[12.5px] font-heading font-extrabold py-2 rounded-lg transition"
                style={world === "marketplace" ? { background: "#D8EFE5", color: "#1A4A33" } : { color: "rgba(255,255,255,0.6)" }}>
                Marketplace
              </button>
            </div>
          </div>
        )}

        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-4 mb-2">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-[2px]">{world === "marketplace" ? "Marketplace" : "Menu"}</span>
          </div>
          {world === "bundledmum" && navTree.map(item => {
            const isActiveSelf = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to) && item.to !== "/admin";
            const activeExact = item.exact && location.pathname === item.to;
            const active = item.exact ? activeExact : isActiveSelf;
            const hasChildren = item.children.length > 0;
            const expanded = hasChildren && isExpanded(item.navKey);

            return (
              <div key={item.to}>
                {hasChildren ? (
                  <div className="flex items-stretch mx-2 rounded-lg overflow-hidden">
                    <Link to={item.to}
                      className={`flex-1 flex items-center gap-2.5 px-5 py-2 text-[13px] transition-all font-body ${
                        active
                          ? "bg-white/15 text-white font-semibold shadow-sm"
                          : "text-white/60 hover:bg-white/8 hover:text-white/90"
                      }`}>
                      <item.icon className={`w-4 h-4 ${active ? "text-coral" : ""}`} />
                      {item.label}
                    </Link>
                    <button
                      type="button"
                      aria-label={expanded ? "Collapse" : "Expand"}
                      onClick={() => toggleExpanded(item.navKey)}
                      className={`px-2 transition-colors ${
                        active
                          ? "bg-white/15 text-white"
                          : "text-white/40 hover:bg-white/8 hover:text-white/90"
                      }`}>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                ) : (
                  <Link to={item.to}
                    className={`flex items-center gap-2.5 px-5 py-2 text-[13px] transition-all mx-2 rounded-lg font-body ${
                      active
                        ? "bg-white/15 text-white font-semibold shadow-sm"
                        : "text-white/60 hover:bg-white/8 hover:text-white/90"
                    }`}>
                    <item.icon className={`w-4 h-4 ${active ? "text-coral" : ""}`} />
                    {item.label}
                    {item.navKey === "approvals" && isSuperAdmin && (pendingApprovalsCount ?? 0) > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 ml-auto">
                        {pendingApprovalsCount}
                      </span>
                    )}
                    {active && !(item.navKey === "approvals" && isSuperAdmin && (pendingApprovalsCount ?? 0) > 0) && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-coral" />
                    )}
                  </Link>
                )}

                {hasChildren && expanded && (
                  <div className="mx-2 mb-1">
                    {item.children.map(child => {
                      const childActive = location.pathname === child.to ||
                        location.pathname.startsWith(child.to + "/");
                      return (
                        <Link key={child.to} to={child.to}
                          className={`flex items-center gap-2 pl-11 pr-5 py-1.5 text-[12px] transition-all rounded-md font-body ${
                            childActive
                              ? "bg-white/10 text-white font-semibold"
                              : "text-white/50 hover:bg-white/5 hover:text-white/85"
                          }`}>
                          <child.icon className={`w-3.5 h-3.5 ${childActive ? "text-coral" : ""}`} />
                          {child.label}
                          {childActive && <div className="ml-auto w-1 h-1 rounded-full bg-coral" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {world === "marketplace" && MARKETPLACE_NAV.map((m) => {
            const isActive = (to: string, exact?: boolean) => exact
              ? location.pathname === to
              : location.pathname === to || location.pathname.startsWith(to + "/");

            // A plain item: no children, renders exactly as before.
            if (!m.children?.length) {
              const active = isActive(m.to, m.exact);
              return (
                <Link key={m.to} to={m.to}
                  className={`flex items-center gap-2.5 px-5 py-2 text-[13px] transition-all mx-2 rounded-lg font-body ${
                    active
                      ? "bg-white/15 text-white font-semibold shadow-sm"
                      : "text-white/60 hover:bg-white/8 hover:text-white/90"
                  }`}>
                  <m.icon className={`w-4 h-4 ${active ? "text-coral" : ""}`} />
                  {m.label}
                  {m.badge ? (
                    <span className="ml-auto text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: "#F4845F" }}>{m.badge}</span>
                  ) : active ? (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-coral" />
                  ) : null}
                </Link>
              );
            }

            // A group. Open when it holds the current page, so the sidebar
            // always shows where you are without anyone having to remember
            // which group a screen lives in; otherwise open only if toggled.
            const holdsCurrent = m.children.some((c) => isActive(c.to)) || isActive(m.to);
            const open = openMktGroups[m.label] ?? holdsCurrent;

            return (
              <div key={m.label}>
                <button
                  type="button"
                  onClick={() => setOpenMktGroups((g) => ({ ...g, [m.label]: !open }))}
                  aria-expanded={open}
                  className={`w-full flex items-center gap-2.5 px-5 py-2 text-[13px] transition-all mx-2 rounded-lg font-body ${
                    holdsCurrent && !open
                      ? "bg-white/10 text-white/90 font-semibold"
                      : "text-white/60 hover:bg-white/8 hover:text-white/90"
                  }`}>
                  <m.icon className="w-4 h-4" />
                  {m.label}
                  <ChevronDown className={`ml-auto w-3.5 h-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
                </button>

                {open && m.children.map((c) => {
                  const active = isActive(c.to, c.exact);
                  return (
                    <Link key={c.to + c.label} to={c.to}
                      className={`flex items-center gap-2.5 pl-11 pr-5 py-1.5 text-[12.5px] transition-all mx-2 rounded-lg font-body ${
                        active
                          ? "bg-white/15 text-white font-semibold shadow-sm"
                          : "text-white/55 hover:bg-white/8 hover:text-white/90"
                      }`}>
                      <c.icon className={`w-3.5 h-3.5 ${active ? "text-coral" : ""}`} />
                      {c.label}
                      {c.badge ? (
                        <span className="ml-auto text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: "#F4845F" }}>{c.badge}</span>
                      ) : active ? (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-coral" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #F4845F, #D4613C)" }}>
              {adminUser?.display_name?.charAt(0) || user?.email?.charAt(0) || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">{adminUser?.display_name || "Admin"}</div>
              <div className="text-[10px] text-white/40 truncate capitalize">{adminUser?.role?.replace("_", " ") || "admin"}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => { signOut(); navigate("/admin/login"); }}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-coral transition-colors font-body">
              <LogOut className="w-3 h-3" /> Sign out
            </button>
            <Link to="/admin/install" className="lg:hidden flex items-center gap-1 text-[11px] text-white/60 hover:text-coral transition-colors font-body">
              <Smartphone className="w-3 h-3" /> Install app
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex-1 lg:ml-60 min-h-screen">
        <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
          <button className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <button onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs text-text-light hover:bg-muted flex-1 max-w-xs transition-colors">
            <Search className="w-3.5 h-3.5" />
            <span>Search...</span>
            <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded hidden sm:inline font-mono">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <Link to="/" target="_blank" className="hidden sm:flex items-center gap-1 text-[11px] text-text-light hover:text-forest transition-colors font-body">
              <span>View Store</span>
              <span>↗</span>
            </Link>
            <AdminNotificationBell />
          </div>
        </header>

        {searchOpen && (
          <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-start justify-center pt-20" onClick={() => setSearchOpen(false)}>
            <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 p-4 border-b border-border">
                <Search className="w-4 h-4 text-text-light" />
                <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search products, orders, blog posts..."
                  className="flex-1 text-sm bg-transparent outline-none" />
                <button onClick={() => setSearchOpen(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 text-xs text-text-light">
                {searchQuery.length < 2 ? "Type at least 2 characters to search..." : (
                  <div className="space-y-1">
                    {flatNav.filter(item =>
                      item.label.toLowerCase().includes(searchQuery.toLowerCase())
                    ).map(item => (
                      <Link key={item.to} to={item.to} onClick={() => setSearchOpen(false)}
                        className="flex items-center gap-2 p-2.5 hover:bg-muted rounded-lg transition-colors">
                        <item.icon className="w-4 h-4 text-forest" />
                        <span className="font-semibold">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="p-4 sm:p-6 max-w-[1200px] pb-24 lg:pb-6">
          <Outlet />
        </div>
      </main>

      <AdminMobileBottomNav onOpenMenu={() => setMobileOpen(true)} />
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminPermissionsProvider>
      <AdminLayoutInner />
    </AdminPermissionsProvider>
  );
}
