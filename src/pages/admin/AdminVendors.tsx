import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Check, X, Loader2, ImageOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import BrandImageUpload from "@/components/admin/BrandImageUpload";
import { useAdminUser } from "@/hooks/useAdminPermissions";
import { useAllProducts } from "@/hooks/useSupabaseData";
import { useIsMobile } from "@/hooks/use-mobile";

// The restricted "vendor manager" account. Anyone else reaching this page is a
// full admin (super_admin / admin) with direct edit rights.
const VENDOR_MANAGER_EMAIL = "vendorbundledmum@gmail.com";

// Subcategory slugs to filter by. Labels come from the view's category_label
// when present, else we title-case the slug.
const SUBCATEGORIES = [
  "accessories-misc", "baby-clothing", "baby-formula", "baby-skincare-toiletries",
  "bath-grooming", "bedding-blankets", "beverages", "breastfeeding-equipment",
  "bundles-kits", "diapers-nappies", "feeding-equipment", "health-safety-baby",
  "laundry-household", "maternity-clothing", "maternity-postpartum",
  "mum-gifts-keepsakes", "nursery-furniture", "toys-learning", "travel-gear",
  "wipes-diaper-care",
] as const;

const titleCase = (slug: string) =>
  slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// Subcategories whose product type is a *diaper* type (Tape/Pant/Wet wipes…),
// stored on brands.diaper_type. Every other subcategory uses item_type instead.
const DIAPER_SUBCATS = new Set(["diapers-nappies", "wipes-diaper-care"]);

// Reasoned per-subcategory attribute map (authoritative; amend here).
// Universal fields (brand, cost_price, image, weight_kg) are ALWAYS shown and
// are not listed. Possible extra fields: type (diaper_type | item_type — chosen
// by DIAPER_SUBCATS, never both), size (→ size_variant), weight_range_kg,
// pack_count, color, gender.
type AttrField = "type" | "size" | "weight_range_kg" | "pack_count" | "color" | "gender";
const SUBCATEGORY_FIELDS: Record<string, AttrField[]> = {
  "diapers-nappies": ["type", "size", "weight_range_kg", "pack_count"],
  "wipes-diaper-care": ["type", "size", "pack_count"],
  "baby-formula": ["type", "size", "pack_count"], // size labeled "Stage"
  "feeding-equipment": ["type", "size", "pack_count"],
  "maternity-postpartum": ["type", "size", "pack_count"],
  "maternity-clothing": ["type", "size", "pack_count"],
  "baby-skincare-toiletries": ["type", "size", "pack_count"],
  "health-safety-baby": ["type", "size", "pack_count", "gender"],
  "baby-clothing": ["type", "size", "pack_count", "color", "gender"],
  "breastfeeding-equipment": ["type", "size", "pack_count"],
  "nursery-furniture": ["type", "size", "pack_count"],
  "toys-learning": ["type", "size", "pack_count"],
  "travel-gear": ["type", "size"],
  "bath-grooming": ["type", "size", "pack_count"],
  "bedding-blankets": ["type", "size", "pack_count", "gender"],
  "laundry-household": ["type", "size", "color", "pack_count"],
  "accessories-misc": ["type", "size"],
  "mum-gifts-keepsakes": ["type", "gender"],
  "bundles-kits": ["type"],
  "beverages": ["type"],
};
// Permissive default for null / unknown / unlisted subcategories.
const DEFAULT_FIELDS: AttrField[] = ["type", "size", "pack_count"];
const fieldsFor = (subcat: string | null | undefined): AttrField[] =>
  (subcat && SUBCATEGORY_FIELDS[subcat]) || DEFAULT_FIELDS;

