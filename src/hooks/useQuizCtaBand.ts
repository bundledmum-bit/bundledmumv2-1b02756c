import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The "Build My List" band under the hero, driven entirely by the
 * homepage_sections row with section_key = 'quiz_cta_band'.
 *
 * Every string is the database's. Nothing here falls back to hardcoded copy:
 * a missing or unreadable row renders nothing at all, because an invisible
 * band is harmless while a band showing stale invented copy is not.
 *
 * This deliberately reads ONE row rather than wiring the whole homepage to
 * homepage_sections — PrototypeHome's other sections are hardcoded JSX and
 * rewiring them is a separate job.
 */
export interface QuizCtaBand {
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  emphasis: string | null;
}

export function useQuizCtaBand() {
  const query = useQuery({
    queryKey: ["homepage-section", "quiz_cta_band"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<QuizCtaBand | null> => {
      const { data, error } = await (supabase as any)
        .from("homepage_sections")
        .select("title, subtitle, is_visible, settings")
        .eq("section_key", "quiz_cta_band")
        .eq("is_visible", true)
        .maybeSingle();
      if (error) {
        console.warn("[QuizCtaBand] fetch failed:", error.message);
        return null;
      }
      if (!data) return null; // row missing, or is_visible = false
      const settings = (data.settings || {}) as Record<string, any>;
      return {
        title: data.title ?? null,
        subtitle: data.subtitle ?? null,
        ctaLabel: settings.cta_label ?? null,
        ctaUrl: settings.cta_url ?? null,
        emphasis: settings.emphasis ?? null,
      };
    },
  });

  return { band: query.data ?? null };
}
