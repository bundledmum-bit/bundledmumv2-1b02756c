import { useQuery } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// vendors / brands / products are typed; cast for the count-only call shapes.
const supabase = supabaseTyped as any;

export interface VendorMetrics {
  activeVendors: number;
  inactiveVendors: number;
  vendorsNoBrands: number;
  activeVendorsNoBrands: number;
  vendorsNoBrandsIds: string[];
  brandsWithVendor: number;
  totalBrands: number;
  productsWithVendor: number;
  totalActiveProducts: number;
}

/**
 * Aggregate metric counts powering the 5-card strip on /admin/vendors.
 * Single fan-out via Promise.all; client-side derives the
 * "vendors with no brands" set since PostgREST can't express it cheaply.
 */
export function useVendorMetrics() {
  return useQuery<VendorMetrics>({
    queryKey: ["vendor-metrics"],
    queryFn: async () => {
      const [
        activeVendors,
        inactiveVendors,
        allVendors,
        brandsWithVendor,
        totalBrands,
        activeProducts,
        productsWithVendor,
      ] = await Promise.all([
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("is_active", false),
        supabase.from("vendors").select("id, is_active"),
        supabase.from("brands").select("vendor_id").not("vendor_id", "is", null),
        supabase.from("brands").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("brands").select("product_id").not("vendor_id", "is", null),
      ]);

      const vendorIdsWithBrands = new Set(
        (brandsWithVendor.data || []).map((b: any) => b.vendor_id).filter(Boolean),
      );
      const allVendorRows: Array<{ id: string; is_active: boolean }> = allVendors.data || [];
      const vendorsNoBrands = allVendorRows.filter(v => !vendorIdsWithBrands.has(v.id));
      const activeVendorsNoBrands = vendorsNoBrands.filter(v => v.is_active);
      const distinctProductsWithVendor = new Set(
        (productsWithVendor.data || []).map((b: any) => b.product_id).filter(Boolean),
      ).size;

      return {
        activeVendors: activeVendors.count ?? 0,
        inactiveVendors: inactiveVendors.count ?? 0,
        vendorsNoBrands: vendorsNoBrands.length,
        activeVendorsNoBrands: activeVendorsNoBrands.length,
        vendorsNoBrandsIds: vendorsNoBrands.map(v => v.id),
        brandsWithVendor: (brandsWithVendor.data || []).length,
        totalBrands: totalBrands.count ?? 0,
        productsWithVendor: distinctProductsWithVendor,
        totalActiveProducts: activeProducts.count ?? 0,
      };
    },
    staleTime: 60 * 1000,
  });
}
