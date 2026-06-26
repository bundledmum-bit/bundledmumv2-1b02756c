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
}

export default function AdminVendors() {
  const qc = useQueryClient();
  const { data: adminUser } = useAdminUser();
  const isVendorManager = adminUser?.email === VENDOR_MANAGER_EMAIL;
  const isMobile = useIsMobile();

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
        if (pd.stored_image_url != null || pd.image_url != null) entry.image = true;
        // Either assigning an existing vendor (vendor_id) or creating a new one
        // (new_vendor_name) counts as a pending vendor change.
        if (pd.vendor_id != null || pd.new_vendor_name != null) entry.vendor = true;
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
        <Button onClick={() => setAddOpen(true)}
          className="bg-[#2D6A4F] hover:bg-[#245840] w-full sm:w-auto max-md:min-h-[44px]">
          <Plus className="w-4 h-4 mr-1" /> Add Product
        </Button>
      </div>

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
                  <TableCell className="font-medium">{dash(r.product_name)}</TableCell>
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

      {viewingRow && (
        <ProductDetailDialog row={viewingRow} onClose={() => setViewingRow(null)} />
      )}

      {editingRow && (
        <ProductEditDialog
          row={editingRow}
          isVendorManager={isVendorManager}
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
function PendingBadge({ label, inline = false }: { label: string; inline?: boolean }) {
  if (inline) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[11px] font-medium px-2 py-0.5 whitespace-nowrap">
        {label}
      </span>
    );
  }
  return (
    <span
      className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-500 w-3 h-3 ring-2 ring-background"
      title={label}
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
  row, isVendorManager, adminUserId, onClose, onSaved,
}: {
  row: VendorRow;
  isVendorManager: boolean;
  adminUserId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: vendors = [] } = useVendorsPicker();

  const [newImage, setNewImage] = useState("");
  const [savingImage, setSavingImage] = useState(false);

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

  async function saveImage() {
    if (!newImage) { toast.error("Upload a new image first"); return; }
    setSavingImage(true);
    try {
      const res = await applyBrandPatch(
        { stored_image_url: newImage, image_url: newImage },
        `Vendor image change: ${row.brand ?? ""} (${row.sku ?? ""})`,
      );
      toast.success(res === "pending" ? "Image change submitted for approval." : "Image updated.");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save image");
    } finally {
      setSavingImage(false);
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

  const currentImg = row.stored_image_url || row.image_url;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto max-md:[&_input]:min-h-[44px]">
        <DialogHeader>
          <DialogTitle>Edit · {dash(row.brand)}</DialogTitle>
          <DialogDescription>
            {isVendorManager
              ? "Image and vendor assignment are submitted for approval; linked-vendor contact edits apply directly."
              : "Changes apply immediately."}
          </DialogDescription>
        </DialogHeader>

        {/* Image replace */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[#2D6A4F]">Product image</h3>
          <BrandImageUpload
            label="Replace image"
            currentUrl={newImage || currentImg}
            onUploaded={setNewImage}
            onRemove={() => setNewImage("")}
          />
          <Button onClick={saveImage} disabled={savingImage || !newImage}
            className="bg-[#2D6A4F] hover:bg-[#245840]">
            {savingImage && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {isVendorManager ? "Submit image for approval" : "Save image"}
          </Button>
        </section>

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
              <Button onClick={assignVendor} disabled={savingAssign || !assignId}
                className="bg-[#2D6A4F] hover:bg-[#245840]">
                {savingAssign && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {isVendorManager ? "Submit" : "Assign"}
              </Button>
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
              <Button onClick={createAndAssignVendor} disabled={savingCreate || !nvName.trim()}
                className="bg-[#2D6A4F] hover:bg-[#245840]">
                {savingCreate && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {isVendorManager ? "Submit new vendor for approval" : "Create & assign vendor"}
              </Button>
            </div>
          )}
          {isVendorManager && (
            <p className="text-[11px] text-muted-foreground">
              Vendor assignment / creation is submitted for super-admin approval.
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
