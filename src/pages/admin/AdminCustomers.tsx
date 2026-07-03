import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, X, Download, Users } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { Skeleton } from "@/components/ui/skeleton";
import AdminCustomerCard from "@/components/admin/AdminCustomerCard";

// All money fields (total_paid, avg_order_value, total_referrer_credit) are in
// NAIRA already — never /100.
const naira = (n: number | null | undefined) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
// Date + time, e.g. "2 Jul 2026, 3:42 pm". null -> the given fallback label.
const dt = (iso: string | null | undefined, fallback = "—") =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : fallback;
const dateOnly = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

type AccountFilter = "all" | "account" | "guest";
const ACCOUNT_FILTERS: [AccountFilter, string][] = [
  ["all", "All customers"], ["account", "Account holders only"], ["guest", "Guests only"],
];

function AccountBadge({ has }: { has: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${has ? "bg-green-100 text-green-700" : "bg-muted text-text-med"}`}>
      {has ? "Account" : "Guest"}
    </span>
  );
}
function VerifiedBadge({ v }: { v: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${v ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
      {v ? "Email verified" : "Email unverified"}
    </span>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-text-light">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

export default function AdminCustomers() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const showContact = can("customers", "view_contact");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["admin-customer-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_customer_accounts" as any)
        .select("*")
        .order("last_order_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Order history for the selected customer (matched by their stored email).
  const { data: customerOrders } = useQuery({
    queryKey: ["admin-customer-orders", selectedCustomer?.email],
    enabled: !!selectedCustomer?.email && can("customers", "view_orders"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("order_number, order_status, payment_status, total, created_at")
        .eq("customer_email", selectedCustomer.email)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: customerSubs } = useQuery({
    queryKey: ["admin-customer-subs", selectedCustomer?.email],
    enabled: !!selectedCustomer?.email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("status, customer_name, created_at")
        .eq("customer_email", selectedCustomer.email)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: customerAddresses } = useQuery({
    queryKey: ["admin-customer-addresses", selectedCustomer?.customer_id],
    enabled: !!selectedCustomer?.customer_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("address, is_default")
        .eq("customer_id", selectedCustomer.customer_id);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const filtered = (customers || []).filter((c: any) => {
    if (accountFilter === "account" && !c.has_account) return false;
    if (accountFilter === "guest" && c.has_account) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.full_name || "").toLowerCase().includes(s) || (c.email || "").toLowerCase().includes(s) || (c.phone || "").toLowerCase().includes(s);
  });

  const exportCSV = () => {
    const rows = filtered.map((c: any) =>
      [c.full_name, c.email, c.phone, c.has_account ? "Account" : "Guest", c.paid_order_count, c.total_paid, c.last_order_at].join(","));
    const csv = "Name,Email,Phone,Type,PaidOrders,TotalPaid,LastOrder\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "customers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const c = selectedCustomer;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="pf text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Customers ({filtered.length})</h1>
        {can("customers", "export") && (
          <button onClick={exportCSV} className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted">
            <Download className="w-4 h-4" /> Export
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..."
            className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ACCOUNT_FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setAccountFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${accountFilter === k ? "bg-forest text-primary-foreground border-forest" : "border-border text-text-med hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="hidden md:block text-center py-10 text-text-med">Loading...</div>
          <div className="md:hidden flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[116px] w-full rounded-lg" />)}
          </div>
        </>
      ) : (
        <>
        {/* Desktop (md+) — table */}
        <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Customer</th>
                {showContact && <th className="px-4 py-3 text-left font-semibold text-text-med">Phone</th>}
                <th className="px-4 py-3 text-left font-semibold text-text-med">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Paid Orders</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Total Paid</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Last Order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row: any) => (
                <tr key={row.customer_id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedCustomer(row)}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{row.full_name || "—"}</div>
                    {showContact && <div className="text-xs text-text-light">{row.email}</div>}
                  </td>
                  {showContact && <td className="px-4 py-3 text-xs">{row.phone || "—"}</td>}
                  <td className="px-4 py-3"><AccountBadge has={!!row.has_account} /></td>
                  <td className="px-4 py-3 text-xs font-semibold">{row.paid_order_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs font-semibold">{naira(row.total_paid)}</td>
                  <td className="px-4 py-3 text-xs text-text-light">{dateOnly(row.last_order_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={showContact ? 6 : 5} className="px-4 py-10 text-center text-text-med">No customers found.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Mobile (<md) — card list, same `filtered` array */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-text-med">No customers found.</div>
          ) : (
            filtered.map((row: any) => (
              <AdminCustomerCard key={row.customer_id} customer={row} onSelect={setSelectedCustomer} canViewContact={showContact} />
            ))
          )}
        </div>
        </>
      )}

      {c && (
        <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center max-md:items-end max-md:p-0" onClick={() => setSelectedCustomer(null)}>
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-border">
              <div className="min-w-0">
                <h3 className="font-bold text-lg truncate">{c.full_name || c.email || "Customer"}</h3>
                {showContact && <div className="text-sm text-text-med truncate">{c.email}</div>}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <AccountBadge has={!!c.has_account} />
                  <VerifiedBadge v={!!c.email_verified} />
                  {c.customer_ref && <span className="text-[10px] font-mono text-text-light">{c.customer_ref}</span>}
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)}><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-5">
              {/* Contact */}
              {showContact && (
                <section>
                  <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">Contact</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Phone" value={c.phone || "—"} />
                    <Stat label="WhatsApp" value={c.whatsapp_number || "—"} />
                  </div>
                </section>
              )}

              {/* Account activity */}
              <section>
                <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">Account activity</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Stat label="Account created" value={dt(c.account_created_at, "No account")} />
                  <Stat label="Last login" value={dt(c.last_login_at, "Never logged in")} />
                  <Stat label="Acquisition channel" value={<span className="capitalize">{c.acquisition_channel || "—"}</span>} />
                </div>
              </section>

              {/* Orders summary */}
              <section>
                <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">Orders summary</h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <Stat label="Paid orders" value={c.paid_order_count ?? 0} />
                  <Stat label="Total paid" value={naira(c.total_paid)} />
                  <Stat label="Avg order" value={naira(c.avg_order_value)} />
                  <Stat label="First paid" value={dateOnly(c.first_paid_at)} />
                  <Stat label="Last order" value={dateOnly(c.last_order_at)} />
                </div>
              </section>

              {/* Order history */}
              {can("customers", "view_orders") && (
                <section>
                  <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">Order history</h4>
                  <div className="space-y-2">
                    {(customerOrders || []).map((o: any, i: number) => (
                      <div key={o.order_number || i} className="flex items-center justify-between bg-muted/30 rounded-lg p-3 text-xs gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold">{o.order_number}</span>
                          <span className="text-text-light ml-2">{dateOnly(o.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted capitalize">{o.order_status}</span>
                          {o.payment_status && <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted capitalize">{o.payment_status}</span>}
                          <span className="font-bold">{naira(o.total)}</span>
                        </div>
                      </div>
                    ))}
                    {(!customerOrders || customerOrders.length === 0) && <p className="text-xs text-text-light">No orders yet</p>}
                  </div>
                </section>
              )}

              {/* Subscriptions */}
              <section>
                <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">
                  Subscriptions
                  <span className="ml-2 font-normal text-text-light normal-case tracking-normal">{c.active_subscription_count ?? 0} active of {c.subscription_count ?? 0} total</span>
                </h4>
                <div className="space-y-2">
                  {(customerSubs || []).map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg p-3 text-xs gap-2">
                      <span className="truncate">{s.customer_name || "—"}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted capitalize">{s.status}</span>
                        <span className="text-text-light">{dateOnly(s.created_at)}</span>
                      </div>
                    </div>
                  ))}
                  {(!customerSubs || customerSubs.length === 0) && <p className="text-xs text-text-light">No subscriptions</p>}
                </div>
              </section>

              {/* Referrals */}
              <section>
                <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">Referrals</h4>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Codes owned" value={c.referral_codes_owned ?? 0} />
                  <Stat label="Total referrals" value={c.total_referrals ?? 0} />
                  <Stat label="Referrer credit" value={naira(c.total_referrer_credit)} />
                </div>
              </section>

              {/* Saved addresses */}
              <section>
                <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">
                  Saved addresses
                  <span className="ml-2 font-normal text-text-light normal-case tracking-normal">{c.saved_address_count ?? 0}</span>
                </h4>
                <div className="space-y-2">
                  {(customerAddresses || []).map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg p-3 text-xs gap-2">
                      <span className="min-w-0 break-words">{a.address}</span>
                      {a.is_default && <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 shrink-0">Default</span>}
                    </div>
                  ))}
                  {(!customerAddresses || customerAddresses.length === 0) && <p className="text-xs text-text-light">No saved addresses</p>}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
