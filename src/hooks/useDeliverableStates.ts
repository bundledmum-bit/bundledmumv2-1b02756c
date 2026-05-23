import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DeliverableState {
  id: string;
  name: string;
  is_active: boolean;
  has_zones: boolean;
  is_express_only: boolean;
  note: string | null;
  display_order: number;
}

export function useDeliverableStates(activeOnly = false) {
  return useQuery({
    queryKey: ["deliverable-states", activeOnly],
    queryFn: async () => {
      let query = (supabase as any)
        .from("deliverable_states")
        .select("*")
        .order("display_order");
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as DeliverableState[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDeliverableState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (state: Partial<DeliverableState> & { id: string }) => {
      const { error } = await (supabase as any)
        .from("deliverable_states")
        .update({ ...state, updated_at: new Date().toISOString() })
        .eq("id", state.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliverable-states"] }),
  });
}

export function useCreateDeliverableState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; is_active?: boolean; is_express_only?: boolean; note?: string | null; display_order?: number }) => {
      const { error } = await (supabase as any)
        .from("deliverable_states")
        .insert({
          name: input.name,
          is_active: input.is_active ?? false,
          is_express_only: input.is_express_only ?? false,
          note: input.note ?? null,
          display_order: input.display_order ?? 99,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliverable-states"] }),
  });
}

export function useDeleteDeliverableState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("deliverable_states")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliverable-states"] }),
  });
}