// Vendors list (id + name) for the existing-vendor pickers. RLS may limit this
// for the vendor account; an empty list just hides/empties the picker.
function useVendorsPicker() {
  return useQuery({
    queryKey: ["vendors-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
}

const fmtNaira = (n: number | null | undefined) =>
  n == null ? "—" : `₦${Math.round(n).toLocaleString("en-NG")}`;

const dash = (v: unknown) =>
  v == null || v === "" ? "—" : String(v);

interface VendorRow {
  brand_id: string;
  sku: string | null;
  product_id: string | null;
  product_name: string | null;
  subcategory: string | null;
  category_label: string | null;
  brand: string | null;
  stored_image_url: string | null;
  image_url: string | null;
  size_stage: string | null;
  weight_range_kg: string | null;
  weight_kg: number | null;
  pack_count: number | null;
  diaper_type: string | null;
  item_type: string | null;
  color: string | null;
  gender_relevant: string | null;
  cost_price: number | null;
  retail_price: number | null;
  cogs_percent: number | null;
  in_stock: boolean | null;
  is_active: boolean | null;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_phone: string | null;
  vendor_whatsapp: string | null;
  updated_at: string | null;
}

interface PendingFlags {
  cost_price?: number;
  image?: boolean;
  vendor?: boolean;
  other?: boolean;        // a pending change to some other attribute
  otherFields?: string[]; // human-readable names of those other changed fields
}

// proposed_data keys that do NOT produce a generic "Edit pending" badge —
// either represented by a specific badge (cost / image / vendor) or not
// vendor-proposable at all (selling price is super-admin-only, applied directly
// and never routed through approval).
const COVERED_PENDING_KEYS = new Set([
  "cost_price", "stored_image_url", "image_url", "thumbnail_url",
  "vendor_id", "new_vendor_name", "new_vendor_phone", "new_vendor_whatsapp",
  "price", "compare_at_price",
]);
const PENDING_FIELD_LABELS: Record<string, string> = {
  weight_kg: "weight",
  weight_range_kg: "weight range", pack_count: "pack count", diaper_type: "diaper type",
  item_type: "item type", size_variant: "size", variant_type: "variant type",
  tier: "tier", in_stock: "stock", low_stock_threshold: "low-stock threshold",
  brand_name: "brand name",
};
const labelForPendingField = (k: string) => PENDING_FIELD_LABELS[k] || k.replace(/_/g, " ");

export default function AdminVendors() {
  const qc = useQueryClient();
  const { data: adminUser } = useAdminUser();
  const isVendorManager = adminUser?.email === VENDOR_MANAGER_EMAIL;
  const isSuperAdmin = adminUser?.role === "super_admin";
  const isMobile = useIsMobile();

  const [view, setView] = useState<"products" | "report">("products");
  const [subFilter, setSubFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [stockFilter, setStockFilter] = useState<"all" | "instock" | "oos">("instock");
  const [viewingRow, setViewingRow] = useState<VendorRow | null>(null);
  const [editingRow, setEditingRow] = useState<VendorRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Debounce search so we don't refetch on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Total catalog size (Y in "Showing X of Y") — unfiltered count, fetched once.
  const { data: totalCount = 0 } = useQuery({
    queryKey: ["vendor-manager-total"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("vendor_manager_view" as any)
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  // --- Rows from vendor_manager_view, filtered SERVER-SIDE so the default
  //     1000-row cap can never hide matching products (view has ~1391+ rows).
  //     range(0, 4999) raises the ceiling even for unfiltered loads.
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["vendor-manager-view", subFilter, statusFilter, stockFilter, debouncedSearch],
    queryFn: async () => {
      let qb = supabase.from("vendor_manager_view" as any).select("*");
      if (subFilter !== "all") qb = qb.eq("subcategory", subFilter);
      if (statusFilter === "active") qb = qb.eq("is_active", true);
      else if (statusFilter === "inactive") qb = qb.eq("is_active", false);
      if (stockFilter === "instock") qb = qb.eq("in_stock", true);
      else if (stockFilter === "oos") qb = qb.eq("in_stock", false);
      const q = debouncedSearch.trim().replace(/[(),%*]/g, " ").trim();
      if (q) qb = qb.or(`product_name.ilike.%${q}%,brand.ilike.%${q}%,sku.ilike.%${q}%`);
      const { data, error } = await qb.range(0, 4999);
      if (error) throw error;
      return (data as unknown as VendorRow[]) ?? [];
    },
    staleTime: 30_000,
  });

  // --- Pending brand-update requests, mapped by brand_id. A brand may have
  //     several pending requests (cost, image, vendor); flag each present key.
  const { data: pendingMap = {} } = useQuery({
    queryKey: ["vendor-pending-cost-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_approval_requests")
        .select("target_record_id, proposed_data, status")
        .eq("target_table", "brands")
        .eq("action", "update")
        .eq("status", "pending");
      if (error) throw error;
      const map: Record<string, PendingFlags> = {};
      for (const r of (data ?? []) as any[]) {
        const id = r.target_record_id;
        if (id == null) continue;
        const pd = r.proposed_data ?? {};
        const entry = (map[id] ??= {});
        if (pd.cost_price != null) entry.cost_price = Number(pd.cost_price);
        if (pd.stored_image_url != null || pd.image_url != null || pd.thumbnail_url != null) entry.image = true;
        // Either assigning an existing vendor (vendor_id) or creating a new one
        // (new_vendor_name) counts as a pending vendor change.
        if (pd.vendor_id != null || pd.new_vendor_name != null) entry.vendor = true;
        // Any OTHER changed attribute → generic "Edit pending" so a pending
        // request to e.g. weight/pack count/tier is never badge-less.
        for (const k of Object.keys(pd)) {
          if (COVERED_PENDING_KEYS.has(k)) continue;
          entry.other = true;
          (entry.otherFields ??= []);
          const label = labelForPendingField(k);
          if (!entry.otherFields.includes(label)) entry.otherFields.push(label);
        }
      }
      return map;
    },
    staleTime: 15_000,
  });

  // Filtering happens server-side (see the query above), so the returned set is
  // already complete and uncapped for the active filters — here we only sort.
  const filtered = useMemo(() => {
    return [...rows].sort((a, b) => {
      const p = (a.product_name ?? "").localeCompare(b.product_name ?? "");
      return p !== 0 ? p : (a.brand ?? "").localeCompare(b.brand ?? "");
    });
  }, [rows]);

  const statusFiltered = statusFilter !== "all" || stockFilter !== "all";
  const resetStatusStock = () => { setStatusFilter("all"); setStockFilter("all"); };

  const refreshRows = () => qc.invalidateQueries({ queryKey: ["vendor-manager-view"] });
  const refreshPending = () => qc.invalidateQueries({ queryKey: ["vendor-pending-cost-requests"] });

  // No admin record → don't render the editable surface.
  if (adminUser === null) {
    return <div className="p-6 text-sm text-muted-foreground">Not authorized.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#2D6A4F]">Vendor Products</h1>
          <p className="text-sm text-muted-foreground">
            {isVendorManager
              ? "Cost-price changes and new products are submitted for super-admin approval."
              : "Full admin — cost-price edits apply immediately."}
          </p>
        </div>
        {view === "products" && (
          <Button onClick={() => setAddOpen(true)}
            className="bg-[#2D6A4F] hover:bg-[#245840] w-full sm:w-auto max-md:min-h-[44px]">
            <Plus className="w-4 h-4 mr-1" /> Add Product
          </Button>
        )}
      </div>

      {/* Section tabs — Products table vs Vendors report */}
      <div className="flex gap-1 border-b border-border">
        {(["products", "report"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px max-md:min-h-[44px] ${
              view === v ? "border-[#2D6A4F] text-[#2D6A4F]" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {v === "products" ? "Products" : "Vendors"}
          </button>
        ))}
      </div>

      {view === "report" ? (
        <VendorReport />
      ) : (
      <>
      {/* Filter + search — stacks full-width on mobile, inline row on desktop */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Select value={subFilter} onValueChange={setSubFilter}>
          <SelectTrigger className="w-full sm:w-[220px] max-md:min-h-[44px]">
            <SelectValue placeholder="Subcategory" />
          </SelectTrigger>
          <SelectContent className="max-h-[320px]">
            <SelectItem value="all">All subcategories</SelectItem>
            {SUBCATEGORIES.map((s) => (
              <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[150px] max-md:min-h-[44px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as typeof stockFilter)}>
          <SelectTrigger className="w-full sm:w-[150px] max-md:min-h-[44px]">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="instock">In stock</SelectItem>
            <SelectItem value="oos">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Search by brand or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-[280px] max-md:min-h-[44px] order-first sm:order-none"
        />
        <div className="flex items-center justify-between gap-2 sm:ml-auto">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Showing {filtered.length} of {totalCount} products
          </span>
          {statusFiltered && (
            <Button variant="outline" size="sm"
              className="border-[#F4845F] text-[#F4845F] hover:bg-[#F4845F]/10 max-md:min-h-[44px] max-md:px-4"
              onClick={resetStatusStock}>
              Show all
            </Button>
          )}
        </div>
      </div>

      {/* Desktop: full table. Mobile: card list (no 16-col horizontal scroll). */}
      {!isMobile ? (
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[110px]">SKU</TableHead>
              <TableHead>Image</TableHead>
              <TableHead className="min-w-[180px]">Product Name</TableHead>
              <TableHead className="min-w-[120px]">Brand</TableHead>
              <TableHead>Size / Stage</TableHead>
              <TableHead>Weight Range (kg)</TableHead>
              <TableHead>Weight (kg)</TableHead>
              <TableHead>Pack Count</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead className="min-w-[150px]">Cost Price (₦)</TableHead>
              <TableHead>Retail Price (₦)</TableHead>
              <TableHead>In stock</TableHead>
              <TableHead className="min-w-[140px]">Vendor Name</TableHead>
              <TableHead className="min-w-[130px]">Vendor Phone</TableHead>
              <TableHead className="sticky right-0 bg-background z-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={17}><Skeleton className="h-6 w-full" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={17} className="text-center text-sm text-muted-foreground py-8">
                  No products match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.brand_id} className="cursor-pointer" onClick={() => setViewingRow(r)}>
                  <TableCell className="sticky left-0 bg-background z-10 font-mono text-xs">{dash(r.sku)}</TableCell>
                  <TableCell>
                    <div className="relative w-fit">
                      <Thumb row={r} />
                      {pendingMap[r.brand_id]?.image && <PendingBadge label="Image pending" />}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {dash(r.product_name)}
                      {pendingMap[r.brand_id]?.other && (
                        <PendingBadge label="Edit pending" inline
                          title={`Pending: ${(pendingMap[r.brand_id].otherFields || []).join(", ")}`} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{dash(r.brand)}</TableCell>
                  <TableCell>{dash(r.size_stage)}</TableCell>
                  <TableCell>{dash(r.weight_range_kg)}</TableCell>
                  <TableCell>{dash(r.weight_kg)}</TableCell>
                  <TableCell>{dash(r.pack_count)}</TableCell>
                  <TableCell>{dash(DIAPER_SUBCATS.has(r.subcategory ?? "") ? r.diaper_type : r.item_type)}</TableCell>
                  <TableCell>{dash(r.color)}</TableCell>
                  <TableCell>{dash(r.gender_relevant)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <CostPriceCell
                      row={r}
                      pendingValue={pendingMap[r.brand_id]?.cost_price}
                      isVendorManager={isVendorManager}
                      adminUserId={adminUser?.id}
                      onSaved={() => { refreshRows(); refreshPending(); }}
                    />
                  </TableCell>
                  <TableCell>{fmtNaira(r.retail_price)}</TableCell>
                  <TableCell>
                    <span className={r.in_stock ? "text-[#2D6A4F] font-medium" : "text-muted-foreground"}>
                      {r.in_stock ? "Yes" : "No"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {dash(r.vendor_name)}
                      {pendingMap[r.brand_id]?.vendor && <PendingBadge label="Vendor pending" inline />}
                    </div>
                  </TableCell>
                  <TableCell>{dash(r.vendor_phone)}</TableCell>
                  <TableCell className="sticky right-0 bg-background z-10" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => setViewingRow(r)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => setEditingRow(r)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      ) : (
        <VendorCardList
          rows={filtered}
          isLoading={isLoading}
          pendingMap={pendingMap}
          isVendorManager={isVendorManager}
          adminUserId={adminUser?.id}
          onView={setViewingRow}
          onEdit={setEditingRow}
          onSaved={() => { refreshRows(); refreshPending(); }}
        />
      )}
      </>
      )}

      {viewingRow && (
        <ProductDetailDialog row={viewingRow} onClose={() => setViewingRow(null)} />
      )}

      {editingRow && (
        <ProductEditDialog
          row={editingRow}
          isVendorManager={isVendorManager}
          isSuperAdmin={isSuperAdmin}
          adminUserId={adminUser?.id}
          onClose={() => setEditingRow(null)}
          onSaved={() => { refreshRows(); refreshPending(); }}
        />
      )}

      {addOpen && (
        <AddProductDialog
          adminUser={adminUser}
          onClose={() => setAddOpen(false)}
          onSubmitted={() => { setAddOpen(false); refreshPending(); }}
        />
      )}
    </div>
  );
}

/* ----------------------------- Vendors report ----------------------------- */
interface VendorReportRow {
  vendor_id: string;
  vendor_name: string | null;
  contact_person: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  location: string | null;
  payment_terms: string | null;
  is_active: boolean | null;
  created_at: string | null;
  products_assigned: number | null;
  products_active: number | null;
  products_in_stock: number | null;
  sold_lines_paid: number | null;
  units_sold_paid: number | null;
  revenue_paid: number | null;       // integer NAIRA
  last_sale_at: string | null;
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <div className="text-base font-bold text-[#2D6A4F]">{value}</div>
      <div className="text-muted-foreground text-[10px]">{label}</div>
    </div>
  );
}

function VendorReport() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendor-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_report" as any)
        .select("*")
        .order("revenue_paid", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as unknown as VendorReportRow[]) ?? [];
    },
    staleTime: 30_000,
  });

  const totals = useMemo(() => ({
    vendors: vendors.length,
    assigned: vendors.reduce((s, v) => s + (v.products_assigned || 0), 0),
    revenue: vendors.reduce((s, v) => s + (v.revenue_paid || 0), 0),
  }), [vendors]);

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" }) : "No sales yet";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-3 gap-2 flex-1">
          <ReportStat label="Vendors" value={String(totals.vendors)} />
          <ReportStat label="Products assigned" value={String(totals.assigned)} />
          <ReportStat label="Revenue (paid)" value={fmtNaira(totals.revenue)} />
        </div>
        <Button onClick={() => setCreateOpen(true)}
          className="bg-[#2D6A4F] hover:bg-[#245840] w-full sm:w-auto max-md:min-h-[44px]">
          <Plus className="w-4 h-4 mr-1" /> Create vendor
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : vendors.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">No vendors yet.</p>
      ) : isMobile ? (
        <div className="space-y-3">
          {vendors.map((v) => (
            <div key={v.vendor_id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold truncate">
                  {dash(v.vendor_name)}
                  {v.is_active === false && <span className="ml-1 text-[10px] text-muted-foreground">(inactive)</span>}
                </p>
                <span className="text-sm font-bold text-[#2D6A4F] whitespace-nowrap">{fmtNaira(v.revenue_paid || 0)}</span>
              </div>
              {[v.phone, v.whatsapp, v.location].some(Boolean) && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {[v.phone, v.whatsapp, v.location].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Chip>{v.products_assigned || 0} assigned</Chip>
                <Chip tone="forest">{v.products_in_stock || 0} in stock</Chip>
                <Chip>{v.units_sold_paid || 0} sold</Chip>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Last sale: {fmtDate(v.last_sale_at)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Vendor</TableHead>
                <TableHead className="min-w-[160px]">Contact</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>In stock</TableHead>
                <TableHead>Products sold</TableHead>
                <TableHead>Revenue (₦)</TableHead>
                <TableHead>Last sale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v) => (
                <TableRow key={v.vendor_id}>
                  <TableCell className="font-medium">
                    {dash(v.vendor_name)}
                    {v.is_active === false && <span className="ml-1 text-[10px] text-muted-foreground">(inactive)</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[v.phone, v.whatsapp, v.location].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>{v.products_assigned || 0}</TableCell>
                  <TableCell>{v.products_active || 0}</TableCell>
                  <TableCell>{v.products_in_stock || 0}</TableCell>
                  <TableCell>{v.units_sold_paid || 0}</TableCell>
                  <TableCell className="font-semibold">{fmtNaira(v.revenue_paid || 0)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(v.last_sale_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {createOpen && (
        <CreateVendorDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ["vendor-report"] });
            qc.invalidateQueries({ queryKey: ["vendors-picker"] });
          }}
        />
      )}
    </div>
  );
}

function CreateVendorDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({
    name: "", contact_person: "", phone: "", whatsapp: "", email: "", location: "", payment_terms: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) { toast.error("Vendor name is required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("vendors").insert({
        name: f.name.trim(),
        contact_person: f.contact_person.trim() || null,
        phone: f.phone.trim() || null,
        whatsapp: f.whatsapp.trim() || null,
        email: f.email.trim() || null,
        location: f.location.trim() || null,
        payment_terms: f.payment_terms.trim() || null,
        notes: f.notes.trim() || null,
        is_active: true,
      } as any);
      if (error) throw error;
      toast.success("Vendor created.");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create vendor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto max-md:[&_input]:min-h-[44px]">
        <DialogHeader>
          <DialogTitle>Create vendor</DialogTitle>
          <DialogDescription>Adds a vendor record. It appears in the report with zero stats until products and sales are linked.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Name *</Label>
            <Input value={f.name} onChange={upd("name")} />
          </div>
          <div>
            <Label>Contact person</Label>
            <Input value={f.contact_person} onChange={upd("contact_person")} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={f.phone} onChange={upd("phone")} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={f.whatsapp} onChange={upd("whatsapp")} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={f.email} onChange={upd("email")} />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={f.location} onChange={upd("location")} />
          </div>
          <div>
            <Label>Payment terms</Label>
            <Input value={f.payment_terms} onChange={upd("payment_terms")} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Input value={f.notes} onChange={upd("notes")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#2D6A4F] hover:bg-[#245840]">
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Create vendor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Thumb --------------------------------- */
function Thumb({ row, className = "w-10 h-10" }: { row: VendorRow; className?: string }) {
  const src = row.stored_image_url || row.image_url;
  if (!src) {
    return (
      <div className={`${className} rounded-md bg-muted flex items-center justify-center`}>
        <ImageOff className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }
  return <img src={src} alt={row.brand ?? ""} className={`${className} rounded-md object-cover border`} />;
}

/* ------------------------------- Mobile chip ------------------------------ */
function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "forest" | "amber" | "red" }) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    forest: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ----------------------------- Mobile card list --------------------------- */
function VendorCardList({
  rows, isLoading, pendingMap, isVendorManager, adminUserId, onView, onEdit, onSaved,
}: {
  rows: VendorRow[];
  isLoading: boolean;
  pendingMap: Record<string, PendingFlags>;
  isVendorManager: boolean;
  adminUserId: string | undefined;
  onView: (r: VendorRow) => void;
  onEdit: (r: VendorRow) => void;
  onSaved: () => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-10">No products match your filters.</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const p = pendingMap[r.brand_id];
        return (
          <div key={r.brand_id} onClick={() => onView(r)}
            className="rounded-lg border p-3 active:bg-muted/50 cursor-pointer">
            <div className="flex gap-3">
              <div className="relative shrink-0">
                <Thumb row={r} className="w-16 h-16" />
                {p?.image && <PendingBadge label="Image pending" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug line-clamp-2">{dash(r.product_name)}</p>
                <p className="text-sm text-muted-foreground truncate">{dash(r.brand)}</p>
                <p className="text-[11px] font-mono text-muted-foreground truncate">{dash(r.sku)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" title="Edit"
                onClick={(e) => { e.stopPropagation(); onEdit(r); }}>
                <Pencil className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              <Chip>{r.category_label || titleCase(r.subcategory ?? "—")}</Chip>
              <Chip tone={r.in_stock ? "forest" : "muted"}>{r.in_stock ? "In stock" : "Out of stock"}</Chip>
              <Chip tone={r.is_active ? "forest" : "red"}>{r.is_active ? "Active" : "Inactive"}</Chip>
              {p?.image && <Chip tone="amber">Image pending</Chip>}
              {p?.vendor && <Chip tone="amber">Vendor pending</Chip>}
              {p?.other && (
                <Chip tone="amber">
                  <span title={`Pending: ${(p.otherFields || []).join(", ")}`}>Edit pending</span>
                </Chip>
              )}
            </div>

            <div className="flex items-center justify-between mt-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Cost</span>
                <CostPriceCell
                  row={r}
                  pendingValue={p?.cost_price}
                  isVendorManager={isVendorManager}
                  adminUserId={adminUserId}
                  onSaved={onSaved}
                />
              </div>
              <span className="text-sm text-muted-foreground">Retail {fmtNaira(r.retail_price)}</span>
            </div>

            <p className="text-xs text-muted-foreground mt-2 truncate">
              {r.vendor_name
                ? `${r.vendor_name}${r.vendor_phone ? ` · ${r.vendor_phone}` : ""}`
                : "No vendor"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------- Cost price cell ---------------------------- */
function CostPriceCell({
  row, pendingValue, isVendorManager, adminUserId, onSaved,
}: {
  row: VendorRow;
  pendingValue: number | undefined;
  isVendorManager: boolean;
  adminUserId: string | undefined;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.cost_price ?? ""));
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = Math.round(Number(value));
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Enter a valid cost price");
      return;
    }
    if (next === row.cost_price) { setEditing(false); return; }
    setSaving(true);
    try {
      if (isVendorManager) {
        if (!adminUserId) throw new Error("No admin profile");
        const { error } = await supabase.from("admin_approval_requests").insert({
          action: "update",
          target_table: "brands",
          target_record_id: row.brand_id,
          proposed_data: { cost_price: next },
          requested_by: adminUserId,
          description: `Vendor cost price change: ${row.brand ?? ""} (${row.sku ?? ""}) → ₦${next.toLocaleString("en-NG")}`,
        } as any);
        if (error) throw error;
        toast.success("Cost price change submitted for approval.");
      } else {
        const { error } = await supabase
          .from("brands")
          .update({ cost_price: next })
          .eq("id", row.brand_id);
        if (error) throw error;
        toast.success("Cost price updated.");
      }
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save cost price");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 w-24"
          autoFocus
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-[#2D6A4F]" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving}
          onClick={() => { setValue(String(row.cost_price ?? "")); setEditing(false); }}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left hover:underline decoration-dotted"
        title="Edit cost price"
      >
        {fmtNaira(row.cost_price)}
      </button>
      {pendingValue != null && (
        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[11px] font-medium px-2 py-0.5 whitespace-nowrap">
          Pending: {fmtNaira(pendingValue)}
        </span>
      )}
    </div>
  );
}

/* ------------------------------ Pending badge ----------------------------- */
function PendingBadge({ label, inline = false, title }: { label: string; inline?: boolean; title?: string }) {
  if (inline) {
    return (
      <span title={title}
        className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[11px] font-medium px-2 py-0.5 whitespace-nowrap">
        {label}
      </span>
    );
  }
  return (
    <span
      className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-500 w-3 h-3 ring-2 ring-background"
      title={title || label}
    />
  );
}

/* --------------------------- Read-only detail panel ----------------------- */
function ProductDetailDialog({ row, onClose }: { row: VendorRow; onClose: () => void }) {
  const src = row.stored_image_url || row.image_url;
  const typeLabel = DIAPER_SUBCATS.has(row.subcategory ?? "") ? "Diaper type" : "Item type";
  const typeValue = DIAPER_SUBCATS.has(row.subcategory ?? "") ? row.diaper_type : row.item_type;
  const Field = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto max-md:[&_input]:min-h-[44px]">
        <DialogHeader>
          <DialogTitle>{dash(row.product_name)}</DialogTitle>
          <DialogDescription>{dash(row.brand)} · {dash(row.sku)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
          <div>
            {src ? (
              <img src={src} alt={row.brand ?? ""} className="w-full aspect-square rounded-lg object-cover border" />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                <ImageOff className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Subcategory" value={dash(row.category_label || titleCase(row.subcategory ?? "—"))} />
            <Field label="Size / Stage" value={dash(row.size_stage)} />
            <Field label={typeLabel} value={dash(typeValue)} />
            <Field label="Weight range (kg)" value={dash(row.weight_range_kg)} />
            <Field label="Weight (kg)" value={dash(row.weight_kg)} />
            <Field label="Pack count" value={dash(row.pack_count)} />
            <Field label="Color" value={dash(row.color)} />
            <Field label="Gender" value={dash(row.gender_relevant)} />
            <Field label="Cost price" value={fmtNaira(row.cost_price)} />
            <Field label="Retail price" value={fmtNaira(row.retail_price)} />
            <Field label="COGS %" value={row.cogs_percent == null ? "—" : `${row.cogs_percent}%`} />
            <Field label="In stock" value={row.in_stock ? "Yes" : "No"} />
            <Field label="Active" value={row.is_active ? "Yes" : "No"} />
          </div>
        </div>
        <div className="rounded-lg border p-3 mt-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Vendor</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Name" value={dash(row.vendor_name)} />
            <Field label="Phone" value={dash(row.vendor_phone)} />
            <Field label="WhatsApp" value={dash(row.vendor_whatsapp)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------- Edit: image replace + vendor details ----------------- */
function ProductEditDialog({
  row, isVendorManager, isSuperAdmin, adminUserId, onClose, onSaved,
}: {
  row: VendorRow;
  isVendorManager: boolean;
  isSuperAdmin: boolean;
  adminUserId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { data: vendors = [] } = useVendorsPicker();
  const isDiaper = DIAPER_SUBCATS.has(row.subcategory ?? "");

  // Load the real brands row (all editable columns) + the product name.
  const { data: brand, isLoading: brandLoading } = useQuery({
    queryKey: ["vendor-edit-brand", row.brand_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, product_id, brand_name, cost_price, price, compare_at_price, stored_image_url, image_url, thumbnail_url, weight_kg, weight_range_kg, pack_count, diaper_type, item_type, size_variant, variant_type, tier, in_stock, low_stock_threshold, vendor_id")
        .eq("id", row.brand_id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: product } = useQuery({
    queryKey: ["vendor-edit-product", row.product_id],
    enabled: !!row.product_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name").eq("id", row.product_id).single();
      if (error) throw error;
      return data as any;
    },
  });

  // Attribute form, seeded once from the loaded brand row.
  const [form, setForm] = useState<Record<string, string>>({});
  const [inStock, setInStock] = useState(true);
  const [productName, setProductName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [newImage, setNewImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (brand && !seeded) {
      const s = (v: any) => (v == null ? "" : String(v));
      setForm({
        cost_price: s(brand.cost_price), price: s(brand.price), compare_at_price: s(brand.compare_at_price),
        weight_kg: s(brand.weight_kg), weight_range_kg: s(brand.weight_range_kg), pack_count: s(brand.pack_count),
        diaper_type: s(brand.diaper_type), item_type: s(brand.item_type), size_variant: s(brand.size_variant),
        variant_type: s(brand.variant_type), tier: s(brand.tier), low_stock_threshold: s(brand.low_stock_threshold),
      });
      setInStock(brand.in_stock !== false);
      setBrandName(brand.brand_name ?? "");
      setSeeded(true);
    }
  }, [brand, seeded]);
  useEffect(() => { if (product) setProductName(product.name ?? ""); }, [product]);

  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Linked-vendor contact edit (direct for BOTH roles).
  const [vName, setVName] = useState(row.vendor_name ?? "");
  const [vPhone, setVPhone] = useState(row.vendor_phone ?? "");
  const [vWhatsapp, setVWhatsapp] = useState(row.vendor_whatsapp ?? "");
  const [vContact, setVContact] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  // Assign / reassign vendor (brands.vendor_id — direct for admin, approval for vendor).
  const [assignMode, setAssignMode] = useState<"existing" | "new">("existing");
  const [assignId, setAssignId] = useState<string>("");
  const [savingAssign, setSavingAssign] = useState(false);

  // Create-new-vendor inputs (assign mode "new").
  const [nvName, setNvName] = useState("");
  const [nvPhone, setNvPhone] = useState("");
  const [nvWhatsapp, setNvWhatsapp] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  // Apply a brands patch: admin writes directly, vendor routes through approval.
  async function applyBrandPatch(patch: Record<string, any>, description: string): Promise<"pending" | "applied"> {
    if (isVendorManager) {
      if (!adminUserId) throw new Error("No admin profile");
      const { error } = await supabase.from("admin_approval_requests").insert({
        action: "update",
        target_table: "brands",
        target_record_id: row.brand_id,
        proposed_data: patch,
        requested_by: adminUserId,
        description,
      } as any);
      if (error) throw error;
      return "pending";
    }
    const { error } = await supabase.from("brands").update(patch as any).eq("id", row.brand_id);
    if (error) throw error;
    return "applied";
  }

  // Save all changed brand attributes (+ image, + super-admin name/brand_name).
  // Admin writes directly; vendor manager submits ONE approval request carrying
  // every changed key. Only CHANGED fields are sent. brand_name is super-admin
  // only (and DB-locked); product name writes to the products table directly.
  async function saveAll() {
    if (!brand) return;
    setSaving(true);
    try {
      const patch: Record<string, any> = {};
      const intOrNull = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
      const floatOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
      const textOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
      const diffNum = (key: string, parser: (v: string) => number | null, cur: any) => {
        const nv = parser(form[key] ?? "");
        const curN = cur == null ? null : Number(cur);
        if (nv !== curN) patch[key] = nv;
      };
      const diffText = (key: string, cur: any) => {
        const nv = textOrNull(form[key] ?? "");
        if (nv !== (cur ?? null)) patch[key] = nv;
      };
      // Money — INTEGER NAIRA (no /100). cost_price is vendor-editable.
      diffNum("cost_price", intOrNull, brand.cost_price);
      // Selling price — SUPER ADMIN ONLY (DB trigger rejects non-super writes;
      // the approval fn ignores these keys). Never include them otherwise or the
      // whole update would be rejected.
      if (isSuperAdmin) {
        diffNum("price", intOrNull, brand.price);
        diffNum("compare_at_price", intOrNull, brand.compare_at_price);
      }
      diffNum("weight_kg", floatOrNull, brand.weight_kg);
      diffNum("pack_count", intOrNull, brand.pack_count);
      diffNum("low_stock_threshold", intOrNull, brand.low_stock_threshold);
      diffText("weight_range_kg", brand.weight_range_kg);
      diffText("size_variant", brand.size_variant);
      diffText("variant_type", brand.variant_type);
      diffText("tier", brand.tier);
      // Category-aware type: only the relevant one (never both).
      if (isDiaper) diffText("diaper_type", brand.diaper_type);
      else diffText("item_type", brand.item_type);
      if (inStock !== (brand.in_stock !== false)) patch.in_stock = inStock;
      // Image (self-hosted upload URL) — write both columns; display prefers stored_image_url.
      if (newImage) { patch.stored_image_url = newImage; patch.image_url = newImage; }
      // brand_name — SUPER ADMIN ONLY (DB trigger rejects others). Never proposed for the vendor.
      if (isSuperAdmin && brandName.trim() !== (brand.brand_name ?? "")) patch.brand_name = brandName.trim();
      // Product name — SUPER ADMIN ONLY, written to the products table directly.
      const productNameChanged = isSuperAdmin && !!product && productName.trim() !== (product.name ?? "");

      if (isVendorManager) {
        // Fold the vendor assign/create selection into the SAME request so one
        // edit = ONE approval request (never split per field/section).
        if (assignMode === "existing" && assignId && assignId !== (row.vendor_id ?? "")) {
          patch.vendor_id = assignId;
        } else if (assignMode === "new" && nvName.trim()) {
          patch.new_vendor_name = nvName.trim();
          patch.new_vendor_phone = nvPhone.trim() || null;
          patch.new_vendor_whatsapp = nvWhatsapp.trim() || null;
        }
        if (Object.keys(patch).length === 0) {
          toast("No changes to save");
          setSaving(false);
          return;
        }
        if (!adminUserId) throw new Error("No admin profile");
        // OLD values keyed exactly like proposed_data, for the super-admin
        // before/after review. (new_vendor_* is a creation — no prior value.)
        const oldValueFor = (key: string): any => {
          if (key === "vendor_id") return row.vendor_id ?? null;
          if (key === "new_vendor_name" || key === "new_vendor_phone" || key === "new_vendor_whatsapp") return null;
          return (brand as any)[key] ?? null;
        };
        const previous: Record<string, any> = {};
        for (const k of Object.keys(patch)) previous[k] = oldValueFor(k);
        const { error } = await supabase.from("admin_approval_requests").insert({
          action: "update", target_table: "brands", target_record_id: row.brand_id,
          proposed_data: patch, previous_data: previous, requested_by: adminUserId,
          description: `Vendor edit: ${row.product_name ?? row.brand ?? ""} (${row.sku ?? ""}) — ${Object.keys(patch).join(", ")}`,
        } as any);
        if (error) throw error;
        toast.success("Changes submitted for approval.");
      } else {
        if (Object.keys(patch).length === 0 && !productNameChanged) {
          toast("No changes to save");
          setSaving(false);
          return;
        }
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from("brands").update(patch as any).eq("id", row.brand_id);
          if (error) throw error;
        }
        if (productNameChanged) {
          const { error } = await supabase.from("products").update({ name: productName.trim() }).eq("id", row.product_id);
          if (error) throw error;
        }
        toast.success("Changes saved.");
      }
      qc.invalidateQueries({ queryKey: ["vendor-edit-brand", row.brand_id] });
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function saveContact() {
    if (!row.vendor_id) return;
    if (!vName.trim()) { toast.error("Vendor name is required"); return; }
    setSavingContact(true);
    try {
      const { error } = await supabase
        .from("vendors")
        .update({
          name: vName.trim(),
          phone: vPhone.trim() || null,
          whatsapp: vWhatsapp.trim() || null,
          contact_person: vContact.trim() || null,
        })
        .eq("id", row.vendor_id);
      if (error) throw error;
      toast.success("Vendor updated.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update vendor");
    } finally {
      setSavingContact(false);
    }
  }

  async function assignVendor() {
    if (!assignId) { toast.error("Pick a vendor"); return; }
    setSavingAssign(true);
    try {
      const res = await applyBrandPatch(
        { vendor_id: assignId },
        `Vendor assignment: ${row.brand ?? ""} (${row.sku ?? ""})`,
      );
      toast.success(res === "pending" ? "Vendor assignment submitted for approval." : "Vendor assigned.");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to assign vendor");
    } finally {
      setSavingAssign(false);
    }
  }

  // Create a new vendor and link it. Full admin: insert vendor + write
  // brands.vendor_id directly. Vendor account: route through approval with the
  // new_vendor_* keys (no vendors/brands write).
  async function createAndAssignVendor() {
    if (!nvName.trim()) { toast.error("Vendor name is required"); return; }
    setSavingCreate(true);
    try {
      if (isVendorManager) {
        if (!adminUserId) throw new Error("No admin profile");
        const { error } = await supabase.from("admin_approval_requests").insert({
          action: "update",
          target_table: "brands",
          target_record_id: row.brand_id,
          proposed_data: {
            new_vendor_name: nvName.trim(),
            new_vendor_phone: nvPhone.trim() || null,
            new_vendor_whatsapp: nvWhatsapp.trim() || null,
          },
          requested_by: adminUserId,
          description: `Vendor create+assign: ${row.brand ?? ""} (${row.sku ?? ""})`,
        } as any);
        if (error) throw error;
        toast.success("New vendor submitted for approval.");
      } else {
        const { data: created, error: cErr } = await supabase
          .from("vendors")
          .insert({
            name: nvName.trim(),
            phone: nvPhone.trim() || null,
            whatsapp: nvWhatsapp.trim() || null,
            is_active: true,
          } as any)
          .select("id")
          .single();
        if (cErr) throw cErr;
        const { error: bErr } = await supabase
          .from("brands")
          .update({ vendor_id: (created as any).id })
          .eq("id", row.brand_id);
        if (bErr) throw bErr;
        toast.success("Vendor created and assigned.");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create vendor");
    } finally {
      setSavingCreate(false);
    }
  }

  const currentImg = brand?.stored_image_url || brand?.image_url || row.stored_image_url || row.image_url;
  const lockNote = <span className="text-[10px] font-normal text-muted-foreground">(super admin only)</span>;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto max-md:[&_input]:min-h-[44px]">
        <DialogHeader>
          <DialogTitle>Edit · {dash(row.brand)}</DialogTitle>
          <DialogDescription>
            {isVendorManager
              ? "Attribute changes are submitted for approval; linked-vendor contact edits apply directly."
              : "Changes apply immediately."}
          </DialogDescription>
        </DialogHeader>

        {brandLoading || !seeded ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
        <>
        {/* Names — super admin only; read-only for everyone else */}
        <section className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Product name {!isSuperAdmin && lockNote}</Label>
              {isSuperAdmin
                ? <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
                : <p className="text-sm font-medium py-2">{dash(row.product_name)}</p>}
            </div>
            <div>
              <Label>Brand name {!isSuperAdmin && lockNote}</Label>
              {isSuperAdmin
                ? <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
                : <p className="text-sm font-medium py-2">{dash(row.brand)}</p>}
            </div>
          </div>
        </section>

        {/* Image — fixed: current image shown separately so the upload control is
            always reachable (the old currentUrl={newImage||currentImg} kept the
            file input hidden whenever a brand already had an image). */}
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold text-[#2D6A4F]">Product image</h3>
          <div className="flex items-center gap-3">
            {currentImg && !newImage && (
              <img src={currentImg} alt="current" className="w-16 h-16 rounded-lg object-cover border" />
            )}
            <BrandImageUpload
              label="Replace image"
              currentUrl={newImage}
              onUploaded={setNewImage}
              onRemove={() => setNewImage("")}
            />
          </div>
          {newImage && <p className="text-[11px] text-amber-700">New image will be saved with your changes below.</p>}
        </section>

        {/* Brand attributes */}
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold text-[#2D6A4F]">Attributes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Cost price (₦)</Label>
              <Input type="number" value={form.cost_price ?? ""} onChange={upd("cost_price")} />
            </div>
            <div>
              <Label>Price (₦) {!isSuperAdmin && lockNote}</Label>
              {isSuperAdmin
                ? <Input type="number" value={form.price ?? ""} onChange={upd("price")} />
                : <p className="text-sm font-medium py-2">{fmtNaira(brand?.price)}</p>}
            </div>
            <div>
              <Label>Compare-at price (₦) {!isSuperAdmin && lockNote}</Label>
              {isSuperAdmin
                ? <Input type="number" value={form.compare_at_price ?? ""} onChange={upd("compare_at_price")} />
                : <p className="text-sm font-medium py-2">{fmtNaira(brand?.compare_at_price)}</p>}
            </div>
            <div>
              <Label>Weight (kg)</Label>
              <Input type="number" step="any" value={form.weight_kg ?? ""} onChange={upd("weight_kg")} />
            </div>
            <div>
              <Label>Weight range (kg)</Label>
              <Input value={form.weight_range_kg ?? ""} onChange={upd("weight_range_kg")} placeholder="e.g. 4–8 kg" />
            </div>
            <div>
              <Label>Pack count</Label>
              <Input type="number" value={form.pack_count ?? ""} onChange={upd("pack_count")} />
            </div>
            <div>
              <Label>{isDiaper ? "Diaper type" : "Item type"}</Label>
              {isDiaper
                ? <Input value={form.diaper_type ?? ""} onChange={upd("diaper_type")} placeholder="e.g. Tape, Pant" />
                : <Input value={form.item_type ?? ""} onChange={upd("item_type")} placeholder="e.g. Formula, Onesie" />}
            </div>
            <div>
              <Label>Size / variant</Label>
              <Input value={form.size_variant ?? ""} onChange={upd("size_variant")} />
            </div>
            <div>
              <Label>Variant type</Label>
              <Input value={form.variant_type ?? ""} onChange={upd("variant_type")} />
            </div>
            <div>
              <Label>Tier</Label>
              <Input value={form.tier ?? ""} onChange={upd("tier")} />
            </div>
            <div>
              <Label>Low-stock threshold</Label>
              <Input type="number" value={form.low_stock_threshold ?? ""} onChange={upd("low_stock_threshold")} />
            </div>
            <div>
              <Label>In stock</Label>
              <Select value={inStock ? "yes" : "no"} onValueChange={(v) => setInStock(v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">In stock</SelectItem>
                  <SelectItem value="no">Out of stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={saveAll} disabled={saving}
            className="bg-[#2D6A4F] hover:bg-[#245840] w-full sm:w-auto">
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {isVendorManager ? "Submit changes for approval" : "Save changes"}
          </Button>
        </section>
        </>
        )}

        {/* Linked-vendor contact edit — direct for both roles */}
        {row.vendor_id && (
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold text-[#2D6A4F]">Vendor details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={vName} onChange={(e) => setVName(e.target.value)} />
              </div>
              <div>
                <Label>Contact person</Label>
                <Input value={vContact} onChange={(e) => setVContact(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={vPhone} onChange={(e) => setVPhone(e.target.value)} />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={vWhatsapp} onChange={(e) => setVWhatsapp(e.target.value)} />
              </div>
            </div>
            <Button onClick={saveContact} disabled={savingContact} variant="outline">
              {savingContact && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save vendor details
            </Button>
          </section>
        )}

        {/* Assign / reassign vendor — admin direct, vendor via approval */}
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold text-[#2D6A4F]">
            {row.vendor_id ? "Reassign vendor" : "Assign vendor"}
          </h3>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={assignMode === "existing" ? "default" : "outline"}
              className={assignMode === "existing" ? "bg-[#2D6A4F] hover:bg-[#245840]" : ""}
              onClick={() => setAssignMode("existing")}>Existing vendor</Button>
            <Button type="button" size="sm" variant={assignMode === "new" ? "default" : "outline"}
              className={assignMode === "new" ? "bg-[#2D6A4F] hover:bg-[#245840]" : ""}
              onClick={() => setAssignMode("new")}>New vendor</Button>
          </div>

          {assignMode === "existing" ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>Vendor</Label>
                <Select value={assignId} onValueChange={setAssignId}>
                  <SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isVendorManager && (
                <Button onClick={assignVendor} disabled={savingAssign || !assignId}
                  className="bg-[#2D6A4F] hover:bg-[#245840]">
                  {savingAssign && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Assign
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <Label>Name *</Label>
                  <Input value={nvName} onChange={(e) => setNvName(e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={nvPhone} onChange={(e) => setNvPhone(e.target.value)} />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input value={nvWhatsapp} onChange={(e) => setNvWhatsapp(e.target.value)} />
                </div>
              </div>
              {!isVendorManager && (
                <Button onClick={createAndAssignVendor} disabled={savingCreate || !nvName.trim()}
                  className="bg-[#2D6A4F] hover:bg-[#245840]">
                  {savingCreate && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Create & assign vendor
                </Button>
              )}
            </div>
          )}
          {isVendorManager && (
            <p className="text-[11px] text-muted-foreground">
              Pick or enter a vendor here, then click <span className="font-semibold">Submit changes for approval</span> above —
              it's included in the same request.
            </p>
          )}
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Add new product ---------------------------- */
function AddProductDialog({
  adminUser, onClose, onSubmitted,
}: {
  adminUser: { id: string; auth_user_id: string; email: string } | null | undefined;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { data: products = [] } = useAllProducts();
  const { data: vendors = [] } = useVendorsPicker();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [productSearch, setProductSearch] = useState("");
  const [vendorMode, setVendorMode] = useState<"none" | "existing" | "new">("none");
  const [addVendorId, setAddVendorId] = useState<string>("");
  const [addVName, setAddVName] = useState("");
  const [addVPhone, setAddVPhone] = useState("");
  const [addVWhatsapp, setAddVWhatsapp] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [existingName, setExistingName] = useState<string>("");
  const [existingSubcat, setExistingSubcat] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [brandName, setBrandName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [color, setColor] = useState("");
  const [sizeVariant, setSizeVariant] = useState("");
  const [itemType, setItemType] = useState("");
  const [packCount, setPackCount] = useState("");
  const [diaperType, setDiaperType] = useState("");
  const [weightRange, setWeightRange] = useState("");
  const [saving, setSaving] = useState(false);

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = (products as any[]).map((p) => ({
      id: p.id as string,
      name: (p.name ?? p.title ?? "") as string,
      subcategory: (p.subcategory ?? null) as string | null,
    }));
    // Driven by the search text — no query, no list (prevents the full catalog
    // from bleeding through under the box).
    if (!q) return [];
    return list.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, productSearch]);

  // Show the result list only while actively searching; once a product is
  // selected the search is cleared and the list collapses to "Selected: X".
  const showProductResults = productSearch.trim().length >= 1;

  // Active subcategory: the picker (new product) or the selected product's own.
  const activeSubcat = mode === "new" ? (subcategory || null) : existingSubcat;
  const hasSubcat = mode === "new" ? !!subcategory : !!existingId;
  const fields = fieldsFor(activeSubcat);
  const has = (f: AttrField) => fields.includes(f);
  const isDiaperCat = DIAPER_SUBCATS.has(activeSubcat ?? "");
  const sizeLabel = activeSubcat === "baby-formula" ? "Stage" : "Size / Variant";

  async function submit() {
    if (!adminUser) { toast.error("No admin profile"); return; }
    if (mode === "existing" && !existingId) { toast.error("Pick an existing product"); return; }
    if (mode === "new" && !newName.trim()) { toast.error("Enter a new product name"); return; }
    if (mode === "new" && !subcategory) { toast.error("Choose a subcategory"); return; }
    if (!brandName.trim()) { toast.error("Brand name is required"); return; }
    const cp = Math.round(Number(costPrice));
    if (!Number.isFinite(cp) || cp <= 0) { toast.error("Enter a valid cost price"); return; }
    if (!imageUrl) { toast.error("Upload a product image"); return; }
    const wk = Number(weightKg);
    if (!Number.isFinite(wk) || wk <= 0) { toast.error("Enter the weight in kg"); return; }
    if (vendorMode === "existing" && !addVendorId) { toast.error("Pick a vendor"); return; }
    if (vendorMode === "new" && !addVName.trim()) { toast.error("Enter the new vendor's name"); return; }

    setSaving(true);
    try {
      const productName = mode === "new" ? newName.trim() : existingName;
      const { data: pending, error: pErr } = await supabase
        .from("pending_products" as any)
        .insert({
          existing_product_id: mode === "existing" ? existingId : null,
          new_product_name: mode === "new" ? newName.trim() : null,
          subcategory: activeSubcat,
          brand_name: brandName.trim(),
          cost_price: cp,
          image_url: imageUrl,
          weight_kg: wk,
          // Only the fields relevant to this subcategory are populated; the rest
          // stay null. Type routes to diaper_type for diapers/wipes, else item_type.
          diaper_type: isDiaperCat ? (diaperType.trim() || null) : null,
          item_type: !isDiaperCat ? (itemType.trim() || null) : null,
          size_variant: has("size") ? (sizeVariant.trim() || null) : null,
          stage: null,
          pack_count: has("pack_count") && packCount ? Math.round(Number(packCount)) : null,
          color: has("color") ? (color.trim() || null) : null,
          weight_range_kg: has("weight_range_kg") ? (weightRange.trim() || null) : null,
          // Vendor: existing → vendor_id; new → vendor_name/phone/whatsapp; none → all null.
          // The approval promotion links the existing vendor or creates the new one.
          vendor_id: vendorMode === "existing" ? addVendorId : null,
          vendor_name: vendorMode === "new" ? addVName.trim() : null,
          vendor_phone: vendorMode === "new" ? (addVPhone.trim() || null) : null,
          vendor_whatsapp: vendorMode === "new" ? (addVWhatsapp.trim() || null) : null,
          submitted_by: adminUser.auth_user_id,
          submitted_by_email: adminUser.email,
          status: "pending",
        } as any)
        .select("id")
        .single();
      if (pErr) throw pErr;

      const { error: aErr } = await supabase.from("admin_approval_requests").insert({
        action: "create_product",
        target_table: "pending_products",
        target_record_id: (pending as any).id,
        proposed_data: {
          brand_name: brandName.trim(),
          cost_price: cp,
          product: mode === "new" ? newName.trim() : existingId,
        },
        requested_by: adminUser.id,
        description: `Vendor new product: ${brandName.trim()} for ${productName || "(new product)"}`,
      } as any);
      if (aErr) throw aErr;

      toast.success("Product submitted for approval.");
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.message || "Failed to submit product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto max-md:[&_input]:min-h-[44px]">
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>Submitted to the approvals queue. Nothing goes live until approved.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product: existing or new */}
          <div>
            <Label>Product</Label>
            <div className="flex gap-2 mt-1 mb-2">
              <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"}
                className={mode === "existing" ? "bg-[#2D6A4F] hover:bg-[#245840]" : ""}
                onClick={() => setMode("existing")}>Existing</Button>
              <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"}
                className={mode === "new" ? "bg-[#2D6A4F] hover:bg-[#245840]" : ""}
                onClick={() => setMode("new")}>New product</Button>
            </div>
            {mode === "existing" ? (
              <div>
                <Input placeholder="Search products…" value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)} />
                {existingId && !showProductResults && (
                  <p className="text-xs text-[#2D6A4F] mt-1">Selected: {existingName}</p>
                )}
                {showProductResults && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md border divide-y">
                  {productMatches.map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { setExistingId(p.id); setExistingName(p.name); setExistingSubcat(p.subcategory); setProductSearch(""); }}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-muted ${existingId === p.id ? "bg-muted font-medium" : ""}`}>
                      {p.name}
                    </button>
                  ))}
                  {productMatches.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
                  )}
                </div>
                )}
              </div>
            ) : (
              <Input placeholder="New product name" value={newName}
                onChange={(e) => setNewName(e.target.value)} />
            )}
          </div>

          {mode === "new" && (
            <div>
              <Label>Subcategory</Label>
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {SUBCATEGORIES.map((s) => (
                    <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Universal fields — always shown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Brand name *</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
            </div>
            <div>
              <Label>Cost price (₦) *</Label>
              <Input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <div>
              <Label>Weight (kg) *</Label>
              <Input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
          </div>

          {/* Category-aware attributes — only those relevant to the subcategory */}
          {!hasSubcat ? (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
              {mode === "new" ? "Choose a subcategory" : "Pick a product"} to see the relevant attributes.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {has("type") && (
                <div>
                  <Label>{isDiaperCat ? "Diaper type" : "Item type"}</Label>
                  {isDiaperCat ? (
                    <Input value={diaperType} onChange={(e) => setDiaperType(e.target.value)}
                      placeholder="e.g. Tape, Pant, Wet wipes" />
                  ) : (
                    <Input value={itemType} onChange={(e) => setItemType(e.target.value)}
                      placeholder="e.g. Formula, Onesie, Electric Pump" />
                  )}
                </div>
              )}
              {has("size") && (
                <div>
                  <Label>{sizeLabel}</Label>
                  <Input value={sizeVariant} onChange={(e) => setSizeVariant(e.target.value)} />
                </div>
              )}
              {has("pack_count") && (
                <div>
                  <Label>Pack count</Label>
                  <Input type="number" value={packCount} onChange={(e) => setPackCount(e.target.value)} />
                </div>
              )}
              {has("color") && (
                <div>
                  <Label>Color</Label>
                  <Input value={color} onChange={(e) => setColor(e.target.value)} />
                </div>
              )}
              {has("weight_range_kg") && (
                <div className="col-span-2">
                  <Label>Weight range (kg)</Label>
                  <Input value={weightRange} onChange={(e) => setWeightRange(e.target.value)} placeholder="e.g. 4–8 kg" />
                </div>
              )}
              {/* TODO: gender is product-level (products.gender_relevant) and has no
                  pending_products column, so it isn't wired into this brand-oriented
                  submission form. Offer where the map lists "gender" once supported. */}
            </div>
          )}

          <div>
            <BrandImageUpload label="Product image *" currentUrl={imageUrl} onUploaded={setImageUrl}
              onRemove={() => setImageUrl("")} />
          </div>

          {/* Vendor — optional: none / existing / new */}
          <div className="border-t pt-3">
            <Label>Vendor</Label>
            <div className="flex flex-wrap gap-2 mt-1 mb-2">
              {(["none", "existing", "new"] as const).map((m) => (
                <Button key={m} type="button" size="sm" variant={vendorMode === m ? "default" : "outline"}
                  className={vendorMode === m ? "bg-[#2D6A4F] hover:bg-[#245840]" : ""}
                  onClick={() => setVendorMode(m)}>
                  {m === "none" ? "No vendor" : m === "existing" ? "Existing vendor" : "New vendor"}
                </Button>
              ))}
            </div>
            {vendorMode === "existing" && (
              <Select value={addVendorId} onValueChange={setAddVendorId}>
                <SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {vendorMode === "new" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <Label>Name *</Label>
                  <Input value={addVName} onChange={(e) => setAddVName(e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={addVPhone} onChange={(e) => setAddVPhone(e.target.value)} />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input value={addVWhatsapp} onChange={(e) => setAddVWhatsapp(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-[#2D6A4F] hover:bg-[#245840]">
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
