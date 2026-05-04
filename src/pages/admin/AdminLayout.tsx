import { useEffect, useState, useMemo } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { AdminPermissionsProvider, usePermissions } from "@/hooks/useAdminPermissionsContext";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useQuery } from "@tanstack/react-query";
import {
  Package, ShoppingBag, ClipboardList, Truck, MessageSquare, Settings,
  BarChart3, Gift, LogOut, LayoutDashboard, FileText, Users, Image, Bell,
  Search, X, Menu, ChevronLeft, MessageCircleQuestion, Workflow, Mail, Rocket,
  type LucideIcon,
} from "lucide-react";
import { Tag, Boxes, MapPin, FileText as PageIcon, Layout, ShieldCheck, RotateCcw, Megaphone, Sparkles } from "lucide-react";
import logoWhite from "@/assets/logos/BM-LOGO-WHITE.svg";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";

// Map icon name strings from DB to lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Package, Boxes, ShoppingBag, ClipboardList, Users, Tag,
  Gift, Truck, MapPin, MessageSquare, FileText, Image, MessageCircleQuestion,
  Workflow, BarChart3, Settings, Mail, Rocket,
  Layout, ShieldCheck, RotateCcw, Megaphone,
  PageIcon, // alias
};

function getIcon(iconName: string | null): LucideIcon {
  if (!iconName) return Package;
  return ICON_MAP[iconName] || Package;
}

interface NavItemFromDB {
  nav_key: string;
  label: string;
  icon: string | null;
  path: string;
  parent_key: string | null;
  display_order: number;
}

function AdminLayoutInner() {
  const { isAdmin, loading, signOut, user } = useAdmin();
  const { can, adminUser, isSuperAdmin } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  
  useIdleTimeout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch nav items exclusively from get_admin_nav RPC
  const { data: dbNavItems } = useQuery({
    queryKey: ["admin-nav-items", adminUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_nav");
      if (error) throw error;
      return (data as unknown as NavItemFromDB[]) || [];
    },
    enabled: !!adminUser,
  });

  // Path corrections for DB entries that don't match actual routes
  const PATH_FIXES: Record<string, string> = {
    "/admin/quiz": "/admin/quiz-engine",
  };

  // Build visible nav from DB results — top-level (parent) items only, with
  // a small allow-list of children that get lifted into the flat sidebar so
  // they surface alongside their parent group (e.g. Orders → Returns,
  // Analytics → Marketing). Each lifted child is spliced in directly below
  // its parent's entry rather than sorting by its raw display_order.
  const LIFTED_CHILDREN = ["returns", "analytics_marketing"];
  const visibleNav = useMemo(() => {
    if (!dbNavItems) return [];
    const toEntry = (item: NavItemFromDB) => {
      const resolvedPath = PATH_FIXES[item.path] || item.path;
      return {
        to: resolvedPath,
        label: item.label,
        icon: getIcon(item.icon),
        exact: resolvedPath === "/admin",
        navKey: item.nav_key,
      };
    };

    const topLevel = [...dbNavItems]
      .filter(i => !i.parent_key)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map(toEntry);

    for (const navKey of LIFTED_CHILDREN) {
      const child = dbNavItems.find(i => i.nav_key === navKey);
      if (!child || !child.parent_key) continue;
      const parentIdx = topLevel.findIndex(e => e.navKey === child.parent_key);
      const insertAt = parentIdx >= 0 ? parentIdx + 1 : topLevel.length;
      topLevel.splice(insertAt, 0, toEntry(child));
    }

    // Append the Merchandising entry if the DB nav hasn't been seeded
    // with it yet — keeps the link reachable without a migration.
    if (!topLevel.some(e => e.to === "/admin/merchandising")) {
      topLevel.push({
        to: "/admin/merchandising",
        label: "Merchandising",
        icon: Sparkles,
        exact: false,
        navKey: "merchandising",
      });
    }

    // Static fallback for the super-admin User Permissions page in case the
    // DB-driven nav hasn't been seeded with it. The page itself enforces
    // super_admin access via redirect, but we only render the nav link when
    // the current admin is super_admin so other roles never see it.
    if (
      isSuperAdmin &&
      !topLevel.some(e => e.to === "/admin/settings/permissions")
    ) {
      topLevel.push({
        to: "/admin/settings/permissions",
        label: "User Permissions",
        icon: ShieldCheck,
        exact: false,
        navKey: "settings_permissions",
      });
    }

    return topLevel;
  }, [dbNavItems, isSuperAdmin]);

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
    if (!loading && !isAdmin) navigate("/admin/login");
  }, [loading, isAdmin, navigate]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    for (const n of unread) {
      await supabase.from("admin_notifications").update({ is_read: true }).eq("id", n.id);
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  if (loading) return (
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

        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-4 mb-2">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-[2px]">Menu</span>
          </div>
          {visibleNav.map(item => {
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to) && item.to !== "/admin";
            const activeExact = item.exact && location.pathname === item.to;
            const active = item.exact ? activeExact : isActive;
            return (
              <Link key={item.to} to={item.to}
                className={`flex items-center gap-2.5 px-5 py-2 text-[13px] transition-all mx-2 rounded-lg font-body ${
                  active
                    ? "bg-white/15 text-white font-semibold shadow-sm"
                    : "text-white/60 hover:bg-white/8 hover:text-white/90"
                }`}>
                <item.icon className={`w-4 h-4 ${active ? "text-coral" : ""}`} />
                {item.label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-coral" />}
              </Link>
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
          <button onClick={() => { signOut(); navigate("/admin/login"); }}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-coral transition-colors font-body">
            <LogOut className="w-3 h-3" /> Sign out
          </button>
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
                    {visibleNav.filter(item =>
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

        <div className="p-6 max-w-[1200px]">
          <Outlet />
        </div>
      </main>
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
