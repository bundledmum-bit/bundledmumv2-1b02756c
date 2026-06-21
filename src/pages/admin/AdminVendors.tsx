import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Edit2, Eye, Power } from "lucide-react";
import VendorEditDialog from "@/components/admin/VendorEditDialog";
import AdminVendorCard from "@/components/admin/AdminVendorCard";
import BrandPickerDialog from "@/components/admin/BrandPickerDialog";
import {
  useVendors,
  useVendorWithBrands,
  useToggleVendorActive,
  useLinkBrandToVendor,
  useUnlinkBrandFromVendor,
  useOrdersByVendor,
  type Vendor,
} from "@/hooks/useVendors";
import { useVendorMetrics } from "@/hooks/useVendorMetrics";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import VendorMetricsStrip, { type VendorFilter } from "@/components/admin/vendors/VendorMetricsStrip";
import { useAdminUser } from "@/hooks/useAdminPermissions";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });

export default function AdminVendors() {
  const [tab, setTab] = useState("all");
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const { data: vendors = [], isLoading } = useVendors(false);
  const { data: adminUser } = useAdminUser();
  const isSuperAdmin = adminUser?.role === "super_admin";
  const { can } = usePermissions();
  // Write controls require the vendors module's write action (manage).
  const canManage = can("vendors", "manage");
  const toggleActive = useToggleVendorActive();
  const { data: metrics, isLoading: metricsLoading, isError: metricsError, error: metricsErr } = useVendorMetrics();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive" | "no_brands">("all");

  // Surface a single error toast if the metrics fetch fails — placeholder
  // cards will still render so the page isn't broken.
  useEffect(() => {
    if (metricsError) {
      toast.error("Couldn't load vendor metrics", {
        description: (metricsErr as any)?.message || "Some counts are unavailable.",
      });
    }
  }, [metricsError, metricsErr]);

  const handleFilterChange = (filter: VendorFilter) => {
    setActiveFilter(filter);
    setTab("all");
  };

  const filteredVendors = useMemo(() => {
    if (activeFilter === "all") return vendors;
    if (activeFilter === "active") return vendors.filter(v => v.is_active);
    if (activeFilter === "inactive") return vendors.filter(v => !v.is_active);
    if (activeFilter === "no_brands") {
      const noBrandsSet = new Set(metrics?.vendorsNoBrandsIds || []);
      return vendors.filter(v => noBrandsSet.has(v.id));
    }
    return vendors;
  }, [vendors, activeFilter, metrics?.vendorsNoBrandsIds]);

  const filterLabel: Record<typeof activeFilter, string> = {
    all: "All vendors",
    active: "Active vendors only",
    inactive: "Inactive vendors only",
    no_brands: "Vendors with no linked brands",
  };

  function openAdd() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(v: Vendor) {
    setEditing(v);
    setEditorOpen(true);
  }
  function viewProducts(v: Vendor) {
    setSelectedVendorId(v.id);
    setTab("products");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendors</h1>
          <p className="text-sm text-muted-foreground">Suppliers, brand assignments, and orders per vendor.</p>
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" /> {isSuperAdmin ? "Add Vendor" : "Request to add Vendor"}
          </Button>
        )}
      </div>

      <VendorMetricsStrip
        metrics={metrics}
        isLoading={metricsLoading}
        isError={metricsError}
        onFilterChange={handleFilterChange}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All Vendors</TabsTrigger>
          <TabsTrigger value="products">Products per Vendor</TabsTrigger>
          <TabsTrigger value="orders">Orders per Vendor</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {activeFilter !== "all" && (
            <div className="flex items-center gap-2 mb-2 text-xs">
              <span className="text-muted-foreground">Filter:</span>
              <span className="px-2 py-0.5 rounded bg-forest/10 text-forest font-semibold">
                {filterLabel[activeFilter]} ({filteredVendors.length})
              </span>
              <button
                onClick={() => setActiveFilter("all")}
                className="text-muted-foreground hover:text-foreground underline"
              >
                Clear
              </button>
            </div>
          )}
          {isLoading ? (
            <>
              <div className="hidden md:block space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
              <div className="md:hidden flex flex-col gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[132px] w-full rounded-lg" />)}</div>
            </>
          ) : filteredVendors.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
              {activeFilter === "all"
                ? `No vendors yet. Click "Add Vendor" to create the first one.`
                : `No vendors match this filter.`}
            </div>
          ) : (
            <>
            {/* Desktop (md+) — existing table, unchanged. */}
            <div className="hidden md:block overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 sticky top-0 z-10">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="p-2">Name</th>
                    <th className="p-2">Contact Person</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Location</th>
                    <th className="p-2">Payment Terms</th>
                    <th className="p-2 text-center">Products</th>
                    <th className="p-2 text-center">Status</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map(v => (
                    <VendorRow
                      key={v.id}
                      vendor={v}
                      canManage={canManage}
                      onEdit={() => openEdit(v)}
                      onViewProducts={() => viewProducts(v)}
                      onToggleActive={() => toggleActive.mutate(
                        { id: v.id, isActive: !v.is_active },
                        {
                          onSuccess: () => toast.success(v.is_active ? "Vendor deactivated" : "Vendor activated"),
                        },
                      )}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile (<md) — card list. Consumes the SAME filteredVendors
                array + the SAME row handlers as the table. */}
            <div className="md:hidden flex flex-col gap-3">
              {filteredVendors.map(v => (
                <AdminVendorCard
                  key={v.id}
                  vendor={v}
                  canManage={canManage}
                  onEdit={() => openEdit(v)}
                  onViewProducts={() => viewProducts(v)}
                  onToggleActive={() => toggleActive.mutate(
                    { id: v.id, isActive: !v.is_active },
                    { onSuccess: () => toast.success(v.is_active ? "Vendor deactivated" : "Vendor activated") },
                  )}
                />
              ))}
            </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <ProductsPerVendorTab
            vendors={vendors}
            selectedVendorId={selectedVendorId}
            setSelectedVendorId={setSelectedVendorId}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <OrdersPerVendorTab
            vendors={vendors}
            selectedVendorId={selectedVendorId}
            setSelectedVendorId={setSelectedVendorId}
          />
        </TabsContent>
      </Tabs>

      <VendorEditDialog open={editorOpen} onOpenChange={setEditorOpen} vendor={editing} />
    </div>
  );
}

