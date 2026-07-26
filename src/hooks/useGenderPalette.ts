import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The colour palette offered for a gender. Six colours, identical for every
 * product, so this is fetched ONCE per gender and shared by the whole results
 * page — never per product.
 */
export interface PaletteColor {
  name: string;
  hex: string;
  default_selected: boolean;
  display_order: number;
}

export function useGenderPalette(gender: string | null) {
  const key = gender === "boy" || gender === "girl" ? gender : "neutral";
  const query = useQuery({
    queryKey: ["gender_color_palette", key],
    // Nothing to show until she has picked a gender.
    enabled: !!gender,
    // The palette is static reference data; keep it for the session.
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_gender_color_palette", {
        p_gender: key,
      });
      if (error) throw error;
      const colors = ((data as any)?.colors || []) as PaletteColor[];
      return colors
        .slice()
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    },
  });

  return {
    palette: query.data ?? [],
    isLoading: query.isLoading,
  };
}

/** Hex for a colour name, so a swatch can be drawn anywhere the name is known. */
export function hexFor(palette: PaletteColor[], name: string | null | undefined): string | null {
  if (!name) return null;
  return palette.find((c) => c.name === name)?.hex ?? null;
}
