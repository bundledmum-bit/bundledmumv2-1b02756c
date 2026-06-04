import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Wallet, CalendarCheck, User as UserIcon, LogOut, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useMyEmployee } from "@/hooks/useHR";
import bmLogoWhite from "@/assets/logos/BM-LOGO-WHITE.svg";
import RequireCustomerAuth from "@/components/account/RequireCustomerAuth";

const NAV = [
  { to: "/employee-portal",          label: "Dashboard",   icon: LayoutDashboard, exact: true },
  { to: "/employee-portal/payslips", label: "My Payslips", icon: Wallet },
  { to: "/employee-portal/leave",    label: "Leave",       icon: CalendarCheck },
  { to: "/employee-portal/tasks",    label: "My Tasks",    icon: ListChecks },
  { to: "/employee-portal/profile",  label: "Profile",     icon: UserIcon },
];

export default function EmployeePortalLayout() {
  return (
    <RequireCustomerAuth>
      <EmployeePortalInner />
    </RequireCustomerAuth>
  );
}

function EmployeePortalInner() {
  const { user } = useCustomerAuth();
  const { data: employee } = useMyEmployee();
  const navigate = useNavigate();

  const firstName = employee?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate("/employee-portal/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-3 px-4 md:px-8 py-3">
          <Link to="/employee-portal" className="flex items-center gap-2">
            <img src={bmLogoWhite} alt="BundledMum" className="h-7 w-auto" />
            <span className="text-primary-foreground/80 text-xs hidden sm:inline">Employee portal</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-primary-foreground/60">Signed in as</div>
              <div className="text-sm text-primary-foreground font-semibold">{employee?.full_name || user?.email}</div>
            </div>
            <button onClick={signOut} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/80 hover:text-primary-foreground bg-primary-foreground/10 hover:bg-primary-foreground/20 px-3 py-1.5 rounded-lg">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 px-4 md:px-8 py-4 pb-24 md:pb-10">
        {/* Desktop sidebar */}
        <aside className="hidden md:block">
          <nav className="sticky top-20 space-y-1">
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive ? "bg-forest/10 text-forest" : "text-text-med hover:bg-muted hover:text-forest"}`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
            <p className="text-[10px] text-text-light pt-3 px-3">Welcome, {firstName}.</p>
          </nav>
        </aside>

        <main>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-card border-t border-border">
        <div className="flex justify-around items-center h-14">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 flex-1 h-full ${isActive ? "text-forest" : "text-text-light"}`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)] bg-card" />
      </nav>
    </div>
  );
}
