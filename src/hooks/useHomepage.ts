import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface HomepageSection {
  id: string;
  section_key: string;
  section_label: string;
  title: string | null;
  subtitle: string | null;
  is_visible: boolean;
  display_order: number;
  settings: Record<string, any> | null;
  custom_data: Record<string, any> | null;
}

export interface Testimonial {
  id: string;
  customer_name: string;
  customer_city: string;
  customer_location: string | null;
  customer_initial: string | null;
  avatar_url: string | null;
  quote: string;
  rating: number;
  product_context: string | null;
  is_verified_purchase: boolean;
  is_featured: boolean;
  is_active: boolean;
  display_order: number;
}

export interface HowItWorksStep {
  id: string;
  step_number: number;
  icon: string;
  title: string;
  description: string;
  is_active: boolean;
  display_order: number;
}

export interface TrustSignal {
  id: string;
  icon: string;
  label: string;
  sublabel: string | null;
  is_active: boolean;
  display_order: number;
}

export interface SpendThreshold {
  id: string;
  threshold_type: string;
  label: string;
  amount: number; // ₦ (not kobo — the existing schema stores in naira)
  reward_description: string | null;
  applies_to_zones: string[] | null;
  is_active: boolean;
  display_order: number;
}

export interface CrossSellRule {
  id: string;
  rule_name: string;
  trigger_type: "always" | "bundle_item" | "category" | string;
  trigger_value: string | null;
  product_ids: string[] | null;
  product_category: string | null;
  heading: string;
  max_items: number;
  is_active: boolean;
  display_order: number;
}

// -----------------------------------------------------------------------------
// Public queries (storefront)
// -----------------------------------------------------------------------------

export function useHomepageSections() {
  return useQuery({
    queryKey: ["homepage-sections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("homepage_sections")
        .select("*")
        .eq("is_visible", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as HomepageSection[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useFeaturedProducts() {
  return useQuery({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("*, brands:brands_public(*)")
        .eq("is_featured", true)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("featured_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });
}

export function useBestsellers() {
  return useQuery({
    queryKey: ["bestsellers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("*, brands:brands_public(*)")
        .eq("is_bestseller", true)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("featured_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });
}

export function useTestimonialsList() {
  return useQuery({
    queryKey: ["public-testimonials"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("testimonials")
        .select("*")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("display_order");
      if (error) throw error;
      return (data || []) as Testimonial[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useHowItWorksSteps() {
  return useQuery({
    queryKey: ["how-it-works-steps"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("how_it_works_steps")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as HowItWorksStep[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useTrustSignals() {
  return useQuery({
    queryKey: ["trust-signals"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("trust_signals")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as TrustSignal[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSpendThresholdsList() {
  return useQuery({
    queryKey: ["spend-thresholds"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("spend_thresholds")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as SpendThreshold[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCrossSellRules() {
  return useQuery({
    queryKey: ["cross-sell-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cross_sell_rules")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as CrossSellRule[];
    },
    staleTime: 5 * 60_000,
  });
}

// -----------------------------------------------------------------------------
// Admin queries (include inactive / reordering)
// -----------------------------------------------------------------------------

export function useAllHomepageSections() {
  return useQuery({
    queryKey: ["admin-homepage-sections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("homepage_sections")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return (data || []) as HomepageSection[];
    },
  });
}

export function useUpdateHomepageSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<HomepageSection> & { id: string }) => {
      const { error } = await (supabase as any)
        .from("homepage_sections")
        .update({ ...s, updated_at: new Date().toISOString() })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-homepage-sections"] });
      qc.invalidateQueries({ queryKey: ["homepage-sections"] });
    },
  });
}

export function useAllTestimonials() {
  return useQuery({
    queryKey: ["admin-testimonials"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("testimonials")
        .select("*")
        .is("deleted_at", null)
        .order("display_order");
      if (error) throw error;
      return (data || []) as Testimonial[];
    },
  });
}

export function useUpsertTestimonial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<Testimonial>) => {
      const body = { ...t, updated_at: new Date().toISOString() };
      if ((t as any).id) {
        const { error } = await (supabase as any).from("testimonials").update(body).eq("id", (t as any).id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("testimonials").insert(body);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      qc.invalidateQueries({ queryKey: ["public-testimonials"] });
    },
  });
}

export function useDeleteTestimonial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("testimonials")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      qc.invalidateQueries({ queryKey: ["public-testimonials"] });
    },
  });
}

export function useAllTrustSignals() {
  return useQuery({
    queryKey: ["admin-trust-signals"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("trust_signals").select("*").order("display_order");
      if (error) throw error;
      return (data || []) as TrustSignal[];
    },
  });
}

export function useUpsertTrustSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<TrustSignal>) => {
      if ((t as any).id) {
        const { error } = await (supabase as any).from("trust_signals").update(t).eq("id", (t as any).id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("trust_signals").insert(t);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-trust-signals"] });
      qc.invalidateQueries({ queryKey: ["trust-signals"] });
    },
  });
}

export function useDeleteTrustSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("trust_signals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-trust-signals"] });
      qc.invalidateQueries({ queryKey: ["trust-signals"] });
    },
  });
}

export function useAllSpendThresholds() {
  return useQuery({
    queryKey: ["admin-spend-thresholds"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("spend_thresholds").select("*").order("display_order");
      if (error) throw error;
      return (data || []) as SpendThreshold[];
    },
  });
}

export function useUpsertSpendThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<SpendThreshold>) => {
      const body = { ...t, updated_at: new Date().toISOString() };
      if ((t as any).id) {
        const { error } = await (supabase as any).from("spend_thresholds").update(body).eq("id", (t as any).id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("spend_thresholds").insert(body);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-spend-thresholds"] });
      qc.invalidateQueries({ queryKey: ["spend-thresholds"] });
    },
  });
}

export function useAllHowItWorksSteps() {
  return useQuery({
    queryKey: ["admin-how-it-works"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("how_it_works_steps").select("*").order("display_order");
      if (error) throw error;
      return (data || []) as HowItWorksStep[];
    },
  });
}

export function useUpsertHowItWorksStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<HowItWorksStep>) => {
      const body = { ...s, updated_at: new Date().toISOString() };
      if ((s as any).id) {
        const { error } = await (supabase as any).from("how_it_works_steps").update(body).eq("id", (s as any).id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("how_it_works_steps").insert(body);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-how-it-works"] });
      qc.invalidateQueries({ queryKey: ["how-it-works-steps"] });
    },
  });
}

export function useDeleteHowItWorksStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("how_it_works_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-how-it-works"] });
      qc.invalidateQueries({ queryKey: ["how-it-works-steps"] });
    },
  });
}

// Featured / Bestseller toggles on the products table.
export function useToggleProductFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; is_featured?: boolean; is_bestseller?: boolean; featured_order?: number | null; badge_label?: string | null }) => {
      const { id, ...rest } = payload;
      const { error } = await (supabase as any).from("products").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["featured-products"] });
      qc.invalidateQueries({ queryKey: ["bestsellers"] });
    },
  });
}
