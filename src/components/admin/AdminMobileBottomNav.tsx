import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingBag, ClipboardList, Menu as MenuIcon } from "lucide-react";

interface Props {
  onOpenMenu: () => void;
}

/**
 * Mobile-only bottom tab bar for the admin PWA. The "Menu" tab opens
 * the existing sidebar drawer so admins still reach every section.
 */
export default function AdminMobileBottomNav({ onOpenMenu }: Props) {
  const { pathname } = useLocation();

  const tabs = [
    { label: "Home", to: "/admin", icon: LayoutDashboard, match: (p: string) => p === "/admin" },
    { label: "Orders", to: "/admin/orders", icon: ShoppingBag, match: (p: string) => p.startsWith("/admin/orders") },
    { label: "Picking", to: "/admin/picking", icon: ClipboardList, match: (p: string) => p.startsWith("/admin/picking") },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch h-14">
        {tabs.map(t => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-coral" : "text-text-light"
              }`}
            >
              <t.icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{t.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-text-light hover:text-forest transition-colors"
        >
          <MenuIcon className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Menu</span>
        </button>
      </div>
    </nav>
  );
}
