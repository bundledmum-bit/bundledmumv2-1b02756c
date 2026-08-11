import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Free-gift choices offered to referred customers at checkout. Sourced from
// referral_gift_options (anon SELECT allowed on active rows), joined to products
// for the name and to the PUBLIC view brands_public for a stored image. In this
// data model a product has many brand SKUs; the gift image is a representative
// brands_public.stored_image_url for the product (Supabase-hosted). We read
// brands_public (not brands) because the base brands table is RLS-restricted to
// admins — anon checkout users cannot read it, so a direct join returns no image.
// The storefront catalog uses brands_public for the same reason. We deliberately
// NEVER use products.image_url / image_url — those may be external/hotlinked URLs.

export interface ReferralGiftOption {
  productId: string;
  name: string;
  imageUrl: string | null;
  displayOrder: number;
}

export function useReferralGiftOptions(enabled: boolean) {
  return useQuery<ReferralGiftOption[]>({
    queryKey: ["referral-gift-options"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: opts, error } = await (supabase as any)
        .from("referral_gift_options")
        .select("product_id, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;

      const ids: string[] = (opts || [])
        .map((o: any) => o.product_id)
        .filter(Boolean);
      if (!ids.length) return [];

      const [prodRes, brandRes] = await Promise.all([
        (supabase as any).from("products").select("id, name").in("id", ids),
        (supabase as any)
          .from("brands_public")
          .select("product_id, stored_image_url")
          .in("product_id", ids)
          .not("stored_image_url", "is", null),
      ]);

      const nameById = new Map<string, string>();
      for (const p of prodRes.data || []) nameById.set(p.id, p.name);

      // First stored brand image per product is the representative gift image.
      const imageByProduct = new Map<string, string>();
      for (const b of brandRes.data || []) {
        if (b.product_id && b.stored_image_url && !imageByProduct.has(b.product_id)) {
          imageByProduct.set(b.product_id, b.stored_image_url);
        }
      }

      return (opts || [])
        .filter((o: any) => nameById.has(o.product_id))
        .map((o: any) => ({
          productId: o.product_id,
          name: nameById.get(o.product_id) || "Gift",
          imageUrl: imageByProduct.get(o.product_id) || null,
          displayOrder: o.display_order ?? 0,
        }));
    },
  });
}
