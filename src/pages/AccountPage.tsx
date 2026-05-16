import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Package, User, Gift, Truck, LogOut, ChevronRight, Repeat } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { analytics } from "@/lib/ga";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  confirmed: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  packed: "bg-purple-100 text-purple-700",
  shipped: "bg-cyan-100 text-cyan-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-orange-100 text-orange-700",
};

export default function AccountPage() {
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const email = user?.email || "";

  const { data: customer } = useQuery({
    queryKey: ["my-customer", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customers")
        .select("full_name, total_orders, total_spent, last_order_at, acquisition_channel")
        .eq("email", email)
        .maybeSingle();
      if (error) throw error;
      return data as { full_name: string | null; total_orders: number | null; total_spent: number | null; last_order_at: string | null; acquisition_channel: string | null } | null;
    },
    staleTime: 60_000,
  });

  // GA4 user_properties — fire once per customer record load. Ref-gated
  // by customer-row identity so React Query refetches don't re-fire it.
  const userPropsFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!customer || !email) return;
    if (userPropsFiredRef.current === email) return;
    userPropsFiredRef.current = email;
    try {
      const totalOrders = Number(customer.total_orders) || 0;
      analytics.push({
        event: "user_properties",
        user_properties: {
          customer_type: totalOrders === 0 ? "new" : "returning",
          total_orders: totalOrders,
          acquisition_channel: customer.acquisition_channel ?? "direct",
        },
      });
    } catch { /* ignore */ }
  }, [customer, email]);

  const { data: lastOrder } = useQuery({
    queryKey: ["my-last-order", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, order_number, order_status, created_at, total")
        .eq("customer_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
    staleTime: 60_000,
  });

  const firstName = (customer?.full_name || "").split(" ")[0] || (email.split("@")[0] || "there");

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate("/account/login", { replace: true });
  };

  const cards = [
    { to: "/account/orders",        icon: Package, emoji: "📦", label: "My Orders",       hint: customer?.total_orders ? `${customer.total_orders} order${customer.total_orders === 1 ? "" : "s"}` : "View your order history" },
    { to: "/account/subscriptions", icon: Repeat,  emoji: "🔄", label: "My Subscriptions", hint: "Recurring deliveries" },
    { to: "/account/profile",       icon: User,    emoji: "👤", label: "My Profile",      hint: "Name, phone, addresses" },
    { to: "/account/referral",      icon: Gift,    emoji: "🎁", label: "Refer & Earn",    hint: "Share your code, earn credit" },
    { to: "/track-order",           icon: Truck,   emoji: "🚚", label: "Track Order",     hint: "Check any order's status" },
  ];

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-20 md:pb-10 px-4">
      <div className="max-w-[680px] mx-auto pt-6">
        <header className="mb-5">
          <h1 className="pf text-2xl font-bold">Welcome back, {firstName}!</h1>
          <p className="text-xs text-text-med mt-1">{email}</p>
        </header>

        {lastOrder && (
          <Link
            to="/account/orders"
            className="block bg-card border border-border rounded-card shadow-card p-4 mb-4 hover:border-forest/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">Latest order</div>
                <div className="font-semibold text-sm mt-0.5 truncate">{lastOrder.order_number || "Order"}</div>
                <div className="text-[11px] text-text-light mt-0.5">
                  {new Date(lastOrder.created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-pill capitalize ${STATUS_COLORS[lastOrder.order_status] || "bg-muted text-text-med"}`}>
                {lastOrder.order_status}
              </span>
            </div>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-3">
          {cards.map(c => {
            const Icon = c.icon;
            return (
              <Link
                key={c.to}
                to={c.to}
                className="bg-card border border-border rounded-card shadow-card p-4 hover:border-forest/40 transition-colors flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-5 h-5 text-forest" />
                  <ChevronRight className="w-4 h-4 text-text-light" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{c.label}</div>
                  <div className="text-[11px] text-text-light mt-0.5 leading-snug">{c.hint}</div>
                </div>
              </Link>
            );
          })}
        </div>

        <button
          onClick={signOut}
          className="mt-6 w-full inline-flex items-center justify-center gap-1.5 border border-border text-text-med hover:text-destructive hover:border-destructive/40 rounded-lg py-3 text-xs font-semibold min-h-[44px]"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}
