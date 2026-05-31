import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, X, Download, Users } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

export default function AdminCustomers() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("last_order_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: customerOrders } = useQuery({
    queryKey: ["admin-customer-orders", selectedCustomer?.email],
    queryFn: async () => {
      if (!selectedCustomer?.email) return [];
      const { data, error } = await supabase.from("orders").select("*").eq("customer_email", selectedCustomer.email).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCustomer?.email && can("customers", "view_orders"),
  });

  const updateNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("customers").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-customers"] }); toast.success("Notes saved"); },
  });

  const filtered = (customers || []).filter((c: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.full_name || "").toLowerCase().includes(s) || (c.email || "").toLowerCase().includes(s) || (c.phone || "").toLowerCase().includes(s);
  });

  const showContact = can("customers", "view_contact");

  const exportCSV = () => {
    const rows = filtered.map((c: any) => [c.full_name, c.email, c.phone, c.total_orders, c.total_spent, c.delivery_state, c.last_order_at].join(","));
    const csv = "Name,Email,Phone,Orders,TotalSpent,State,LastOrder\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "customers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

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

      <div className="relative max-w-xs mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..."
          className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background" />
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Customer</th>
                {showContact && <th className="px-4 py-3 text-left font-semibold text-text-med">Phone</th>}
                <th className="px-4 py-3 text-left font-semibold text-text-med">Orders</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Spent</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Last Order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedCustomer(c)}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{c.full_name || "—"}</div>
                    {showContact && <div className="text-xs text-text-light">{c.email}</div>}
                  </td>
                  {showContact && <td className="px-4 py-3 text-xs">{c.phone || "—"}</td>}
                  <td className="px-4 py-3 text-xs font-semibold">{c.total_orders}</td>
                  <td className="px-4 py-3 text-xs font-semibold">₦{(c.total_spent || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-text-light">{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={showContact ? 5 : 4} className="px-4 py-10 text-center text-text-med">No customers found. Customers are auto-created when orders are placed.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center max-md:items-end max-md:p-0" onClick={() => setSelectedCustomer(null)}>
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">{selectedCustomer.full_name || selectedCustomer.email}</h3>
              <button onClick={() => setSelectedCustomer(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold pf">{selectedCustomer.total_orders}</div>
                  <div className="text-[10px] text-text-light">Orders</div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold pf">₦{(selectedCustomer.total_spent || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-text-light">Total Spent</div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <div className="text-sm font-semibold">{selectedCustomer.delivery_state || "—"}</div>
                  <div className="text-[10px] text-text-light">State</div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <div className="text-sm font-semibold">{selectedCustomer.delivery_area || "—"}</div>
                  <div className="text-[10px] text-text-light">Area</div>
                </div>
              </div>
              {can("customers", "edit") && (
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Admin Notes</label>
                  <textarea defaultValue={selectedCustomer.notes || ""} rows={3}
                    onBlur={e => updateNotes.mutate({ id: selectedCustomer.id, notes: e.target.value })}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" placeholder="Add notes..." />
                </div>
              )}
              {can("customers", "view_orders") && (
                <div>
                  <h4 className="text-xs font-semibold text-text-med mb-2">Order History</h4>
                  <div className="space-y-2">
                    {(customerOrders || []).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-3 text-xs">
                        <div>
                          <span className="font-semibold">{o.order_number}</span>
                          <span className="text-text-light ml-2">{new Date(o.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted">{o.order_status}</span>
                          <span className="font-bold">₦{(o.total || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                    {(!customerOrders || customerOrders.length === 0) && <p className="text-xs text-text-light">No orders found</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
