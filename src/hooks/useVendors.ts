import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// vendors / brands.vendor_id aren't in generated types yet; cast to any.
const supabase = supabaseTyped as any;

const STALE_60 = 60 * 1000;

export interface Vendor {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  payment_terms: string | null;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const VENDORS_KEY = ["vendors"] as const;

function invalidateVendors(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: VENDORS_KEY });
  qc.invalidateQueries({ queryKey: ["vendor"] });
  qc.invalidateQueries({ queryKey: ["vendor-orders"] });
}

export function useVendors(activeOnly = false) {
  return useQuery({
    queryKey: [...VENDORS_KEY, { activeOnly }],
    queryFn: async () => {
      let q = supabase.from("vendors").select("*").order("name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Vendor[];
    },
    staleTime: STALE_60,
  });
}

export function useVendorWithBrands(vendorId: string | null | undefined) {
  return useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: async () => {
      if (!vendorId) return null;
      const { data, error } = await supabase
        .from("vendors")
        .select("*, brands(*, products(name, subcategory, image_url))")
        .eq("id", vendorId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!vendorId,
    staleTime: STALE_60,
  });
}

export function useUpsertVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Vendor> & { name: string }) => {
      const payload: any = { ...input };
      const { data, error } = await supabase.from("vendors").upsert(payload).select().single();
      if (error) throw error;
      return data as Vendor;
    },
    onSuccess: () => invalidateVendors(qc),
  });
}

export function useToggleVendorActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("vendors").update({ is_active: isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateVendors(qc),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete: FKs may exist. Hide it instead of deleting.
      const { error } = await supabase.from("vendors").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateVendors(qc),
  });
}

export function useLinkBrandToVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ brandId, vendorId }: { brandId: string; vendorId: string }) => {
      const { error } = await supabase.from("brands").update({ vendor_id: vendorId }).eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => invalidateVendors(qc),
  });
}

export function useUnlinkBrandFromVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ brandId }: { brandId: string }) => {
      const { error } = await supabase.from("brands").update({ vendor_id: null }).eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => invalidateVendors(qc),
  });
}

export interface VendorOrderRow {
  id: string;
  order_number: string;
  created_at: string;
  customer_name: string;
  order_status: string;
  order_items: Array<{
    product_name: string;
    brand_name: string | null;
    quantity: number;
    brands: { vendor_id: string | null } | null;
  }>;
}

export function useOrdersByVendor(
  vendorId: string | null | undefined,
  dateRange?: { from?: string; to?: string },
) {
  return useQuery({
    queryKey: ["vendor-orders", vendorId, dateRange?.from, dateRange?.to],
    queryFn: async () => {
      if (!vendorId) return [];
      let q = supabase
        .from("orders")
        .select(
          "id, order_number, created_at, customer_name, order_status, order_items!inner(product_name, brand_name, quantity, brands!inner(vendor_id))"
        )
        .eq("order_items.brands.vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (dateRange?.from) q = q.gte("created_at", dateRange.from);
      if (dateRange?.to) q = q.lte("created_at", dateRange.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as VendorOrderRow[];
    },
    enabled: !!vendorId,
    staleTime: STALE_60,
  });
}

/** All brands joined to product info — used by the brand picker dialog. */
export function useAllBrandsForPicker() {
  return useQuery({
    queryKey: ["brands-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, brand_name, sku, vendor_id, products(name, subcategory)")
        .order("brand_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_60,
  });
}