function VendorRow({
  vendor,
  canManage,
  onEdit,
  onViewProducts,
  onToggleActive,
}: {
  vendor: Vendor;
  canManage: boolean;
  onEdit: () => void;
  onViewProducts: () => void;
  onToggleActive: () => void;
}) {
  const { data } = useVendorWithBrands(vendor.id);
  const productsCount = (data as any)?.brands?.length ?? null;

  return (
    <tr className="border-t border-border hover:bg-muted/30">
      <td className="p-2 font-semibold">{vendor.name}</td>
      <td className="p-2">{vendor.contact_person || "—"}</td>
      <td className="p-2">{vendor.phone || "—"}</td>
      <td className="p-2">{vendor.location || "—"}</td>
      <td className="p-2">{vendor.payment_terms || "—"}</td>
      <td className="p-2 text-center">{productsCount ?? "…"}</td>
      <td className="p-2 text-center">
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${vendor.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"}`}>
          {vendor.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="p-2">
        <div className="flex items-center justify-end gap-2">
          {canManage && (
            <button onClick={onEdit} className="text-forest hover:underline text-xs flex items-center gap-1">
              <Edit2 className="w-3 h-3" /> Edit
            </button>
          )}
          <button onClick={onViewProducts} className="text-forest hover:underline text-xs flex items-center gap-1">
            <Eye className="w-3 h-3" /> View Products
          </button>
          {canManage && (
            <button onClick={onToggleActive} className="text-forest hover:underline text-xs flex items-center gap-1">
              <Power className="w-3 h-3" /> {vendor.is_active ? "Deactivate" : "Activate"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ProductsPerVendorTab({
  vendors,
  selectedVendorId,
  setSelectedVendorId,
  canManage,
}: {
  vendors: Vendor[];
  selectedVendorId: string | null;
  setSelectedVendorId: (id: string | null) => void;
  canManage: boolean;
}) {
  const { data: vendor, isLoading } = useVendorWithBrands(selectedVendorId);
  const link = useLinkBrandToVendor();
  const unlink = useUnlinkBrandFromVendor();
  const [pickerOpen, setPickerOpen] = useState(false);

  const brands = (vendor as any)?.brands || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Select
          value={selectedVendorId || ""}
          onValueChange={v => setSelectedVendorId(v || null)}
        >
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Choose vendor" />
          </SelectTrigger>
          <SelectContent>
            {vendors.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Button disabled={!selectedVendorId} onClick={() => setPickerOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Product
          </Button>
        )}
      </div>

      {!selectedVendorId ? (
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
          Pick a vendor to view their products.
        </div>
      ) : isLoading ? (
        <Skeleton className="h-32 w-full rounded-md" />
      ) : brands.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
          No products linked to this vendor.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 sticky top-0 z-10">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-2">SKU</th>
                <th className="p-2">Product</th>
                <th className="p-2">Brand</th>
                <th className="p-2">Category</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b: any) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{b.sku || "—"}</td>
                  <td className="p-2">{b.products?.name || "—"}</td>
                  <td className="p-2 font-semibold">{b.brand_name}</td>
                  <td className="p-2 capitalize text-muted-foreground">{b.products?.subcategory || "—"}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${b.in_stock ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"}`}>
                      {b.in_stock ? "In stock" : "Out"}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    {canManage ? (
                      <button
                        onClick={() => unlink.mutate(
                          { brandId: b.id },
                          { onSuccess: () => toast.success("Unlinked") },
                        )}
                        className="text-coral hover:underline text-xs"
                      >
                        Unlink
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BrandPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(b) => {
          if (!selectedVendorId) return;
          link.mutate(
            { brandId: b.id, vendorId: selectedVendorId },
            { onSuccess: () => toast.success(`Linked ${b.brand_name}`) },
          );
        }}
      />
    </div>
  );
}

function OrdersPerVendorTab({
  vendors,
  selectedVendorId,
  setSelectedVendorId,
}: {
  vendors: Vendor[];
  selectedVendorId: string | null;
  setSelectedVendorId: (id: string | null) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const range = useMemo(() => ({
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
  }), [from, to]);

  const { data: orders = [], isLoading } = useOrdersByVendor(selectedVendorId, range);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] text-muted-foreground">Vendor</label>
          <Select value={selectedVendorId || ""} onValueChange={v => setSelectedVendorId(v || null)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Choose vendor" />
            </SelectTrigger>
            <SelectContent>
              {vendors.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-44" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-44" />
        </div>
      </div>

      {!selectedVendorId ? (
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
          Pick a vendor to see their orders.
        </div>
      ) : isLoading ? (
        <Skeleton className="h-32 w-full rounded-md" />
      ) : orders.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
          No orders for this vendor in the selected range.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 sticky top-0 z-10">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-2">Order #</th>
                <th className="p-2">Date</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Status</th>
                <th className="p-2">Items</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-t border-border">
                  <td className="p-2 font-semibold">{o.order_number}</td>
                  <td className="p-2 text-muted-foreground">{fmtDate(o.created_at)}</td>
                  <td className="p-2">{o.customer_name}</td>
                  <td className="p-2 capitalize">{o.order_status}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {(o.order_items || []).map((it, i) => (
                      <span key={i}>
                        {it.brand_name || it.product_name} × {it.quantity}
                        {i < (o.order_items.length - 1) ? ", " : ""}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
